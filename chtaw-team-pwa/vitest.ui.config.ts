import { createRequire } from "node:module";
const safety = createRequire(import.meta.url)("../chtaw-team-backend/scripts/test-safety.cjs");
safety.assertTestContext();
import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) }, dedupe: ["react", "react-dom"] },
  test: { include: ["src/**/*.ui.test.tsx"], environment: "jsdom" },
});
