// Operator-only release helper. Credentials are read in memory and never logged.
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { createRequire } = require('node:module');
const root = path.resolve(__dirname, '..');
const teamId = 'team_fEfVNexUmojgR5tRVEnsSEag';
const projects = { site: 'prj_gknfgm3IBNbg1XpNIj4dtyMmQC0m', pwa: 'prj_ViAWAGY0ZYg29UCu0ql1hG6TU5Cb' };
const scope = route => route + (route.includes('?') ? '&' : '?') + 'teamId=' + teamId;
const auth = () => JSON.parse(fs.readFileSync(path.join(process.env.APPDATA, 'com.vercel.cli/Data/auth.json'), 'utf8').replace(/^\uFEFF/, '')).token;
async function vercel(route, options = {}) {
  const response = await fetch('https://api.vercel.com' + route, { ...options,
    headers: { Authorization: `Bearer ${auth()}`, 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(30000) });
  const result = await response.json();
  if (!response.ok) throw Error(`Vercel HTTP ${response.status}: ${result.error?.code || 'request failed'}`);
  return result;
}
async function main() {
  const mode = process.argv[2];
  if (mode === 'discover') {
    for (const route of ['/v2/user', '/v2/teams', '/v10/projects']) {
      try {
        const result = await vercel(route);
        console.log(JSON.stringify({ route, user: result.user ? { id: result.user.id, username: result.user.username } : undefined,
          teams: result.teams?.map(item => ({ id: item.id, slug: item.slug })),
          projects: result.projects?.map(item => ({ id: item.id, name: item.name, accountId: item.accountId, rootDirectory: item.rootDirectory, production: item.targets?.production?.meta?.githubCommitSha })) }));
      } catch (error) { console.log(error.message); }
    }
  } else if (mode === 'inspect-projects') {
    for (const [kind, id] of Object.entries(projects)) {
      const project = await vercel(scope(`/v9/projects/${id}`));
      const env = await vercel(scope(`/v10/projects/${id}/env`));
      console.log(JSON.stringify({ kind, id: project.id, name: project.name, rootDirectory: project.rootDirectory,
        productionBranch: project.link?.productionBranch, production: project.targets?.production?.meta?.githubCommitSha,
        environmentKeys: env.envs?.map(item => item.key), publicBuildConfig: project.env?.filter(item => ['NITRO_PRESET', 'VITE_PWA_URL', 'VITE_CONTACT_API_URL'].includes(item.key)).map(item => ({ key: item.key, value: item.value })) }));
    }
  } else if (mode === 'configure') {
    const endpoint = 'https://teamchtaw-api.onrender.com/api/v1/contact';
    await vercel(scope(`/v10/projects/${projects.site}/env?upsert=true`), { method: 'POST', body: JSON.stringify([
      { key: 'VITE_CONTACT_API_URL', value: endpoint, type: 'plain', target: ['production'] },
    ]) });
    const req = createRequire(path.join(root, 'chtaw-team-backend/package.json'));
    const credentials = req('js-yaml').load(fs.readFileSync(path.join(process.env.USERPROFILE, '.render/cli.yaml'), 'utf8'));
    const render = async (route, options = {}) => {
      const response = await fetch('https://api.render.com/v1' + route, { ...options, headers: { Authorization: `Bearer ${credentials.api.key}`, 'Content-Type': 'application/json', Accept: 'application/json' }, signal: AbortSignal.timeout(30000) });
      if (!response.ok) throw Error(`Render HTTP ${response.status}`);
      return response.json();
    };
    const records = await render('/services/srv-dbo8v2u7bikc73895mhg/env-vars?limit=100');
    const env = records.map(item => item.envVar ?? item);
    const current = env.find(item => item.key === 'CORS_ORIGINS')?.value;
    if (!current) throw Error('Existing CORS configuration is required.');
    const origins = current.split(',').map(value => value.trim()).filter(Boolean);
    const changed = !origins.includes('https://teamchtaw-vitrine.vercel.app');
    if (changed) {
      origins.push('https://teamchtaw-vitrine.vercel.app');
      await render('/services/srv-dbo8v2u7bikc73895mhg/env-vars/CORS_ORIGINS', { method: 'PUT', body: JSON.stringify({ value: origins.join(',') }) });
    }
    console.log(JSON.stringify({ contactEndpointConfigured: true, corsUpdated: changed, trustedContactProxyConfigured: Boolean(env.find(item => item.key === 'CONTACT_TRUSTED_PROXY_IPS')?.value) }));
  } else if (mode === 'deploy') {
    const kind = process.argv[3], sha = process.argv[4];
    if (!projects[kind]) throw Error('Known project required.');
    const head = execFileSync('git', ['-c', `safe.directory=${root.replaceAll('\\', '/')}`, 'rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
    if (!/^[a-f0-9]{40}$/.test(sha || '') || sha !== head) throw Error('Exact reviewed HEAD required.');
    const result = await vercel(scope('/v13/deployments'), { method: 'POST', body: JSON.stringify({ name: kind === 'site' ? 'teamchtaw-vitrine' : 'teamchtaw-pwa', project: projects[kind], target: 'production', gitSource: { type: 'github', repoId: 1450305620, ref: 'codex/collaborator-firebase-release', sha } }) });
    console.log(JSON.stringify({ kind, id: result.id, readyState: result.readyState, url: result.url, gitSource: result.gitSource }));
  } else if (mode === 'status') {
    const id = process.argv[3];
    if (!/^dpl_[a-zA-Z0-9]+$/.test(id || '')) throw Error('Deployment ID required.');
    const result = await vercel(scope(`/v13/deployments/${id}`));
    console.log(JSON.stringify({ id: result.id, readyState: result.readyState, url: result.url, alias: result.alias, aliasAssigned: result.aliasAssigned, errorCode: result.errorCode, gitSource: result.gitSource }));
  } else throw Error('Unknown release mode.');
}
main().catch(error => { console.error(/^Vercel HTTP|^Render HTTP|^Existing CORS|^Exact reviewed|^Known project/.test(error.message) ? error.message : 'Release operation failed (credentials and response details withheld).'); process.exitCode = 1; });
