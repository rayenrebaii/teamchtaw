const { randomBytes } = require('node:crypto');
const path = require('node:path');
const databaseName = /^chtaw_test_[a-f0-9]{12}$/;
function assertDatabase(value, name) {
  let url;
  try { url = new URL(value); } catch { throw Error('An isolated PostgreSQL URL is required (value withheld).'); }
  if (url.protocol !== 'postgresql:' || url.hostname !== '127.0.0.1' ||
      !url.port || url.username !== 'chtaw_test' || !url.password || url.search || url.hash ||
      !databaseName.test(name || '') || url.pathname !== '/' + name)
    throw Error('Only the disposable loopback PostgreSQL test database is allowed (value withheld).');
  return url;
}
function systemEnvironment(source = process.env) {
  // Never inherit application/cloud credentials, PG*, proxies or NODE_OPTIONS.
  const allowed = /^(PATH|PATHEXT|SYSTEMROOT|WINDIR|COMSPEC|TEMP|TMP|USERPROFILE|APPDATA|LOCALAPPDATA|PROGRAMFILES|PROGRAMFILES\(X86\)|PROGRAMDATA|SYSTEMDRIVE|NUMBER_OF_PROCESSORS|PROCESSOR_ARCHITECTURE|JAVA_HOME)$/i;
  return Object.fromEntries(Object.entries(source).filter(([key]) => allowed.test(key)));
}
function makeTestEnvironment({ url, name = 'chtaw_test_000000000000', source } = {}) {
  url ||= `postgresql://chtaw_test:unused-test-only@127.0.0.1:1/${name}`;
  assertDatabase(url, name);
  return {
    ...systemEnvironment(source),
    CHTAW_ISOLATED_TESTS: '1', ISOLATED_TEST_DATABASE: name,
    NODE_ENV: 'test', HOST: '127.0.0.1', PORT: '3102',
    DATABASE_URL: url, DATABASE_DIRECT_URL: url, TEST_DATABASE_URL: url,
    JWT_ACCESS_SECRET: randomBytes(48).toString('hex'), JWT_REFRESH_SECRET: randomBytes(48).toString('hex'),
    ACCESS_TTL_SECONDS: '900', REFRESH_TTL_SECONDS: '604800',
    AUTH_PROVIDER: 'legacy', CORS_ORIGINS: 'http://127.0.0.1:3001,http://localhost:3001', ACCOUNT_ACTION_ORIGIN: 'http://127.0.0.1:3001',
    MEDIA_STORAGE: 'local', UPLOAD_DIR: `./.test-uploads-${name}`, SWAGGER_ENABLED: 'false',
    FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9099', FIREBASE_PROJECT_ID: 'demo-chtaw-collaborator',
    FIREBASE_WEB_API_KEY: 'emulator-only', FIREBASE_CLIENT_EMAIL: 'emulator@example.invalid', FIREBASE_PRIVATE_KEY: 'unused-emulator-credential',
    NEXT_PUBLIC_AUTH_PROVIDER: 'legacy', NEXT_PUBLIC_API_URL: '/api/v1', NEXT_PUBLIC_SOCKET_URL: '',
    NEXT_PUBLIC_FIREBASE_API_KEY: 'emulator-only', NEXT_PUBLIC_FIREBASE_PROJECT_ID: 'demo-chtaw-collaborator',
    NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: 'localhost', NEXT_PUBLIC_FIREBASE_APP_ID: 'emulator-only',
    NEXT_TELEMETRY_DISABLED: '1', FIREBASE_CLI_DISABLE_UPDATE_CHECK: 'true', CI: 'true',
    NODE_OPTIONS: `--require "${path.join(__dirname, 'test-preload.cjs').replaceAll('\\', '/')}"`,
  };
}
function assertTestContext(env = process.env) {
  if (env.CHTAW_ISOLATED_TESTS !== '1') throw Error('Use the isolated test runner; ambient credentials are forbidden.');
  assertDatabase(env.TEST_DATABASE_URL, env.ISOLATED_TEST_DATABASE);
  if (env.DATABASE_URL !== env.TEST_DATABASE_URL || env.DATABASE_DIRECT_URL !== env.TEST_DATABASE_URL ||
      env.FIREBASE_AUTH_EMULATOR_HOST !== '127.0.0.1:9099' || env.FIREBASE_PROJECT_ID !== 'demo-chtaw-collaborator' ||
      env.FIREBASE_PRIVATE_KEY !== 'unused-emulator-credential' || env.FIREBASE_WEB_API_KEY !== 'emulator-only' ||
      env.RESEND_API_KEY || env.GOOGLE_APPLICATION_CREDENTIALS || env.VAPID_PRIVATE_KEY)
    throw Error('Unsafe test configuration detected (values withheld).');
}
module.exports = { assertDatabase, assertTestContext, makeTestEnvironment, systemEnvironment };
