// Browser fixtures intercept business APIs; never authenticates to a real account.
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const net = require('node:net');
const safety = require('../chtaw-team-backend/scripts/test-safety.cjs');
const cwd = path.resolve(__dirname, '../chtaw-team-pwa');
const published = process.argv[2] === 'production';
const env = { ...safety.makeTestEnvironment(), ...(published ? { NOTIFICATIONS_PUBLISHED_UI: '1' } : {}) };
let server;
async function main() {
  if (!published) {
    await new Promise((resolve, reject) => {
      const probe = net.createServer(); probe.once('error', () => reject(Error('Preview port already in use.')));
      probe.listen(3126, '127.0.0.1', () => probe.close(resolve));
    });
    server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '--hostname', '127.0.0.1', '--port', '3126'], { cwd, env: { ...env, NODE_ENV: 'production', NEXT_PUBLIC_API_URL: 'https://api.example.invalid/api/v1', NEXT_PUBLIC_SOCKET_URL: 'https://api.example.invalid' }, windowsHide: true, stdio: ['ignore', 'inherit', 'inherit'] });
    let ready = false;
    for (let attempt = 0; attempt < 60; attempt++) {
      if (server.exitCode !== null) throw Error('Owned preview could not start.');
      try { if ((await fetch('http://127.0.0.1:3126/login')).ok) { ready = true; break; } } catch {}
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    if (!ready) throw Error('Owned preview did not become ready.');
  }
  await new Promise((resolve, reject) => {
    const test = spawn(process.execPath, ['node_modules/@playwright/test/cli.js', 'test', '--config', 'playwright.notifications.config.ts'], { cwd, env, windowsHide: true, stdio: 'inherit' });
    test.once('error', () => reject(Error('UI verification could not start.')));
    test.once('exit', code => code === 0 ? resolve() : reject(Error('UI verification failed.')));
  });
}
main().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(() => {
  if (server?.pid && server.exitCode === null) spawnSync('taskkill', ['/PID', String(server.pid), '/T', '/F'], { env: safety.systemEnvironment(), stdio: 'ignore', windowsHide: true });
});
