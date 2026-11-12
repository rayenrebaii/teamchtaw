// Published UI assets with fully intercepted business APIs and fictional identities.
// No real login, account creation, group request or session is sent to production.
const path = require('node:path');
const { createRequire } = require('node:module');
const req = createRequire(path.resolve(__dirname, '../chtaw-team-pwa/package.json'));
const { chromium } = req('@playwright/test');
const base = 'https://teamchtaw-pwa.vercel.app';
const groupId = '00000000-0000-4000-8000-000000000010';
const privateId = '00000000-0000-4000-8000-000000000011';
async function main() {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    for (const role of ['ADMIN', 'USER', 'COLLABORATOR']) for (const width of [1440, 390]) {
      const actor = { id: '00000000-0000-4000-8000-000000000001', firstName: 'Preview', lastName: 'Fixture', email: 'preview@ui.invalid', role, status: 'APPROVED', emailVerified: true, joinedAt: '2026-01-01T00:00:00Z', bio: '' };
      const group = { id: groupId, name: 'General preview', description: '', isGeneral: true, color: '#a78bfa', memberIds: [actor.id], members: [actor] };
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
        else if (pathname === '/groups') data = [group];
        else if (pathname === '/groups/' + groupId) data = group;
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
        return route.fulfill({ status: request.method() === 'OPTIONS' ? 204 : 200, contentType: 'application/json', body: JSON.stringify(data) });
      });
      await page.goto(base + '/app', { waitUntil: 'domcontentloaded' });
      await page.getByRole('heading', { name: /Conversations/ }).waitFor();
      if (role !== 'ADMIN') {
        const directory = page.getByRole('region', { name: 'Groupes disponibles' });
        await directory.getByText('Private preview', { exact: true }).waitFor();
        if (await directory.getByRole('link').count()) throw Error('Directory exposes a content link');
        await directory.getByRole('button', { name: 'Demander à rejoindre Private preview' }).click();
        await directory.getByText('Demande en attente', { exact: true }).waitFor();
        if (joinCalls !== 1 || contentReads) throw Error('Duplicate request or unauthorized content read');
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
      if (errors.length || await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)) throw Error('Browser error or horizontal overflow');
      console.log(JSON.stringify({ role, width, sessionControl: role === 'USER' ? 'hidden' : 'verified', joinRequest: role === 'ADMIN' ? 'admin acceptance verified' : 'single request verified', pageErrors: 0, overflow: false, productionBusinessMutations: 0 }));
      await context.close();
    }
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
