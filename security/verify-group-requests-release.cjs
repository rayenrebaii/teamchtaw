// Published UI assets with fully intercepted business APIs and fictional identities.
// No real login, account creation, group request or session is sent to production.
const path = require('node:path');
const fs = require('node:fs');
const { spawn, spawnSync } = require('node:child_process');
const { createRequire } = require('node:module');
const req = createRequire(path.resolve(__dirname, '../chtaw-team-pwa/package.json'));
const { chromium } = req('@playwright/test');
const safety = require('../chtaw-team-backend/scripts/test-safety.cjs');
const local = process.argv.includes('--local');
const base = local ? 'http://127.0.0.1:3314' : 'https://teamchtaw-pwa.vercel.app';
const output = path.resolve(__dirname, '../.test-browser-results/group-discovery');
const groupId = '00000000-0000-4000-8000-000000000010';
const privateId = '00000000-0000-4000-8000-000000000011';
async function main() {
  let server, browser;
  try {
    if (local) {
      await new Promise((resolve, reject) => { const probe = require('node:net').createServer(); probe.once('error', reject); probe.listen(3314, '127.0.0.1', () => probe.close(resolve)); });
      const env = { ...safety.makeTestEnvironment(), NODE_ENV: 'production', NEXT_PUBLIC_API_URL: 'https://api.example.invalid/api/v1', NEXT_PUBLIC_SOCKET_URL: 'https://api.example.invalid' };
      server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '--hostname', '127.0.0.1', '--port', '3314'], { cwd: path.resolve(__dirname, '../chtaw-team-pwa'), env, stdio: 'ignore', windowsHide: true });
      let ready = false;
      for (let i = 0; i < 40; i++) { if (server.exitCode !== null) throw Error('Owned local server stopped.'); try { if ((await fetch(base + '/login')).ok) { ready = true; break; } } catch {} await new Promise(resolve => setTimeout(resolve, 250)); }
      if (!ready) throw Error('Owned local server did not start.');
    }
    fs.mkdirSync(output, { recursive: true });
    browser = await chromium.launch({ channel: 'msedge', headless: true });
    for (const role of ['ADMIN', 'USER', 'COLLABORATOR']) for (const width of [1440, 390]) {
      const actor = { id: '00000000-0000-4000-8000-000000000001', firstName: 'Preview', lastName: 'Fixture', email: 'preview@ui.invalid', role, status: 'APPROVED', emailVerified: true, joinedAt: '2026-01-01T00:00:00Z', bio: '' };
      const group = { id: groupId, name: 'General preview', description: '', isGeneral: true, color: '#a78bfa', memberIds: [actor.id], members: [actor] };
      const collaborator = { ...actor, id: '00000000-0000-4000-8000-000000000002', firstName: 'Other', lastName: 'Collaborator', role: 'COLLABORATOR' };
      const roleGroup = { ...group, id: '00000000-0000-4000-8000-000000000012', name: 'Role preview', isGeneral: false, memberIds: [actor.id, collaborator.id], members: [actor, collaborator] };
      const sessionPoll = { id: '00000000-0000-4000-8000-000000000020', groupId: roleGroup.id, authorId: '00000000-0000-4000-8000-000000000004', question: 'Role session', type: 'SESSION', status: 'OPEN', singleChoice: true, votes: [], options: [{ id: 'session-option', label: 'Session option' }] };
      const ordinaryPoll = { ...sessionPoll, id: '00000000-0000-4000-8000-000000000021', question: 'Role ordinary', type: 'ORDINARY', options: [{ id: 'ordinary-option', label: 'Ordinary option' }] };
      const pollMessages = [sessionPoll, ordinaryPoll].map((poll, index) => ({ id: `00000000-0000-4000-8000-${String(index + 30).padStart(12, '0')}`, groupId: roleGroup.id, authorId: poll.authorId, author: { ...actor, id: poll.authorId, role: 'ADMIN' }, kind: 'poll', pollId: poll.id, poll, text: '', createdAt: '2026-11-12T10:00:00Z' }));
      let joinCalls = 0, reviewCalls = 0, contentReads = 0;
      const errors = [];
      const context = await browser.newContext({ viewport: { width, height: 1000 }, serviceWorkers: 'block' });
      await context.addInitScript(() => {
        localStorage.setItem('chtaw-language', 'fr');
        // Exercise online UI without a deliberately blocked SW registration notice.
        delete Object.getPrototypeOf(navigator).serviceWorker;
      });
      const page = await context.newPage(); page.setDefaultTimeout(20000);
      page.on('pageerror', error => errors.push(error.name));
      await page.routeWebSocket('**/*', socket => socket.close());
      await page.route('**/*', route => new URL(route.request().url()).origin === base ? route.continue() : route.abort());
      await page.route('**/api/v1/**', route => {
        const request = route.request(), pathname = new URL(request.url()).pathname.replace(/^\/api\/v1/, '');
        let data = { items: [], nextCursor: null, unreadCount: 0 };
        if (pathname.startsWith('/groups/' + privateId) && request.method() === 'GET') contentReads++;
        if (pathname === '/auth/refresh') data = { accessToken: 'ui-fixture-not-a-jwt', expiresIn: 900, userId: actor.id, sessionId: 'ui-fixture' };
        else if (pathname === '/auth/me') data = actor;
        else if (pathname === '/groups') data = [group, roleGroup];
        else if (pathname === '/groups/' + groupId) data = group;
        else if (pathname === '/groups/' + roleGroup.id) data = roleGroup;
        else if (pathname === '/groups/' + roleGroup.id + '/messages') data = { items: pollMessages, nextCursor: null };
        else if (pathname === '/polls') data = { items: role === 'COLLABORATOR' ? [ordinaryPoll] : [sessionPoll, ordinaryPoll], nextCursor: null };
        else if (pathname === '/groups/directory') data = [{ id: privateId, name: 'Private preview', isGeneral: false, isMember: false, requestStatus: joinCalls ? 'PENDING' : null }];
        else if (pathname === '/groups/' + privateId + '/join-requests' && request.method() === 'POST') { joinCalls++; data = { id: 'request', status: 'PENDING' }; }
        else if (pathname === '/groups/join-requests') data = reviewCalls ? [] : [{ id: 'request', status: 'PENDING', createdAt: '2026-11-12T10:00:00Z', group: { id: privateId, name: 'Private preview' }, user: { ...actor, role: 'COLLABORATOR' } }];
        else if (pathname === '/groups/join-requests/request' && request.method() === 'PATCH') { reviewCalls++; data = { status: 'APPROVED' }; }
        else if (pathname === '/organizer/participants') data = [];
        else if (pathname === '/users') data = { items: [actor], nextCursor: null };
        else if (pathname === '/admin/stats') data = { totalUsers: 1, pendingUsers: 0, approvedUsers: 1, groups: 1, messages: 0, polls: 0 };
        else if (pathname === '/notifications/push-config') data = { enabled: false, publicKey: '' };
        else if (pathname === '/notifications/preferences') data = { enabled: false, messagesEnabled: false, pollsEnabled: false };
        else if (pathname === '/notifications/subscriptions') data = [];
        else if (request.method() !== 'GET' && request.method() !== 'OPTIONS') throw Error('Unexpected intercepted mutation');
        return route.fulfill({ status: request.method() === 'OPTIONS' ? 204 : 200, headers: { 'Access-Control-Allow-Origin': base, 'Access-Control-Allow-Credentials': 'true', 'Access-Control-Allow-Headers': 'Authorization, Content-Type', 'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS' }, contentType: 'application/json', body: JSON.stringify(data) });
      });
      await page.goto(base + '/app', { waitUntil: 'domcontentloaded' });
      await page.getByRole('heading', { name: /Conversations/ }).waitFor();
      if (role !== 'ADMIN') {
        if (await page.getByRole('region', { name: 'Groupes disponibles', exact: true }).count()) throw Error('Group directory remains expanded in the sidebar');
        await page.getByRole('button', { name: 'Groupes disponibles', exact: true }).click();
        const directory = page.getByRole('dialog', { name: 'Groupes disponibles', exact: true });
        await directory.getByRole('searchbox').fill('private');
        await directory.getByText('Private preview', { exact: true }).waitFor();
        if (await directory.getByRole('link').count()) throw Error('Directory exposes a content link');
        await directory.getByRole('button', { name: 'Demander à rejoindre Private preview' }).click();
        await directory.getByText('Demande en attente', { exact: true }).waitFor();
        if (joinCalls !== 1 || contentReads) throw Error('Duplicate request or unauthorized content read');
        if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)) throw Error('Group discovery dialog overflow');
        await page.screenshot({ path: path.join(output, `${local ? 'local' : 'production'}-${role}-${width}.png`), fullPage: true });
        await directory.getByRole('button', { name: 'Fermer', exact: true }).click();
      }
      await page.goto(base + '/app/groups/' + groupId, { waitUntil: 'domcontentloaded' });
      await page.getByRole('heading', { name: group.name, exact: true }).waitFor();
      const session = page.getByRole('button', { name: 'Créer un sondage de séance', exact: true });
      if (role === 'USER') {
        if (await session.count()) throw Error('Session creation exposed to a client');
      } else {
        await session.click();
        const dialog = page.getByRole('dialog', { name: 'Créer un sondage de séance', exact: true });
        await dialog.waitFor();
        const selected = dialog.locator('select').first();
        if (!(await selected.isDisabled()) || await selected.inputValue() !== groupId) throw Error('Chat group not fixed');
        await dialog.getByLabel('Fin du créneau', { exact: true }).waitFor();
        await dialog.getByRole('button', { name: 'Fermer', exact: true }).click();
      }
      if (role === 'ADMIN') {
        await page.goto(base + '/admin/groups', { waitUntil: 'domcontentloaded' });
        await page.getByRole('button', { name: 'Demandes d’adhésion', exact: true }).click();
        const inbox = page.getByRole('region', { name: 'Demandes d’adhésion aux groupes', exact: true });
        await inbox.getByRole('button', { name: 'Accepter', exact: true }).click();
        await inbox.getByText('Demande acceptée. Le membre peut accéder au groupe.', { exact: true }).waitFor();
        if (reviewCalls !== 1) throw Error('Admin review not submitted exactly once');
      }
      await page.goto(base + '/app/profile', { waitUntil: 'domcontentloaded' });
      await page.getByRole('button', { name: 'Enregistrer mes modifications', exact: true }).waitFor();
      if ((await page.getByRole('link', { name: 'Mon historique de présence', exact: true }).count()) !== (role === 'USER' ? 1 : 0)) throw Error('Wrong personal attendance role');
      if (await page.getByRole('button', { name: 'Mon historique de présence', exact: true }).count()) throw Error('Organizer personal attendance button remains');
      await page.goto(base + '/app/groups/' + roleGroup.id, { waitUntil: 'domcontentloaded' });
      await page.getByRole('heading', { name: sessionPoll.question, exact: true }).waitFor();
      const sessionCard = page.locator('.poll-card').filter({ has: page.getByRole('heading', { name: sessionPoll.question, exact: true }) });
      if ((await sessionCard.getByRole('button', { name: 'Session option', exact: true }).isDisabled()) !== (role !== 'USER')) throw Error('Wrong session vote permission');
      if ((await sessionCard.getByRole('button', { name: 'Confirmer le vote', exact: true }).count()) !== (role === 'USER' ? 1 : 0)) throw Error('Wrong session vote control');
      const ordinaryCard = page.locator('.poll-card').filter({ has: page.getByRole('heading', { name: ordinaryPoll.question, exact: true }) });
      await ordinaryCard.getByRole('button', { name: 'Ordinary option', exact: true }).click();
      if (!(await ordinaryCard.getByRole('button', { name: 'Confirmer le vote', exact: true }).isEnabled())) throw Error('Ordinary voting unavailable');
      await page.getByRole('button', { name: 'Voir les membres', exact: true }).click();
      const membersDialog = page.getByRole('dialog', { name: roleGroup.name, exact: true });
      const removal = membersDialog.getByRole('button', { name: 'Retirer Other Collaborator du groupe', exact: true });
      if (role === 'ADMIN') {
        await removal.click();
        await membersDialog.getByText(/Son compte sera conservé/).waitFor();
        await membersDialog.getByRole('button', { name: 'Annuler', exact: true }).click();
      } else if (await removal.count()) throw Error('Group removal exposed to a non-admin');
      await membersDialog.getByRole('button', { name: 'Fermer', exact: true }).click();
      if (errors.length || await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)) throw Error('Browser error or horizontal overflow');
      console.log(JSON.stringify({ role, width, personalAttendance: role === 'USER' ? 'available' : 'hidden', sessionVote: role === 'USER' ? 'available' : 'blocked', ordinaryVote: 'available', collaboratorRemoval: role === 'ADMIN' ? 'confirmation verified' : 'hidden', pageErrors: 0, overflow: false, productionBusinessMutations: 0 }));
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
