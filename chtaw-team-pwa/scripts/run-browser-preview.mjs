import { spawn } from "node:child_process";

// Own this preview process so validation never reuses or stops a developer's server.
const port = "3103";
const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", port], { stdio: ["ignore", "pipe", "inherit"] });
try {
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(Error("Browser preview did not start.")), 15000);
    server.stdout.on("data", (chunk) => { if (chunk.toString().includes("Ready")) { clearTimeout(timer); resolve(); } });
    server.once("error", reject);
    server.once("exit", (code) => { clearTimeout(timer); reject(Error(`Browser preview exited (${code}).`)); });
  });
  const runner = spawn(process.execPath, ["node_modules/@playwright/test/cli.js", "test", ...process.argv.slice(2)], {
    stdio: "inherit", env: { ...process.env, PLAYWRIGHT_BASE_URL: `http://127.0.0.1:${port}` },
  });
  process.exitCode = await new Promise((resolve, reject) => { runner.once("error", reject); runner.once("exit", (code) => resolve(code ?? 1)); });
} finally { server.kill(); }
