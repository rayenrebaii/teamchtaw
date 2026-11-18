import { defineConfig } from "@playwright/test";
import base from "./playwright.config";
export default defineConfig({ ...base, testMatch: "attendance-tables.spec.ts", outputDir: "./.test-analytics-browser/tables", use: { ...base.use, baseURL: "http://127.0.0.1:3016" } });
