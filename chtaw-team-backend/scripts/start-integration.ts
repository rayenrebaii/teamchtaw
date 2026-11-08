import "reflect-metadata";
import "dotenv/config";
import { execFileSync } from "node:child_process";
import { NestFactory } from "@nestjs/core";
async function main() {
  const url = process.env.TEST_DATABASE_URL;
  if (!url || !/^\/chtaw_test_[a-f0-9]{12}$/.test(new URL(url).pathname) || process.env.ISOLATED_TEST_DATABASE !== new URL(url).pathname.slice(1))
    throw Error("A newly created isolated test database is required.");
  process.env.DATABASE_URL = url;
  process.env.NODE_ENV = "test";
  process.env.PORT = "3102";
  process.env.UPLOAD_DIR ??= "./uploads/integration";
  execFileSync(process.execPath, ["node_modules/tsx/dist/cli.mjs", "prisma/seed.ts"], {
    env: {
      ...process.env,
      SEED_ADMIN_EMAIL: "e2e-admin@chtaw.test",
      SEED_ADMIN_PASSWORD: "Chtaw-E2E-Only-Password-2026!",
    },
    stdio: "pipe",
  });
  const { AppModule } = await import("../src/app.module");
  const { configureApp } = await import("../src/bootstrap");
  const app = configureApp(
    await NestFactory.create(AppModule, { bodyParser: false, logger: ["error", "warn"] }),
  );
  await app.listen(3102, "127.0.0.1");
  process.send?.({ type: "ready", database: new URL(url).pathname.slice(1) });
  console.log("Integration API ready: http://127.0.0.1:3102 (new isolated database)");
}
void main().catch(() => {
  console.error("Integration API failed. Use npm run test:frontend:isolated.");
  process.exitCode = 1;
});
