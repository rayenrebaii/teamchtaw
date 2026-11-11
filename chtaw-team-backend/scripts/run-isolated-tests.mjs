import { randomBytes } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import net from "node:net";
import { fileURLToPath } from "node:url";
import safety from "./test-safety.cjs";
import pg from "pg";

const backend = fileURLToPath(new URL("..", import.meta.url));
const frontend = fileURLToPath(new URL("../../chtaw-team-pwa", import.meta.url));
const system = safety.systemEnvironment();
const dockerHost = process.platform === "win32" ? "npipe:////./pipe/docker_engine" : "unix:///var/run/docker.sock";
const name = "chtaw_test_" + randomBytes(6).toString("hex");
const container = "chtaw-security-" + name.slice(11);
const password = randomBytes(32).toString("hex");
let created = false, emulator, server;
let env;
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
function docker(args, extra = {}) {
  const r = spawnSync("docker", ["--host", dockerHost, ...args], { env: system, encoding: "utf8", timeout: 30000, ...extra });
  if (r.status !== 0) throw Error("Isolated Docker operation failed; no connection to any existing database was attempted.");
  return r.stdout.trim();
}
function run(args, cwd = backend) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, { cwd, env, stdio: "inherit" });
    child.once("error", () => reject(Error("Isolated test process could not start.")));
    child.once("exit", code => code === 0 ? resolve() : reject(Error("Isolated check failed.")));
  });
}
async function assertFree(port) {
  await new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once("error", () => reject(Error("A required test port is already in use; existing services will not be reused.")));
    probe.listen(port, "127.0.0.1", () => probe.close(resolve));
  });
}
async function startEmulator() {
  await assertFree(9099); await assertFree(4408); await assertFree(4508);
  const temp = await mkdtemp(path.join(tmpdir(), "chtaw-auth-emulator-"));
  const cli = path.join(system.APPDATA || system.AppData || "", "npm/node_modules/firebase-tools/lib/bin/firebase.js");
  emulator = spawn(process.execPath, [cli, "emulators:start", "--only", "auth", "--project", "demo-chtaw-collaborator", "--config", path.join(backend, "scripts/firebase.test.json"), "--non-interactive"], {
    cwd: temp, env: { ...env, HOME: temp, USERPROFILE: temp, APPDATA: path.join(temp, "appdata"),
      LOCALAPPDATA: path.join(temp, "localappdata"), XDG_CONFIG_HOME: path.join(temp, "config") }, stdio: "ignore",
  });
  let failed = false;
  emulator.once("error", () => { failed = true; });
  for (let i = 0; i < 90; i++) {
    if (failed || emulator.exitCode !== null) throw Error("The owned Firebase Emulator could not start. Install firebase-tools locally; production is never a fallback.");
    try {
      const response = await fetch("http://127.0.0.1:9099/emulator/v1/projects/demo-chtaw-collaborator/config", { signal: AbortSignal.timeout(500) });
      if (response.ok) { console.log("Owned Firebase Auth Emulator ready (demo project only)."); return; }
    } catch {}
    await pause(500);
  }
  throw Error("Firebase Emulator startup timed out; production is never a fallback.");
}
function stopOwned(child) {
  if (!child || child.exitCode !== null || !child.pid) return;
  if (process.platform === "win32") spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], { env: system, stdio: "ignore", timeout: 15000 });
  else child.kill("SIGTERM");
}
try {
  // Never read .env or accept DATABASE_URL/TEST_DATABASE_URL from the caller.
  docker(["run", "--detach", "--pull=never", "--name", container, "--label", "chtaw.security-test=true", "--publish", "127.0.0.1::5432", "--env", "POSTGRES_PASSWORD", "--env", "POSTGRES_USER=chtaw_test", "--env", "POSTGRES_DB=" + name, "postgres:17-alpine"], {
    env: { ...system, POSTGRES_PASSWORD: password },
  });
  created = true;
  const binding = docker(["port", container, "5432/tcp"]);
  if (!/^127\.0\.0\.1:\d+$/.test(binding)) throw Error("Unexpected test PostgreSQL binding.");
  const url = `postgresql://chtaw_test:${password}@${binding}/${name}`;
  env = safety.makeTestEnvironment({ url, name });
  safety.assertTestContext(env);
  let ready = false;
  for (let i = 0; i < 60; i++) {
    // pg_isready over the Unix socket can report the temporary init server as ready.
    // Verify the actual published TCP endpoint before running any migration.
    const probe = new pg.Client({ connectionString: url, connectionTimeoutMillis: 1000 });
    probe.on("error", () => {});
    try { await probe.connect(); await probe.query("SELECT 1"); ready = true; }
    catch {} finally { await probe.end().catch(() => {}); }
    if (ready) break;
    await pause(500);
  }
  if (!ready) throw Error("Owned test PostgreSQL did not become ready.");
  console.log("Disposable PostgreSQL ready: " + name + " (no existing database reused).");
  if (process.argv.includes("--migration")) {
    await run(["scripts/test-collaborator-migration.mjs"]);
  } else {
    await run(["node_modules/prisma/build/index.js", "migrate", "deploy"]);
    if (process.argv.includes("--frontend")) {
      await assertFree(3102);
      server = spawn(process.execPath, ["--require", "ts-node/register/transpile-only", "scripts/start-integration.ts"], { cwd: backend, env, stdio: ["ignore", "inherit", "inherit", "ipc"] });
      const ready = await new Promise(resolve => {
        const timer = setTimeout(() => resolve(false), 30000);
        server.once("message", message => { clearTimeout(timer); resolve(message?.type === "ready" && message.database === name); });
        server.once("error", () => { clearTimeout(timer); resolve(false); });
        server.once("exit", () => { clearTimeout(timer); resolve(false); });
      });
      if (!ready) throw Error("Owned integration API did not become ready.");
      await run(["node_modules/vitest/vitest.mjs", "run", "--config", "vitest.integration.config.ts"], frontend);
    } else if (process.argv.includes("--firebase")) {
      await startEmulator();
      await run(["node_modules/jest/bin/jest.js", "--config", "jest.firebase-emulator.cjs", "--runInBand"]);
    } else {
      await run(["node_modules/jest/bin/jest.js", "--config", "jest.integration.cjs", "--runInBand"]);
    }
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  stopOwned(server); stopOwned(emulator);
  // Retain the disposable database for inspection. Never delete a volume or backup.
  if (created) {
    try { docker(["stop", container]); } catch { console.error("Could not stop owned test container: " + container); process.exitCode = 1; }
    console.log("Owned test container stopped and retained: " + container);
  }
}
