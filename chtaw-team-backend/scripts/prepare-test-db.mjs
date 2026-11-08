import "dotenv/config";
import { spawnSync } from "node:child_process";
const url = process.env.TEST_DATABASE_URL;
if (!url || new URL(url).pathname !== "/chtaw_test")
  throw Error("TEST_DATABASE_URL must point to dedicated database chtaw_test.");
const result = spawnSync(
  process.execPath,
  ["node_modules/prisma/build/index.js", "migrate", "deploy"],
  { env: { ...process.env, DATABASE_URL: url }, stdio: "inherit" },
);
process.exitCode = result.status ?? 1;
