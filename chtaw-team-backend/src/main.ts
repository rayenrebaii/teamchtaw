import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { ConfigService } from "@nestjs/config";
import { AppModule } from "./app.module";
import { configureApp } from "./bootstrap";
async function main() {
  const app = configureApp(
    await NestFactory.create(AppModule, { bodyParser: false, logger: ["log", "warn", "error"] }),
  );
  const config = app.get(ConfigService);
  await app.listen(config.getOrThrow<number>("PORT"), config.getOrThrow<string>("HOST"));
}
void main().catch(() => {
  console.error("Backend startup failed. Check database and configuration.");
  process.exitCode = 1;
});
