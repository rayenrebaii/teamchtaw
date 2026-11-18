import { defineConfig } from "@playwright/test";
import base from "./playwright.tables.config";
export default defineConfig({ ...base, outputDir: "./.test-analytics-browser/tables-production", use: { ...base.use, baseURL: "https://teamchtaw-pwa.vercel.app" } });
