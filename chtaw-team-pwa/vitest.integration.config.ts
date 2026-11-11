import { createRequire } from "node:module";
const safety = createRequire(import.meta.url)("../chtaw-team-backend/scripts/test-safety.cjs");
safety.assertTestContext();
import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: {
    include: ["test/**/*.integration.ts"],
    environment: "node",
    testTimeout: 30000,
    hookTimeout: 30000,
    env: {
      NEXT_PUBLIC_API_URL: "http://127.0.0.1:3102/api/v1",
      NEXT_PUBLIC_SOCKET_URL: "http://127.0.0.1:3102",
    },
  },
});
