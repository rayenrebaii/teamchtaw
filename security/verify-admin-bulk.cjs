// Browser-only fixtures. Every business API and WebSocket is intercepted.
const path = require('node:path');
const fs = require('node:fs');
const { createRequire } = require('node:module');
const { spawn, spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const req = createRequire(path.join(root, 'chtaw-team-pwa/package.json'));
const { chromium } = req('@playwright/test');
const safety = require('../chtaw-team-backend/scripts/test-safety.cjs');
const local = process.argv.includes('--local');
const base = local ? 'http://127.0.0.1:3314' : 'https://teamchtaw-pwa.vercel.app';
const output = path.join(root, '.test-browser-results/admin-bulk');
const admin = { id: '00000000-0000-4000-8000-000000000001', firstName: 'Admin', lastName: 'Preview', email: 'admin@ui.invalid', role: 'ADMIN', status: 'APPROVED', emailVerified: true, joinedAt: '2026-01-01T00:00:00Z', bio: '' };
const members = [admin, ...Array.from({ length: 12 }, (_, i) => ({ ...admin, id: `00000000-0000-4000-8000-${String(i + 100).padStart(12, '0')}`, firstName: `Person${String(i).padStart(2, '0')}`, email: `person${i}@ui.invalid`, role: 'USER', status: i === 0 ? 'PENDING' : 'APPROVED', joinedAt: '2026-11-12T10:00:00Z' }))];
const general = { id: '00000000-0000-4000-8000-000000000010', name: 'General preview', isGeneral: true, memberIds: [admin.id], color: '#a78bfa', description: '' };
const privateGroup = { ...general, id: '00000000-0000-4000-8000-000000000011', name: 'Private preview', isGeneral: false };
const fixtures = Array.from({ length: 12 }, (_, i) => ({ id: `request-${i}`, status: 'PENDING', createdAt: '2026-11-12T10:00:00Z', group: { id: privateGroup.id, name: privateGroup.name }, user: { ...members[i + 1], role: i % 2 ? 'COLLABORATOR' : 'USER' } }));
async function main() {
  let server, browser;
  try {
    if (local) {
      await new Promise((resolve, reject) => {
        const probe = require('node:net').createServer(); probe.once('error', reject);
        probe.listen(3314, '127.0.0.1', () => probe.close(resolve));
      });
      const serverEnv = { ...safety.makeTestEnvironment(), NODE_ENV: 'production', NEXT_PUBLIC_API_URL: 'https://api.example.invalid/api/v1', NEXT_PUBLIC_SOCKET_URL: 'https://api.example.invalid' };
      server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '--hostname', '127.0.0.1', '--port', '3314'], { cwd: path.join(root, 'chtaw-team-pwa'), env: serverEnv, stdio: 'ignore', windowsHide: true });
      let ready = false;
      for (let i = 0; i < 40; i++) {
        if (server.exitCode !== null) throw Error('Owned local server stopped.');
        try { if ((await fetch(base + '/login')).ok) { ready = true; break; } } catch {}
        await new Promise(resolve => setTimeout(resolve, 250));
      }
      if (!ready) throw Error('Owned local server did not start.');
    }
    fs.mkdirSync(output, { recursive: true });
    browser = await chromium.launch({ channel: 'msedge', headless: true });
    for (const width of [1440, 390]) {
      let requests = [...fixtures], group = { ...privateGroup }, currentMembers = [...members];
      const reviewed = [], additions = [], errors = [];
      const context = await browser.newContext({ viewport: { width, height: 1000 }, serviceWorkers: 'block' });
      await context.addInitScript(() => { localStorage.setItem('chtaw-language', 'fr'); localStorage.setItem('chtaw-theme', 'dark'); delete Object.getPrototypeOf(navigator).serviceWorker; });
      const page = await context.newPage(); page.setDefaultTimeout(15000);
      page.on('pageerror', error => errors.push(error.name));
      await page.routeWebSocket('**/*', socket => socket.close());
      await page.route('**/*', route => new URL(route.request().url()).origin === base ? route.continue() : route.abort());
      await page.route('**/api/v1/**', route => {
        const request = route.request(), pathname = new URL(request.url()).pathname.replace(/^\/api\/v1/, '');
        let data = { items: [], nextCursor: null, unreadCount: 0 };
        if (pathname === '/auth/refresh') data = { accessToken: 'ui-fixture-not-a-jwt', expiresIn: 900, userId: admin.id, sessionId: 'ui-fixture' };
        else if (pathname === '/auth/me') data = admin;
        else if (pathname === '/groups') data = [general, group];
        else if (pathname === '/groups/join-requests') data = requests;
        else if (pathname.startsWith('/groups/join-requests/') && request.method() === 'PATCH') { const id = pathname.split('/').at(-1); reviewed.push(id); requests = requests.filter(item => item.id !== id); data = {}; }
        else if (pathname.startsWith('/groups/' + group.id + '/members/') && request.method() === 'PUT') { const id = pathname.split('/').at(-1); additions.push(id); group = { ...group, memberIds: [...group.memberIds, id] }; data = group; }
        else if (pathname.startsWith('/approvals/') && request.method() === 'PATCH') { const id = pathname.split('/').at(-1); currentMembers = currentMembers.map(item => item.id === id ? { ...item, status: 'APPROVED' } : item); data = currentMembers.find(item => item.id === id); }
        else if (pathname === '/users') data = { items: currentMembers, nextCursor: null };
        else if (pathname === '/admin/stats') data = { totalUsers: currentMembers.length, pendingUsers: 1, approvedUsers: 12, groups: 2, messages: 0, polls: 0 };
        else if (pathname === '/notifications/push-config') data = { enabled: false, publicKey: '' };
        else if (pathname === '/notifications/preferences') data = { enabled: false, messagesEnabled: false, pollsEnabled: false };
        else if (pathname === '/notifications/subscriptions') data = [];
        else if (request.method() !== 'GET' && request.method() !== 'OPTIONS') throw Error('Unexpected intercepted mutation.');
        return route.fulfill({ status: request.method() === 'OPTIONS' ? 204 : 200, headers: { 'Access-Control-Allow-Origin': base, 'Access-Control-Allow-Credentials': 'true', 'Access-Control-Allow-Headers': 'Authorization, Content-Type', 'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS' }, contentType: 'application/json', body: JSON.stringify(data) });
      });
      await page.goto(base + '/admin/groups', { waitUntil: 'domcontentloaded' });
      await page.getByRole('button', { name: 'Demandes d’adhésion', exact: true }).click();
      const dialog = page.getByRole('dialog', { name: 'Demandes d’adhésion aux groupes', exact: true });
      await dialog.getByText('Page 1 sur 2', { exact: true }).waitFor();
      await dialog.getByRole('button', { name: 'Suivant', exact: true }).click();
      await dialog.getByText('Page 2 sur 2', { exact: true }).waitFor();
      await dialog.getByLabel('Rôle', { exact: false }).selectOption('COLLABORATOR');
      await dialog.getByLabel('E-mail', { exact: true }).fill('person11@');
      await dialog.getByRole('checkbox', { name: 'Sélectionner les demandes de cette page', exact: true }).check();
      await page.screenshot({ path: path.join(output, `${local ? 'local' : 'production'}-requests-${width}.png`), fullPage: true });
      await dialog.getByRole('button', { name: 'Accepter la sélection', exact: true }).click();
      await dialog.getByText('Aucune demande ne correspond aux filtres.', { exact: true }).waitFor();
      if (reviewed.length !== 1 || reviewed[0] !== 'request-11') throw Error('Wrong bulk request target.');
      if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)) throw Error('Request dialog overflow.');
      await dialog.getByRole('button', { name: 'Fermer', exact: true }).click();
      await page.goto(base + '/admin/users', { waitUntil: 'domcontentloaded' });
      await page.getByRole('searchbox').fill('Person0');
      await page.getByRole('checkbox', { name: 'Sélectionner Person00 Preview', exact: true }).check();
      await page.getByRole('checkbox', { name: 'Sélectionner Person01 Preview', exact: true }).check();
      await page.getByRole('button', { name: 'Bannir (1)', exact: true }).click();
      const ban = page.getByRole('dialog', { name: 'Bannir les membres sélectionnés', exact: true });
      await ban.getByText(/irréversible/).waitFor();
      await ban.getByRole('button', { name: 'Annuler', exact: true }).click();
      await page.getByRole('button', { name: 'Ajouter au groupe (1)', exact: true }).click();
      const assignment = page.getByRole('dialog', { name: 'Ajouter les membres sélectionnés au groupe', exact: true });
      await assignment.locator('select').selectOption(privateGroup.id);
      await assignment.getByRole('button', { name: 'Confirmer pour 1 membre(s)', exact: true }).click();
      await page.getByText('1 opération(s) réussie(s)', { exact: true }).waitFor();
      if (additions.length !== 1 || additions[0] !== members[2].id) throw Error('Wrong bulk assignment target.');
      await page.screenshot({ path: path.join(output, `${local ? 'local' : 'production'}-members-${width}.png`), fullPage: true });
      if (errors.length || await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)) throw Error('Page error or member overflow.');
      console.log(JSON.stringify({ base, width, requests: 'dialog, filters, pagination and selection verified', members: 'selection, ban confirmation and group assignment verified', pageErrors: 0, overflow: false, productionBusinessMutations: 0 }));
      await context.close();
    }
  } finally {
    await browser?.close();
    if (server && server.exitCode === null) {
      if (process.platform === 'win32') spawnSync('taskkill', ['/PID', String(server.pid), '/T', '/F'], { env: safety.systemEnvironment(), stdio: 'ignore', windowsHide: true });
      else server.kill('SIGTERM');
    }
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
