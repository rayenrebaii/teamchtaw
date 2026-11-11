import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import safety from './test-safety.cjs';
const backend = fileURLToPath(new URL('..', import.meta.url));
const frontend = fileURLToPath(new URL('../../chtaw-team-pwa', import.meta.url));
const commands = {
  'backend:test': [backend, ['node_modules/jest/bin/jest.js', '--runInBand']],
  'backend:build': [backend, ['node_modules/typescript/bin/tsc', '-p', 'tsconfig.build.json']],
  'backend:typecheck': [backend, ['node_modules/typescript/bin/tsc', '--noEmit']],
  'pwa:test': [frontend, ['node_modules/vitest/vitest.mjs', 'run']],
  'pwa:ui': [frontend, ['node_modules/vitest/vitest.mjs', 'run', '--config', 'vitest.ui.config.ts']],
  'pwa:build': [frontend, ['node_modules/next/dist/bin/next', 'build']],
  'pwa:browser': [frontend, ['node_modules/@playwright/test/cli.js', 'test']],
};
const mode = process.argv[2];
if (!commands[mode]) throw Error('Unknown safe command.');
const [cwd, args] = commands[mode];
const env = safety.makeTestEnvironment();
if (mode === 'pwa:build') {
  env.NODE_ENV = 'production';
  // Build-only reserved domain: never embed a real deployment destination.
  env.NEXT_PUBLIC_API_URL = 'https://api.example.invalid/api/v1';
  env.NEXT_PUBLIC_SOCKET_URL = 'https://api.example.invalid';
}
const child = spawn(process.execPath, args, { cwd, env, stdio: 'inherit' });
child.on('error', () => { console.error('Safe command could not start.'); process.exitCode = 1; });
child.on('exit', code => { process.exitCode = code ?? 1; });
