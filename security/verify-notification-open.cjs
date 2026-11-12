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
const output = path.resolve(__dirname, '../.test-browser-results/notification-open');
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
      const author = { ...actor, id: '00000000-0000-4000-8000-000000000002', firstName: 'Nadia', lastName: 'Team', role: 'ADMIN' };
      const group = { id: groupId, name: 'General preview', description: '', isGeneral: true, color: '#a78bfa', memberIds: [actor.id, author.id], members: [actor, author] };
      const poll = { id: '00000000-0000-4000-8000-000000000020', groupId, authorId: author.id, question: 'Training Tuesday', type: 'SESSION', status: 'OPEN', singleChoice: true, votes: [], options: [{ id: 'option', label: 'Tuesday' }] };
      const message = { id: '00000000-0000-4000-8000-000000000030', groupId, authorId: author.id, author, kind: 'text', text: 'Bonjour la team, rendez-vous mardi !', createdAt: '2026-11-12T10:00:00Z' };
      const pollMessage = { ...message, id: '00000000-0000-4000-8000-000000000031', text: '', kind: 'poll', pollId: poll.id, poll };
      const notification = { id: '00000000-0000-4000-8000-000000000040', type: 'MESSAGE', groupId, groupName: group.name, entityId: message.id, title: 'Nadia Team \u00b7 General preview', body: message.text, readAt: null, optionId: null, createdAt: message.createdAt };
      const pollNotification = { ...notification, id: '00000000-0000-4000-8000-000000000041', type: 'POLL', entityId: poll.id, body: 'Sondage de s\u00e9ance : Training Tuesday' };
      let items = [notification, pollNotification], openCalls = 0, olderReads = 0, pendingRequests = true;
      const errors = [], context = await browser.newContext({ viewport: { width, height: 1000 }, serviceWorkers: 'block' });
      await context.addInitScript(() => { localStorage.setItem('chtaw-language', 'fr'); delete Object.getPrototypeOf(navigator).serviceWorker; });
      const page = await context.newPage(); page.setDefaultTimeout(20000);
      page.on('pageerror', error => errors.push(error.name));
      await page.routeWebSocket('**/*', socket => socket.close());
      await page.route('**/*', route => new URL(route.request().url()).origin === base ? route.continue() : route.abort());
      await page.route('**/api/v1/**', route => {
        const request = route.request(), url = new URL(request.url()), pathname = url.pathname.replace(/^\/api\/v1/, '');
        let data = { items: [], nextCursor: null, unreadCount: 0 };
        if (pathname === '/auth/refresh') data = { accessToken: 'ui-fixture-not-a-jwt', expiresIn: 900, userId: actor.id, sessionId: 'ui-fixture' };
        else if (pathname === '/auth/me') data = actor;
        else if (pathname === '/groups') data = [group];
        else if (pathname === '/groups/' + groupId) data = group;
        else if (pathname === '/groups/' + groupId + '/messages') {
          if (url.searchParams.has('cursor')) { olderReads++; data = { items: [message], nextCursor: null }; }
          else data = { items: [pollMessage], nextCursor: pollMessage.id };
        }
        else if (pathname === '/polls') data = { items: role === 'COLLABORATOR' ? [] : [poll], nextCursor: null };
        else if (pathname === '/notifications') data = { items, nextCursor: null, unreadCount: items.length };
        else if (pathname.endsWith('/open') && request.method() === 'POST') {
          const item = items.find(item => pathname === '/notifications/' + item.id + '/open');
          if (!item) throw Error('Unexpected duplicate notification open');
          items = items.filter(other => other.id !== item.id); openCalls++;
          data = { href: '/app/groups/' + groupId + (item.type === 'MESSAGE' ? '?message=' : '?poll=') + item.entityId, unreadCount: items.length };
        }
        else if (pathname === '/groups/directory') data = [];
        else if (pathname === '/groups/join-requests') data = pendingRequests ? [{ id: 'request', status: 'PENDING', createdAt: message.createdAt, group: { id: privateId, name: 'Private preview' }, user: { ...actor, role: 'COLLABORATOR' } }] : [];
        else if (pathname === '/groups/join-requests/request' && request.method() === 'PATCH') { pendingRequests = false; data = { status: 'APPROVED' }; }
        else if (pathname === '/organizer/participants') data = [];
        else if (pathname === '/users') data = { items: [actor], nextCursor: null };
        else if (pathname === '/admin/stats') data = { totalUsers: 1, pendingUsers: 0, approvedUsers: 1, groups: 1, messages: 2, polls: 1 };
        else if (pathname === '/notifications/push-config') data = { enabled: false, publicKey: '' };
        else if (pathname === '/notifications/preferences') data = { enabled: false, messagesEnabled: false, pollsEnabled: false };
        else if (pathname === '/notifications/subscriptions') data = [];
        else if (request.method() !== 'GET' && request.method() !== 'OPTIONS') throw Error('Unexpected intercepted mutation: ' + pathname);
        return route.fulfill({ status: request.method() === 'OPTIONS' ? 204 : 200, headers: { 'Access-Control-Allow-Origin': base, 'Access-Control-Allow-Credentials': 'true', 'Access-Control-Allow-Headers': 'Authorization, Content-Type', 'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS' }, contentType: 'application/json', body: JSON.stringify(data) });
      });
      const bell = () => page.getByRole('button', { name: 'Notifications', exact: true });
      const inbox = () => page.getByRole('dialog', { name: 'Notifications', exact: true });
      await page.goto(base + '/app', { waitUntil: 'domcontentloaded' });
      await bell().click();
      await inbox().getByText(message.text, { exact: true }).waitFor();
      if (await inbox().getByRole('heading', { name: 'Notifications', exact: true }).count() !== 1) throw Error('Duplicate notification heading');
      await page.screenshot({ path: path.join(output, `${local ? 'local' : 'production'}-${role}-${width}.png`), fullPage: true });
      await inbox().getByRole('button', { name: /Bonjour la team/ }).click();
      await page.waitForURL('**?message=' + message.id);
      await page.locator('#message-' + message.id).waitFor();
      if (!olderReads || openCalls !== 1 || items.length !== 1) throw Error('Message history focus or consumption failed');
      await bell().click();
      await inbox().getByRole('button', { name: /Sondage de s\u00e9ance : Training Tuesday/ }).click();
      await page.waitForURL('**?poll=' + poll.id);
      await page.getByRole('heading', { name: poll.question, exact: true }).waitFor();
      if (openCalls !== 2 || items.length) throw Error('Poll not consumed');
      await bell().click();
      await inbox().getByText('Aucune notification', { exact: true }).waitFor();
      await inbox().getByRole('button', { name: 'Fermer', exact: true }).click();
      // Same entry URL opened by the system service worker; restored authenticated session.
      items = [pollNotification];
      await page.goto(base + '/app/notifications?open=' + pollNotification.id, { waitUntil: 'domcontentloaded' });
      await page.waitForURL('**?poll=' + poll.id);
      await page.getByRole('heading', { name: poll.question, exact: true }).waitFor();
      if (openCalls !== 3 || items.length) throw Error('Cold notification entry failed');
      if (role === 'ADMIN') {
        await page.goto(base + '/admin/groups', { waitUntil: 'domcontentloaded' });
        const requests = page.getByRole('button', { name: 'Demandes d\u2019adh\u00e9sion', exact: true });
        await requests.locator('.count-badge').filter({ hasText: '1' }).waitFor();
        await page.screenshot({ path: path.join(output, `${local ? 'local' : 'production'}-badge-${width}.png`), fullPage: true });
        await requests.click();
        const dialog = page.getByRole('dialog', { name: 'Demandes d\u2019adh\u00e9sion aux groupes', exact: true });
        await dialog.getByRole('button', { name: 'Accepter', exact: true }).click();
        await dialog.getByText(/Demande accept\u00e9e/).waitFor();
        if (!(await page.locator('button[aria-describedby] .count-badge').textContent()).startsWith('0')) throw Error('Request count did not decrease');
        await dialog.getByRole('button', { name: 'Fermer', exact: true }).click();
      }
      if (errors.length || await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)) throw Error('Browser error or horizontal overflow');
      console.log(JSON.stringify({ role, width, previews: 'sender and content', message: 'older history loaded', poll: 'exact source', coldEntry: 'restored session', opens: openCalls, adminPendingCount: role === 'ADMIN' ? '1 to 0' : 'not exposed', pageErrors: 0, productionBusinessMutations: 0 }));
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
