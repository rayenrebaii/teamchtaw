import "dotenv/config";
import pg from "pg";
import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
const original = new URL(process.env.DATABASE_URL);
if (!["127.0.0.1", "localhost"].includes(original.hostname)) throw Error("Local PostgreSQL required");
const name = "chtaw_test_" + randomBytes(6).toString("hex");
const client = new pg.Client({ connectionString: original.href }); await client.connect();
try { await client.query(`CREATE DATABASE "${name}"`); } finally { await client.end(); }
original.pathname = "/" + name;
const env = { ...process.env, DATABASE_URL: original.href, DATABASE_DIRECT_URL: original.href, TEST_DATABASE_URL: original.href, ISOLATED_TEST_DATABASE: name, NODE_ENV: "test", FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:9099" };
for (const args of [["node_modules/prisma/build/index.js", "migrate", "deploy"], ["node_modules/jest/bin/jest.js", "--config", "jest.firebase-emulator.cjs", "--runInBand"]]) {
  const result = spawnSync(process.execPath, args, { env, stdio: "inherit" });
  if (result.status !== 0) { process.exitCode = result.status ?? 1; break; }
}
console.log("Firebase emulator test database retained: " + name);
