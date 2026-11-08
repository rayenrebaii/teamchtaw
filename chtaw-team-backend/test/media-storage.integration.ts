import { ConfigService } from "@nestjs/config";
import { randomUUID } from "node:crypto";
import { PrismaService } from "../src/prisma/prisma.module";
import { PostgresMediaStorage } from "../src/uploads/storage.module";
describe("Durable PostgreSQL images", () => {
  let db: PrismaService;
  beforeAll(async () => {
    const url = process.env.TEST_DATABASE_URL;
    if (!url || !/^\/chtaw_test_[a-f0-9]{12}$/.test(new URL(url).pathname) || process.env.ISOLATED_TEST_DATABASE !== new URL(url).pathname.slice(1))
      throw Error("A new isolated test database is required.");
    db = new PrismaService(new ConfigService({ DATABASE_URL: url }));
    await db.$connect();
  });
  afterAll(async () => { await db?.$disconnect(); });
  it("persists bytes between storage instances, rejects overwrite, and removes only the requested image", async () => {
    const key = randomUUID() + ".webp", data = Buffer.from("disposable-durable-image");
    const first = new PostgresMediaStorage(db);
    await first.put(key, data);
    await expect(first.put(key, Buffer.from("overwrite"))).rejects.toThrow();
    const second = new PostgresMediaStorage(db);
    const chunks: Buffer[] = [];
    for await (const chunk of await second.open(key)) chunks.push(Buffer.from(chunk));
    expect(Buffer.concat(chunks)).toEqual(data);
    await second.remove(key);
    await second.remove(key);
    await expect(second.open(key)).rejects.toThrow("Media not found");
  });
  it("refuses writes beyond the total quota without leaving a partial image", async () => {
    const key = randomUUID() + ".webp";
    const storage = new PostgresMediaStorage(db, 1);
    await expect(storage.put(key, Buffer.from("too large"))).rejects.toThrow("limite de stockage");
    await expect(storage.open(key)).rejects.toThrow("Media not found");
  });
});
