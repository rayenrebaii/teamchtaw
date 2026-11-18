// Public, unauthenticated smoke checks. No application session or identity is used.
async function main() {
  const origins = ['https://teamchtaw-api.onrender.com', 'https://teamchtaw-pwa.vercel.app'];
  const routes = ['/health', '/auth/me', '/groups', '/admin/administrators', '/admin/analytics', '/admin/analytics/sessions', '/admin/analytics/alerts'];
  const results = await Promise.all(origins.flatMap(origin => routes.map(async route => {
    const response = await fetch(origin + '/api/v1' + route, { signal: AbortSignal.timeout(60000), redirect: 'error' });
    const expected = route === '/health' ? 200 : 401;
    const healthy = route !== '/health' || (await response.json()).status === 'ok';
    return { origin, route, status: response.status, expected, passed: response.status === expected && healthy };
  })));
  for (const result of results) console.log(JSON.stringify(result));
  if (results.some(result => !result.passed)) process.exitCode = 1;
}
main().catch(() => { console.error('Public release verification failed (no credentials used).'); process.exitCode = 1; });
