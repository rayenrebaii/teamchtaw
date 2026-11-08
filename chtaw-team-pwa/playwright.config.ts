import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./test/browser",
  outputDir: "./.test-browser-results",
  fullyParallel: false,
  workers: 1,
  timeout: 45000,
  reporter: "list",
  use: { baseURL: "http://127.0.0.1:3001", channel: "msedge", headless: true, screenshot: "only-on-failure" },
});
