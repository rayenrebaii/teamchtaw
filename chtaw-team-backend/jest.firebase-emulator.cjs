const base = require('./jest.config.cjs');
module.exports = {
  ...base,
  testMatch: ['<rootDir>/test/**/*.emulator.ts'],
  testTimeout: 30000,
  // firebase-admin's jose dependency is ESM; this suite runs the real SDK.
  transform: { ...base.transform, '^.+\\.js$': ['ts-jest', { tsconfig: { allowJs: true, module: 'CommonJS', target: 'ES2022' }, diagnostics: false }] },
  transformIgnorePatterns: ['/node_modules/(?!jose/)'],
};
