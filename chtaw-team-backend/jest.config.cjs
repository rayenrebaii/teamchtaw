const safety = require('./scripts/test-safety.cjs');
if (process.env.CHTAW_ISOLATED_TESTS !== '1') {
  const env = safety.makeTestEnvironment();
  for (const key of Object.keys(process.env)) delete process.env[key];
  Object.assign(process.env, env);
}
safety.assertTestContext();
module.exports={preset:'ts-jest',testEnvironment:'node',testMatch:['<rootDir>/test/**/*.spec.ts'],modulePathIgnorePatterns:['<rootDir>/dist'],clearMocks:true,setupFiles:['<rootDir>/scripts/test-preload.cjs']};
