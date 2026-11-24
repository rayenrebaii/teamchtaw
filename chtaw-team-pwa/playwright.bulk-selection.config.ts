import { defineConfig } from "@playwright/test";
import base from "./playwright.config";
export default defineConfig({ ...base, testMatch: "bulk-selection.spec.ts", outputDir: "./.test-browser-results/bulk-selection", use: { ...base.use, baseURL: "http://127.0.0.1:3016" } });
