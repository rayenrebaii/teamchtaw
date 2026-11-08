import "dotenv/config";
import pg from "pg";
import { randomBytes } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
const original = new URL(process.env.DATABASE_URL);
const name = "chtaw_test_" + randomBytes(6).toString("hex");
const client = new pg.Client({ connectionString: original.href });
await client.connect();
try { await client.query('CREATE DATABASE "' + name + '"'); }
finally { await client.end(); }
const target = new URL(original);
target.pathname = "/" + name;
const env = { ...process.env, DATABASE_URL: target.href, TEST_DATABASE_URL: target.href, ISOLATED_TEST_DATABASE: name, NODE_ENV: "test" };
console.log("New isolated database: " + name + ". Existing databases are not reset.");
const frontend = process.argv.includes("--frontend");
for (const args of [
  ["node_modules/prisma/build/index.js", "migrate", "deploy"],
  ...(frontend ? [] : [["node_modules/jest/bin/jest.js", "--config", "jest.integration.cjs", "--runInBand"]]),
]) {
  const result = spawnSync(process.execPath, args, { env, stdio: "inherit" });
  if (result.status !== 0) { process.exitCode = result.status ?? 1; break; }
}
if (frontend && !process.exitCode) {
  const server = spawn(process.execPath, ["--require", "ts-node/register/transpile-only", "scripts/start-integration.ts"], { env: { ...env, UPLOAD_DIR: "./.test-uploads-" + name }, stdio: ["ignore", "inherit", "inherit", "ipc"] });
  try {
    const ready = await new Promise((resolve) => {
      const timer = setTimeout(() => resolve(false), 15000);
      server.once("message", (message) => {
        clearTimeout(timer);
        resolve(message?.type === "ready" && message.database === name);
      });
      server.once("exit", () => { clearTimeout(timer); resolve(false); });
    });
    if (!ready) throw Error("Isolated integration server did not start.");
    const result = spawnSync(process.execPath, ["node_modules/vitest/vitest.mjs", "run", "--config", "vitest.integration.config.ts"], { cwd: "../chtaw-team-pwa", env, stdio: "inherit" });
    process.exitCode = result.status ?? 1;
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  } finally { server.kill(); }
}
console.log("Isolated database retained for inspection: " + name);
