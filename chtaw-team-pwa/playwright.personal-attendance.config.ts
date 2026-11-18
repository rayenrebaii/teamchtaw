import { createRequire } from "node:module";
import { defineConfig } from "@playwright/test";
createRequire(import.meta.url)("../chtaw-team-backend/scripts/test-safety.cjs").assertTestContext();
const published = process.env.PERSONAL_ATTENDANCE_PUBLISHED_UI === "1";
const port = Number(process.env.PERSONAL_ATTENDANCE_PREVIEW_PORT || 3127);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw Error("Invalid local preview port.");
export default defineConfig({
  testDir: "./test/browser", testMatch: "personal-attendance.spec.ts",
  outputDir: published ? "./.test-browser-results/production-personal-attendance" : "./.test-browser-results/local-personal-attendance",
  workers: 1, timeout: 45000, reporter: "list",
  use: { baseURL: published ? "https://teamchtaw-pwa.vercel.app" : `http://127.0.0.1:${port}`, channel: "msedge", headless: true, serviceWorkers: "block", screenshot: "only-on-failure" },
});
