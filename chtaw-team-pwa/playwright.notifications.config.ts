import { createRequire } from "node:module";
import { defineConfig } from "@playwright/test";
createRequire(import.meta.url)("../chtaw-team-backend/scripts/test-safety.cjs").assertTestContext();
const published = process.env.NOTIFICATIONS_PUBLISHED_UI === "1";
export default defineConfig({
  testDir: "./test/browser", testMatch: "notifications-mentions.spec.ts",
  outputDir: published ? "./.test-browser-results/production-notifications" : "./.test-browser-results/local-notifications",
  workers: 1, timeout: 45000, reporter: "list",
  use: { baseURL: published ? "https://teamchtaw-pwa.vercel.app" : "http://127.0.0.1:3126", channel: "msedge", headless: true, serviceWorkers: "block", screenshot: "only-on-failure" },
});
