// Public production assets with browser-only fixtures. No real account or business mutation.
const path = require('node:path');
const fs = require('node:fs');
const { createRequire } = require('node:module');
const req = createRequire(path.resolve(__dirname, '../chtaw-team-pwa/package.json'));
const { chromium } = req('@playwright/test');
const base = process.argv.find(arg => arg.startsWith('--base='))?.slice(7) || 'https://teamchtaw-pwa.vercel.app';
if (!['http://127.0.0.1:3001', 'https://teamchtaw-pwa.vercel.app'].includes(base)) throw Error('Unreviewed verification destination');
const groupId = '00000000-0000-4000-8000-000000000010';
const authorId = '00000000-0000-4000-8000-000000000002';
const pollId = '00000000-0000-4000-8000-000000000020';
async function main() {
  if (process.argv.includes('--health')) {
    for (const origin of ['https://teamchtaw-api.onrender.com', base]) {
      for (const [route, expected] of [['/api/v1/health', 200], ['/api/v1/auth/me', 401], ['/api/v1/groups', 401], ['/api/v1/polls', 401]]) {
        const response = await fetch(origin + route, { signal: AbortSignal.timeout(45000), cache: 'no-store' });
        if (response.status !== expected) throw Error(`Public verification failed: ${route} returned ${response.status}`);
        if (expected === 200 && (await response.json()).status !== 'ok') throw Error('Database health check failed');
        console.log(JSON.stringify({ origin, route, status: response.status, expected, verified: true }));
      }
    }
    return;
  }
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    for (const [role, language, width, own] of [
      ['ADMIN', 'fr', 1440, false], ['ADMIN', 'en', 390, false],
      ['COLLABORATOR', 'fr', 390, true], ['COLLABORATOR', 'fr', 390, false], ['USER', 'fr', 390, false],
    ]) {
      const actor = { id: own ? authorId : '00000000-0000-4000-8000-000000000001', firstName: 'Preview', lastName: 'Fixture',
        email: 'preview@ui.invalid', role, status: 'APPROVED', emailVerified: true, activatedAt: '2026-01-01', joinedAt: '2026-01-01T00:00:00Z', bio: '' };
      const author = { ...actor, id: authorId, role: 'COLLABORATOR', firstName: 'Organizer' };
      const group = { id: groupId, name: 'Release UI fixture', description: '', isGeneral: false, color: '#a78bfa',
        memberIds: role === 'ADMIN' ? [authorId] : [actor.id, authorId], members: [actor, author] };
      const poll = { id: pollId, groupId, authorId, question: 'Release session fixture', type: 'SESSION', status: 'OPEN', mandatoryAttendance: true,
        singleChoice: false, endsAt: '2099-01-01T06:00:00Z', createdAt: '2026-11-11T00:00:00Z', votes: [], options: [
          { id: '00000000-0000-4000-8000-000000000030', label: 'Monday', startsAt: '2099-01-02T08:00:00Z', endsAt: '2099-01-02T10:00:00Z' },
          { id: '00000000-0000-4000-8000-000000000031', label: 'Tuesday', startsAt: '2099-01-03T08:00:00Z', endsAt: '2099-01-03T10:00:00Z' },
        ] };
      const message = { id: '00000000-0000-4000-8000-000000000040', groupId, authorId, author, kind: 'poll', text: '', pollId, createdAt: '2026-11-11T00:00:00Z' };
      const textMessage = { ...message, id: '00000000-0000-4000-8000-000000000041', kind: 'text', text: 'Release message fixture', pollId: undefined };
      const context = await browser.newContext({ viewport: { width, height: 1000 }, serviceWorkers: 'block' });
      await context.addInitScript(({ language }) => { localStorage.setItem('chtaw-language', language); }, { language });
      const page = await context.newPage(); page.setDefaultTimeout(20000);
      const errors = []; let mutations = 0;
      page.on('pageerror', error => errors.push(error.name));
      await page.routeWebSocket('**/*', socket => socket.close());
      await page.route('**/*', route => new URL(route.request().url()).origin === base ? route.continue() : route.abort());
      await page.route('**/api/v1/**', route => {
        const request = route.request(), pathname = new URL(request.url()).pathname.replace(/^\/api\/v1/, '');
        if (!['GET', 'OPTIONS'].includes(request.method()) && pathname !== '/auth/refresh') mutations++;
        const headers = { 'Access-Control-Allow-Origin': base, 'Access-Control-Allow-Credentials': 'true' };
        let data = { items: [], nextCursor: null, unreadCount: 0 };
        if (pathname === '/auth/refresh') data = { accessToken: 'ui-fixture-not-a-jwt', expiresIn: 900, userId: actor.id, sessionId: 'ui-fixture' };
        else if (pathname === '/auth/me') data = actor;
        else if (pathname === '/groups') data = [group];
        else if (pathname === '/groups/' + groupId) data = group;
        else if (pathname === '/groups/' + groupId + '/messages') data = { items: [message, textMessage], nextCursor: null };
        else if (pathname === '/polls') data = { items: [poll], nextCursor: null };
        else if (pathname === '/polls/' + pollId) data = poll;
        else if (pathname === '/users') data = { items: [actor, author], nextCursor: null };
        else if (pathname === '/organizer/participants') data = [];
        else if (pathname === '/admin/stats') data = { totalUsers: 2, pendingUsers: 0, approvedUsers: 2, groups: 1, messages: 1, polls: 1 };
        else if (pathname === '/notifications/push-config') data = { enabled: false, publicKey: '' };
        else if (pathname === '/notifications/preferences') data = { enabled: false, messagesEnabled: false, pollsEnabled: false };
        else if (pathname === '/notifications/subscriptions') data = [];
        return route.fulfill({ status: request.method() === 'OPTIONS' ? 204 : 200, headers, contentType: 'application/json', body: JSON.stringify(data) });
      });
      await page.goto(base + '/app/groups/' + groupId, { waitUntil: 'domcontentloaded' });
      await page.getByRole('heading', { name: poll.question, exact: true }).waitFor();
      const label = language === 'en' ? 'Delete poll' : 'Supprimer le sondage';
      const button = page.getByRole('button', { name: label + ' : ' + poll.question, exact: true });
      const allowed = role === 'ADMIN' || (role === 'COLLABORATOR' && own);
      if (allowed) {
        if (role === 'ADMIN') {
          if (await button.count()) throw Error('Persistent poll deletion button remains inside the chat');
          await page.getByRole('heading', { name: poll.question, exact: true }).click();
          await page.getByRole('menuitem', { name: label, exact: true }).click();
        } else await button.click();
        const dialog = page.getByRole('dialog', { name: label, exact: true });
        await dialog.waitFor();
        const text = await dialog.innerText();
        if (language === 'fr' ? !text.includes('deux heures') || !text.includes('fin de tous les créneaux') || !text.includes('conservés') : !text.includes('two hours') || !text.includes('all slots') || !text.includes('preserved')) throw Error('Published lifecycle confirmation missing');
        await dialog.getByRole('button', { name: language === 'en' ? 'Cancel' : 'Annuler', exact: true }).click();
      } else if (await button.count()) throw Error('Unauthorized poll deletion control visible');
      const messageLabel = language === 'en' ? 'Delete message' : 'Supprimer le message';
      if (await page.getByRole('button', { name: messageLabel, exact: true }).count()) throw Error('Persistent delete button still visible');
      const actions = page.getByRole('button', { name: language === 'en' ? 'Message actions' : 'Actions du message', exact: true });
      if (role === 'ADMIN') {
        const bubble = page.locator('.bubble > p').filter({ hasText: 'Release message fixture' });
        await bubble.click();
        const item = page.getByRole('menuitem', { name: messageLabel, exact: true }); await item.waitFor();
        const bounds = await page.getByRole('menu').boundingBox();
        const height = await page.evaluate(() => innerHeight);
        if (!bounds || bounds.x < 0 || bounds.y < 0 || bounds.x + bounds.width > width || bounds.y + bounds.height > height) throw Error('Contextual menu outside viewport');
        const out = path.resolve(__dirname, '../chtaw-team-pwa/.test-browser-results'); fs.mkdirSync(out, { recursive: true });
        await page.screenshot({ path: path.join(out, `session-message-menu-${language}-${width}.png`) });
        await item.click();
        const confirmation = page.getByRole('dialog', { name: messageLabel, exact: true }); await confirmation.waitFor();
        await confirmation.getByRole('button', { name: language === 'en' ? 'Cancel' : 'Annuler', exact: true }).click();
        await bubble.click({ button: 'right' }); await item.waitFor();
        await page.keyboard.press('Escape');
        if (await page.getByRole('menu').count()) throw Error('Escape did not dismiss the message menu');
        await actions.first().click(); await item.waitFor();
        await page.getByRole('heading', { name: group.name, exact: true }).click();
        if (await page.getByRole('menu').count()) throw Error('Outside click did not dismiss the message menu');
      } else if (await actions.count()) throw Error('Unauthorized message action control visible');
      if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)) throw Error('Horizontal overflow');
      if (errors.length || mutations) throw Error('Unexpected browser errors or mutations');
      console.log(JSON.stringify({ role, language, width, ownsSession: own, confirmation: allowed ? 'verified' : 'correctly hidden', messageMenu: role === 'ADMIN' ? 'verified: click, context menu, Escape, outside click' : 'correctly hidden', privateApi: 'fully intercepted', mutations: 0, pageErrors: 0, overflow: false }));
      await context.close();
    }
  } finally { await browser.close(); }
}
main().catch(error => { console.error(JSON.stringify({ message: error.message, transportCode: error.cause?.code })); process.exitCode = 1; });
