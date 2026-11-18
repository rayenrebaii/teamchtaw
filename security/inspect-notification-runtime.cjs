// Read-only operator diagnostics. Outputs configuration booleans only, never secrets.
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const req = createRequire(path.resolve(__dirname, '../chtaw-team-backend/package.json'));
const yaml = req('js-yaml');
async function main() {
  const config = yaml.load(fs.readFileSync(path.join(process.env.USERPROFILE, '.render/cli.yaml'), 'utf8'));
  if (!config.api?.key) throw Error('Operator access unavailable.');
  const get = async route => {
    const response = await fetch('https://api.render.com/v1' + route, { headers: { Authorization: `Bearer ${config.api.key}`, Accept: 'application/json' }, signal: AbortSignal.timeout(30000) });
    if (!response.ok) throw Error('Runtime inspection failed: ' + response.status);
    return response.json();
  };
  const id = 'srv-dbo8v2u7bikc73895mhg';
  const service = await get('/services/' + id);
  const rows = await get('/services/' + id + '/env-vars?limit=100');
  const env = Object.fromEntries(rows.map(row => { const item = row.envVar ?? row; return [item.key, item.value]; }));
  console.log(JSON.stringify({ service: service.name, plan: service.serviceDetails?.plan, suspended: service.suspended,
    pushConfigured: ['VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY', 'VAPID_SUBJECT'].every(key => !!env[key]),
    productionMode: env.NODE_ENV === 'production', timezone: env.NOTIFICATION_TIMEZONE || 'Africa/Tunis' }));
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
