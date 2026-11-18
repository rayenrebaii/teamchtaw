import { defineConfig } from "@playwright/test";
import base from "./playwright.config";
export default defineConfig({ ...base, testMatch: "analytics.spec.ts", outputDir: "./.test-analytics-browser", use: { ...base.use, baseURL: "http://127.0.0.1:3016" } });
