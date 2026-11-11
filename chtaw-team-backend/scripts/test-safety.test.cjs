const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { assertDatabase, assertTestContext, makeTestEnvironment } = require('./test-safety.cjs');
const name = 'chtaw_test_012345abcdef';
const valid = `postgresql://chtaw_test:fictional-test-password@127.0.0.1:54321/${name}`;
test('rejects production hosts, business databases, query overrides and foreign users', () => {
  assert.doesNotThrow(() => assertDatabase(valid, name));
  for (const bad of [valid.replace('127.0.0.1', 'production.invalid'), valid.replace(name, 'chtaw'),
    valid + '?host=production.invalid', valid.replace('chtaw_test:', 'postgres:'), valid.replace('127.0.0.1', 'localhost'),
    'not a url']) assert.throws(() => assertDatabase(bad, name));
});
test('discards ambient production credentials and creates independent JWT keys', () => {
  const inherited = { DATABASE_URL: 'production-sentinel', DATABASE_DIRECT_URL: 'production-sentinel', JWT_ACCESS_SECRET: 'production-sentinel',
    RESEND_API_KEY: 'production-sentinel', GOOGLE_APPLICATION_CREDENTIALS: 'production-sentinel', PGHOST: 'production.invalid',
    FIREBASE_PRIVATE_KEY: 'production-sentinel', NODE_OPTIONS: 'production-sentinel', HTTPS_PROXY: 'production-sentinel', PATH: process.env.PATH };
  const first = makeTestEnvironment({ source: inherited }), second = makeTestEnvironment({ source: inherited });
  assertTestContext(first);
  assert.ok(!Object.values(first).includes('production-sentinel'));
  assert.notEqual(first.JWT_ACCESS_SECRET, first.JWT_REFRESH_SECRET);
  assert.notEqual(first.JWT_ACCESS_SECRET, second.JWT_ACCESS_SECRET);
  assert.equal(first.PGHOST, undefined); assert.equal(first.HTTPS_PROXY, undefined);
  assert.throws(() => assertTestContext({ ...first, DATABASE_DIRECT_URL: 'production-sentinel' }));
  assert.throws(() => assertTestContext({ ...first, FIREBASE_PROJECT_ID: 'real-project' }));
});
test('preload blocks remote sockets and disables dotenv and Next env loading', () => {
  const env = makeTestEnvironment();
  const child = spawnSync(process.execPath, ['-e', `
    const assert = require('node:assert/strict');
    assert.throws(() => require('node:net').connect({ host: 'production.invalid', port: 443 }), /External network/);
    assert.deepEqual(require('dotenv').config(), { parsed: {} });
    const front = require('node:module').createRequire(require('node:path').resolve('../chtaw-team-pwa/package.json'));
    assert.equal(front('@next/env').loadEnvConfig(process.cwd()).loadedEnvFiles.length, 0, 'No local env file may be loaded');
    assert.equal(require('node:fs').existsSync('.env'), false);
    assert.throws(() => require('node:fs').readFileSync('.env'), /Sensitive local files/);
    assert.equal(process.env.RESEND_API_KEY, undefined);
  `], { cwd: require('node:path').resolve(__dirname, '..'), env, encoding: 'utf8' });
  assert.equal(child.status, 0, 'Isolation child failed; its output is withheld to prevent credential disclosure.');
});
