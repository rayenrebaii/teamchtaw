// Verify shipped UI assets with intercepted APIs only. No real accounts or business writes.
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const req = createRequire(path.resolve(__dirname, '../chtaw-team-pwa/package.json'));
const { chromium, expect } = req('@playwright/test');
const base = process.argv[2] || 'https://teamchtaw-pwa.vercel.app';
if (!['https://teamchtaw-pwa.vercel.app', 'http://127.0.0.1:3001'].includes(base)) throw Error('Approved release URL required');
const admin = { id: 'release-admin', firstName: 'Admin', lastName: 'Preview', email: 'admin@example.invalid', role: 'ADMIN', status: 'APPROVED', emailVerified: true, isInvitedAdmin: false, bio: '', joinedAt: '2026-01-01T00:00:00Z' };
const members = [admin, ...Array.from({ length: 12 }, (_, i) => ({ ...admin, id: `release-member-${i}`, firstName: `Member ${i}`, email: `member${i}@example.invalid`, role: 'USER' }))];
const group = { id: 'release-group', name: 'Preview group', description: '', color: '#be9af5', isGeneral: true, memberIds: members.map(u => u.id) };
const school = { id: 'release-school', name: 'Preview high school' };
const suggestion = { id: 'release-suggestion', name: 'Proposed high school', status: 'PENDING', students: [{ id: members[1].id, firstName: 'Nadia', lastName: 'Preview', establishment: null }] };
const poll = { id: 'release-poll', groupId: group.id, authorId: admin.id, question: 'Preview session poll', type: 'SESSION', status: 'CLOSED', singleChoice: true, options: [{ id: 'release-slot', label: 'Slot 1', startsAt: '2026-11-18T15:04:00Z' }], votes: [{ userId: members[1].id, optionIds: ['release-slot'] }] };
const attendance = { ...poll, group: { id: group.id, name: group.name }, groups: [{ id: group.id, name: group.name }], phase: 'COMPLETED', mandatoryAttendance: false, lastEnd: '2026-11-18T16:34:00Z', concerned: 1, present: 0, toVerify: 1 };
async function main() {
  const directory = path.resolve(__dirname, '../chtaw-team-pwa/.test-browser-results/admin-tables-release');
  fs.mkdirSync(directory, { recursive: true });
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    for (const [width, theme] of [[1440, 'dark'], [390, 'dark'], [390, 'light']]) {
      const context = await browser.newContext({ viewport: { width, height: 1000 }, locale: 'en-GB', serviceWorkers: 'block' });
      await context.addInitScript(theme => { localStorage.setItem('chtaw-language', 'en'); localStorage.setItem('chtaw-theme', theme); delete Object.getPrototypeOf(navigator).serviceWorker; }, theme);
      const page = await context.newPage();
      page.setDefaultTimeout(20000);
      const errors = [], memberPages = [], writes = [];
      let directoryReads = 0;
      page.on('pageerror', error => errors.push(error.message));
      await page.routeWebSocket('**/*', socket => socket.close());
      await page.route('**/api/v1/**', async route => {
        const request = route.request(), url = new URL(request.url()), p = url.pathname.replace(/^\/api\/v1/, '');
        if (request.method() !== 'GET' && p !== '/auth/refresh') writes.push(p);
        let data;
        if (p === '/auth/refresh') data = { accessToken: 'ui-fixture-only', expiresIn: 900, userId: admin.id, sessionId: 'ui-fixture' };
        else if (p === '/auth/me' || p === '/users/me') data = admin;
        else if (p === '/users/members') { const n = Number(url.searchParams.get('page') || '1'); memberPages.push(n); data = { items: members.slice((n - 1) * 6, n * 6), total: members.length, page: n, pageSize: 6, counts: { ALL: members.length, PENDING: 0, APPROVED: members.length, REJECTED: 0 } }; }
        else if (p === '/users') { directoryReads++; data = { items: members, nextCursor: null }; }
        else if (p === '/groups') data = [group];
        else if (p === '/polls') data = { items: [poll], nextCursor: null };
        else if (p === '/admin/administrators') data = [admin, { ...admin, id: 'release-agent', firstName: 'Agent', email: 'agent@example.invalid', isInvitedAdmin: true, activatedAt: '2026-11-18T10:00:00Z' }];
        else if (p === '/admin/stats') data = { totalUsers: members.length, pendingUsers: 0, approvedUsers: members.length, groups: 1, messages: 0, polls: 1 };
        else if (p === '/admin/establishments' || p === '/establishments') data = [school];
        else if (p === '/admin/establishment-suggestions') data = [suggestion];
        else if (p.startsWith('/admin/attendance')) data = { items: [attendance], total: 1, stats: { sessions: 1, students: 1, presences: 0, absences: 0, threshold: 0, unreadAlerts: 0 } };
        else if (p === '/notifications') data = { items: [], unreadCount: 0, nextCursor: null };
        else if (p === '/notifications/preferences') data = { enabled: false, messagesEnabled: false, pollsEnabled: false };
        else if (p === '/notifications/push-config') data = { enabled: false, publicKey: '' };
        else if (p === '/notifications/subscriptions' || p === '/admin/absence-alerts') data = [];
        else { errors.push('Unmocked API ' + p); return route.fulfill({ status: 503, json: { message: 'Unmocked UI fixture' } }); }
        return route.fulfill({ status: 200, json: data });
      });
      const capture = async name => {
        await page.screenshot({ path: path.join(directory, `${name}-${width}-${theme}.png`), fullPage: true });
        if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth || [...document.querySelectorAll('.modal-content')].some(el => el.scrollWidth > el.clientWidth + 1))) throw Error(`Horizontal overflow: ${name}/${width}/${theme}`);
      };
      await page.goto(base + '/admin/users', { waitUntil: 'domcontentloaded' });
      await expect(page.getByText('member0@example.invalid', { exact: true })).toBeVisible();
      await expect(page.getByRole('button', { name: 'View profile', exact: true })).toHaveCount(6);
      if (directoryReads || memberPages.some(n => n !== 1)) throw Error('Members directory was preloaded');
      await page.getByRole('button', { name: 'Next', exact: true }).click();
      await expect(page.getByText('member5@example.invalid', { exact: true })).toBeVisible();
      if (!memberPages.includes(2) || directoryReads) throw Error('Remote pagination failed');
      await expect(page.getByRole('button', { name: 'Export all users', exact: true })).toHaveClass(/btn-primary/);
      await capture('members');
      await page.goto(base + '/admin/administrators');
      await expect(page.getByRole('table', { name: 'Administrators', exact: true })).toBeVisible();
      await expect(page.getByText('agent@example.invalid', { exact: true })).toBeVisible();
      await capture('administrators');
      await page.goto(base + '/admin/polls');
      await expect(page.getByRole('table', { name: 'All polls', exact: true })).toBeVisible();
      await expect(page.getByRole('main').getByRole('link', { name: 'Calendar', exact: true })).toHaveClass(/btn-primary/);
      await capture('polls');
      await page.goto(base + '/admin/attendance');
      await expect(page.getByRole('table', { name: 'Choose a time slot', exact: true })).toBeVisible();
      await expect(page.getByRole('link', { name: 'Open attendance list', exact: true })).toHaveAttribute('href', /slot=release-slot/);
      await capture('attendance');
      await page.goto(base + '/admin/establishments');
      await expect(page.getByRole('table', { name: 'School list', exact: true })).toBeVisible();
      await capture('schools');
      await page.getByRole('button', { name: 'School requests', exact: true }).click();
      await expect(page.getByRole('dialog', { name: 'School suggestions', exact: true })).toBeVisible();
      await expect(page.getByText('Proposed high school', { exact: true })).toBeVisible();
      await capture('school-requests');
      if (writes.length || errors.length) throw Error(JSON.stringify({ writes, errors }));
      console.log(JSON.stringify({ width, theme, verified: ['members-pagination', 'administrators', 'polls', 'attendance', 'schools', 'school-requests'], businessWrites: 0, errors: 0 }));
      await context.close();
    }
    const context = await browser.newContext({ viewport: { width: 390, height: 1000 }, serviceWorkers: 'block' });
    await context.addInitScript(() => { localStorage.setItem('chtaw-language', 'en'); localStorage.setItem('chtaw-theme', 'dark'); delete Object.getPrototypeOf(navigator).serviceWorker; });
    const page = await context.newPage();
    await page.route('**/api/v1/**', route => new URL(route.request().url()).pathname.endsWith('/establishments')
      ? route.fulfill({ status: 200, json: [school] }) : route.fulfill({ status: 401, json: { message: 'Anonymous UI fixture' } }));
    await page.goto(base + '/login');
    await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible();
    await expect(page.getByLabel('Email address', { exact: true })).toBeVisible();
    await page.screenshot({ path: path.join(directory, 'login-390-dark.png'), fullPage: true });
    await page.goto(base + '/register');
    await page.locator('input[autocomplete="given-name"]').fill('Nadia');
    await page.locator('input[autocomplete="family-name"]').fill('Preview');
    await page.getByRole('button', { name: 'Next', exact: true }).click();
    const picker = page.getByRole('combobox');
    await expect(picker).toBeEnabled();
    await picker.selectOption(school.id);
    await page.getByRole('button', { name: 'Next', exact: true }).click();
    await expect(page.getByLabel('Email address', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Create my account', exact: true })).toBeVisible();
    await page.screenshot({ path: path.join(directory, 'register-390-dark.png'), fullPage: true });
    console.log(JSON.stringify({ verified: ['English login', 'English registration wizard'], businessWrites: 0 }));
    await context.close();
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
