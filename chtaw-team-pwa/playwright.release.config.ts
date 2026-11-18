import { defineConfig } from "@playwright/test";
import base from "./playwright.config";
export default defineConfig({ ...base, testMatch: ["analytics.spec.ts", "administration-agents.spec.ts"], outputDir: "./.test-analytics-browser/release", use: { ...base.use, baseURL: "https://teamchtaw-pwa.vercel.app" } });
