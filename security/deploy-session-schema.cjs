// Operator-only release procedure. Not imported by application, builds or tests.
// Reads the Render operator credential; application secrets never leave memory/child environment.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { createRequire } = require('node:module');
const { spawn, execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const backend = path.join(root, 'chtaw-team-backend');
const req = createRequire(path.join(backend, 'package.json'));
const { Client } = req('pg');
const yaml = req('js-yaml');
const safety = require('../chtaw-team-backend/scripts/test-safety.cjs');
const system = safety.systemEnvironment();
const migration = '202611110001_session_archives';
const sqlPath = path.join(backend, 'prisma/migrations', migration, 'migration.sql');
const digest = value => crypto.createHash('sha256').update(value).digest('hex');
const dockerHost = 'npipe:////./pipe/docker_engine';
const quote = value => '"' + value.replaceAll('"', '""') + '"';
function command(executable, args, { env = system, cwd = root, input, timeout = 180000 } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, { env, cwd, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    const out = [];
    const timer = setTimeout(() => { child.kill(); reject(Error('Operator subprocess timed out (details withheld).')); }, timeout);
    child.stdout.on('data', data => out.push(data));
    child.stderr.on('data', () => {}); // Never forward errors that might contain connection information.
    child.on('error', () => { clearTimeout(timer); reject(Error('Operator subprocess could not start.')); });
    child.on('close', code => { clearTimeout(timer); code === 0 ? resolve(Buffer.concat(out)) : reject(Error('Operator subprocess failed (details withheld).')); });
    child.stdin.on('error', () => {});
    child.stdin.end(input);
  });
}
const docker = (args, options) => command('docker', ['--host', dockerHost, ...args], options);
async function database() {
  const config = yaml.load(fs.readFileSync(path.join(process.env.USERPROFILE, '.render/cli.yaml'), 'utf8'));
  if (!config.api?.key) throw Error('Render operator credential unavailable.');
  const response = await fetch('https://api.render.com/v1/services/srv-dbo8v2u7bikc73895mhg/env-vars?limit=100', {
    headers: { Authorization: `Bearer ${config.api.key}`, Accept: 'application/json' }, signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) throw Error(`Render configuration read failed (${response.status}).`);
  const records = await response.json();
  const direct = records.map(item => item.envVar ?? item).find(item => item.key === 'DATABASE_DIRECT_URL')?.value;
  if (!direct) throw Error('Production direct database connection is missing.');
  const url = new URL(direct);
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || !url.hostname.endsWith('.neon.tech') || url.hostname.includes('-pooler.'))
    throw Error('Unexpected production database destination; migration stopped.');
  url.searchParams.set('sslmode', 'verify-full');
  return { connection: url.toString(), fingerprint: digest(url.hostname + url.pathname), url };
}
async function inventory(client, tables) {
  const result = {};
  for (const table of tables) {
    const rows = await client.query(`SELECT (to_jsonb(t)-'archivedAt')::text AS row FROM ${quote(table)} t ORDER BY (to_jsonb(t)-'archivedAt')::text`);
    result[table] = { count: rows.rowCount, hash: digest(rows.rows.map(row => row.row).join('\n')) };
  }
  return result;
}
async function state(client) {
  const rows = (await client.query('SELECT migration_name, finished_at, rolled_back_at FROM "_prisma_migrations" ORDER BY started_at')).rows;
  if (rows.some(row => !row.finished_at && !row.rolled_back_at)) throw Error('An incomplete database migration requires review.');
  const applied = rows.filter(row => row.finished_at && !row.rolled_back_at).map(row => row.migration_name);
  const local = fs.readdirSync(path.join(backend, 'prisma/migrations'), { withFileTypes: true }).filter(row => row.isDirectory()).map(row => row.name);
  if (applied.some(name => !local.includes(name))) throw Error('Production contains an unknown migration.');
  const pending = local.filter(name => !applied.includes(name));
  if (pending.some(name => name !== migration)) throw Error('Unexpected pending migration; release stopped.');
  return { applied: applied.length, pending };
}
async function main() {
  const mode = process.argv[2] || 'inspect';
  if (!['inspect', 'backup', 'apply'].includes(mode)) throw Error('Unknown release mode.');
  const head = execFileSync('git', ['-c', `safe.directory=${root.replaceAll('\\', '/')}`, 'rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
  const release = process.argv[3];
  if (mode !== 'inspect' && (!/^[a-f0-9]{40}$/.test(release || '') || release !== head)) throw Error('Exact reviewed release HEAD required.');
  const db = await database();
  const client = new Client({ connectionString: db.connection, connectionTimeoutMillis: 45000 });
  await client.connect();
  try {
    const migrationState = await state(client);
    const tables = (await client.query("SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename <> '_prisma_migrations' ORDER BY tablename")).rows.map(row => row.tablename);
    if (mode === 'inspect') {
      console.log(JSON.stringify({ destination: 'production Neon via Render operator access', ...migrationState, businessTables: tables.length, postgresMajor: (await client.query('SHOW server_version_num')).rows[0].server_version_num.slice(0, 2) }));
      return;
    }
    const directory = path.join(process.env.LOCALAPPDATA, 'ChtawTeam', 'release-backups', release);
    const reportPath = path.join(directory, 'verification.json');
    if (mode === 'backup') {
      if (fs.existsSync(reportPath)) throw Error('An existing release backup will not be overwritten.');
      fs.mkdirSync(directory, { recursive: true });
      console.log('Taking a consistent database snapshot; no business data will be printed.');
      await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
      const snapshot = (await client.query('SELECT pg_export_snapshot() AS id')).rows[0].id;
      const before = await inventory(client, tables);
      const pgEnv = { ...system, PGHOST: db.url.hostname, PGPORT: db.url.port || '5432', PGUSER: decodeURIComponent(db.url.username), PGPASSWORD: decodeURIComponent(db.url.password), PGDATABASE: decodeURIComponent(db.url.pathname.slice(1)), PGSSLMODE: 'verify-full', PGSSLROOTCERT: '/etc/ssl/certs/ca-certificates.crt' };
      const dump = await docker(['run', '--rm', '--pull=never', '--env', 'PGHOST', '--env', 'PGPORT', '--env', 'PGUSER', '--env', 'PGPASSWORD', '--env', 'PGDATABASE', '--env', 'PGSSLMODE', '--env', 'PGSSLROOTCERT', 'postgres:18-alpine', 'pg_dump', '--format=custom', '--no-owner', '--no-acl', '--snapshot=' + snapshot], { env: pgEnv });
      await client.query('COMMIT');
      const key = crypto.randomBytes(32), iv = crypto.randomBytes(12);
      const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
      const encrypted = Buffer.concat([cipher.update(dump), cipher.final()]);
      const powershell = path.join(process.env.SYSTEMROOT, 'System32/WindowsPowerShell/v1.0/powershell.exe');
      const protect = 'Add-Type -AssemblyName System.Security; $data=[Convert]::FromBase64String([Console]::In.ReadToEnd()); [Console]::Out.Write([Convert]::ToBase64String([Security.Cryptography.ProtectedData]::Protect($data,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser)))';
      const wrapped = (await command(powershell, ['-NoProfile', '-NonInteractive', '-Command', protect], { input: key.toString('base64') })).toString().trim();
      fs.writeFileSync(path.join(directory, 'database.dump.aes'), encrypted, { flag: 'wx' });
      fs.writeFileSync(path.join(directory, 'key.dpapi.json'), JSON.stringify({ algorithm: 'aes-256-gcm', iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), wrappedKey: wrapped }), { flag: 'wx' });
      key.fill(0);
      console.log('Encrypted backup saved outside OneDrive. Verifying restoration in an isolated RAM-backed PostgreSQL.');
      const container = 'chtaw-release-restore-' + crypto.randomBytes(6).toString('hex');
      const password = crypto.randomBytes(32).toString('hex');
      const name = 'chtaw_restore_' + crypto.randomBytes(6).toString('hex');
      let started = false, restored;
      try {
        await docker(['run', '--detach', '--rm', '--pull=never', '--name', container, '--tmpfs', '/var/lib/postgresql:rw,size=512m', '--publish', '127.0.0.1::5432', '--env', 'POSTGRES_PASSWORD', '--env', 'POSTGRES_USER=chtaw_restore', '--env', 'POSTGRES_DB=' + name, 'postgres:18-alpine'], { env: { ...system, POSTGRES_PASSWORD: password } });
        started = true;
        const binding = (await docker(['port', container, '5432/tcp'])).toString().trim();
        if (!/^127\.0\.0\.1:\d+$/.test(binding)) throw Error('Unexpected isolated restore binding.');
        let ready = false;
        for (let attempt = 0; attempt < 60; attempt++) {
          const probe = new Client({ host: '127.0.0.1', port: Number(binding.split(':')[1]), user: 'chtaw_restore', password, database: name, connectionTimeoutMillis: 1000 });
          probe.on('error', () => {});
          try { await probe.connect(); await probe.query('SELECT 1'); ready = true; }
          catch {} finally { await probe.end().catch(() => {}); }
          if (ready) break;
          await new Promise(resolve => setTimeout(resolve, 500));
        }
        if (!ready) throw Error('Isolated restoration server did not start.');
        // Verify the encrypted artifact, not just the original dump held in memory.
        const unprotect = 'Add-Type -AssemblyName System.Security; $data=[Convert]::FromBase64String([Console]::In.ReadToEnd()); [Console]::Out.Write([Convert]::ToBase64String([Security.Cryptography.ProtectedData]::Unprotect($data,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser)))';
        const unwrapped = Buffer.from((await command(powershell, ['-NoProfile', '-NonInteractive', '-Command', unprotect], { input: wrapped })).toString().trim(), 'base64');
        const decipher = crypto.createDecipheriv('aes-256-gcm', unwrapped, iv); decipher.setAuthTag(cipher.getAuthTag());
        const restoredDump = Buffer.concat([decipher.update(fs.readFileSync(path.join(directory, 'database.dump.aes'))), decipher.final()]);
        unwrapped.fill(0);
        if (digest(restoredDump) !== digest(dump)) throw Error('Encrypted backup integrity check failed.');
        await docker(['exec', '-i', container, 'pg_restore', '--exit-on-error', '--no-owner', '--no-acl', '--username=chtaw_restore', '--dbname=' + name], { input: restoredDump });
        const verification = new Client({ host: '127.0.0.1', port: Number(binding.split(':')[1]), user: 'chtaw_restore', password, database: name });
        await verification.connect();
        try { restored = await inventory(verification, tables); } finally { await verification.end(); }
        if (JSON.stringify(before) !== JSON.stringify(restored)) throw Error('Restored business data does not match the source snapshot.');
        fs.writeFileSync(reportPath, JSON.stringify({ release, createdAt: new Date().toISOString(), databaseFingerprint: db.fingerprint, migrationChecksum: digest(fs.readFileSync(sqlPath)), encryptedSha256: digest(encrypted), dumpSha256: digest(dump), restorationVerified: true, tables: before }, null, 2), { flag: 'wx' });
        dump.fill(0); restoredDump.fill(0);
        console.log(JSON.stringify({ backup: 'encrypted and restoration verified', tables: tables.length, rows: Object.values(before).reduce((sum, row) => sum + row.count, 0), directory }));
      } finally { if (started) await docker(['stop', container]); }
      return;
    }
    const proof = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
    if (proof.release !== release || proof.databaseFingerprint !== db.fingerprint || proof.migrationChecksum !== digest(fs.readFileSync(sqlPath)) || proof.restorationVerified !== true)
      throw Error('Verified backup does not match this release and destination.');
    if (migrationState.pending.length === 0) { console.log(JSON.stringify({ migration, alreadyApplied: true })); return; }
    const before = await inventory(client, tables);
    const env = { ...system, NODE_ENV: 'production', DATABASE_URL: db.connection, DATABASE_DIRECT_URL: db.connection, DOTENV_CONFIG_PATH: path.join(directory, 'unused-no-dotenv') };
    console.log('Applying the single reviewed additive migration through Prisma; existing rows will be verified.');
    await command(process.execPath, ['node_modules/prisma/build/index.js', 'migrate', 'deploy'], { cwd: backend, env });
    const after = await inventory(client, tables);
    const unchanged = tables.every(table => JSON.stringify(before[table]) === JSON.stringify(after[table]));
    const complete = await state(client);
    const result = { release, migration, applied: complete.pending.length === 0, existingDataUnchanged: unchanged, tables: tables.length, completedAt: new Date().toISOString() };
    fs.writeFileSync(path.join(directory, 'migration-result.json'), JSON.stringify(result, null, 2), { flag: 'wx' });
    console.log(JSON.stringify(result));
    if (!unchanged) throw Error('Rows changed during migration; inspect legitimate concurrent activity before deploying code.');
  } finally { await client.query('ROLLBACK').catch(() => {}); await client.end(); }
}
main().catch(() => { console.error('Session schema release stopped (connection details withheld). No reset, seed or production restore was attempted.'); process.exitCode = 1; });
