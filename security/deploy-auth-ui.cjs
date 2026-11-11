// Operator-only Vercel deployment. Never loaded by application/tests.
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const projectId = 'prj_ViAWAGY0ZYg29UCu0ql1hG6TU5Cb';
const teamId = 'team_fEfVNexUmojgR5tRVEnsSEag';
async function main() {
  const authFile = path.join(process.env.APPDATA, 'com.vercel.cli', 'Data', 'auth.json');
  const auth = JSON.parse(fs.readFileSync(authFile, 'utf8').replace(/^\uFEFF/, ''));
  if (!auth.token) throw Error('Vercel operator token unavailable');
  const request = async (route, body) => {
    const response = await fetch(`https://api.vercel.com${route}${route.includes('?') ? '&' : '?'}teamId=${teamId}`, {
      method: body ? 'POST' : 'GET',
      headers: { Authorization: `Bearer ${auth.token}`, 'Content-Type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(30000),
    });
    const result = await response.json();
    if (!response.ok) throw Error(`Vercel ${response.status}: ${result.error?.code || 'request failed'}`);
    return result;
  };
  const mode = process.argv[2] || 'inspect';
  if (mode === 'inspect') {
    const project = await request(`/v9/projects/${projectId}`);
    console.log(JSON.stringify({ id: project.id, name: project.name, rootDirectory: project.rootDirectory, production: { id: project.targets?.production?.id, gitSource: project.targets?.production?.gitSource } }));
  } else if (mode === 'deploy') {
    const sha = process.argv[3];
    const head = execFileSync('git', ['-c', `safe.directory=${path.resolve(__dirname, '..').replaceAll('\\', '/')}`, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
    if (!/^[a-f0-9]{40}$/.test(sha || '') || sha !== head) throw Error('Exact reviewed HEAD required');
    const result = await request('/v13/deployments', {
      name: 'teamchtaw-pwa', project: projectId, target: 'production',
      gitSource: { type: 'github', repoId: 1450305620, ref: 'codex/collaborator-firebase-release', sha },
    });
    console.log(JSON.stringify({ id: result.id, readyState: result.readyState, url: result.url, gitSource: result.gitSource }));
  } else if (mode === 'status') {
    const id = process.argv[3];
    if (!/^dpl_[a-zA-Z0-9]+$/.test(id || '')) throw Error('Deployment ID required');
    const result = await request(`/v13/deployments/${id}`);
    console.log(JSON.stringify({id:result.id,readyState:result.readyState,url:result.url,alias:result.alias,aliasAssigned:result.aliasAssigned,errorCode:result.errorCode,gitSource:result.gitSource,concurrentQueue:result.isInConcurrentBuildsQueue,systemQueue:result.isInSystemBuildsQueue,createdAt:result.createdAt,buildingAt:result.buildingAt}));
  } else if (mode === 'list') {
    const result = await request(`/v6/deployments?projectId=${projectId}&limit=8`);
    console.log(JSON.stringify(result.deployments.map(d=>({id:d.uid,state:d.state,target:d.target,created:d.created,sha:d.meta?.githubCommitSha}))));
  } else if (mode === 'domains') {
    const result = await request(`/v9/projects/${projectId}/domains`);
    console.log(JSON.stringify(result.domains.map(d=>({name:d.name,gitBranch:d.gitBranch,verified:d.verified}))));
  } else throw Error('Unknown operator mode');
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
