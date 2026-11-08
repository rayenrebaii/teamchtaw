import { validateEnvironment } from "../src/config/environment";
import { PostgresMediaStorage } from "../src/uploads/storage.module";
import { PrismaService } from "../src/prisma/prisma.module";
describe("Durable storage configuration", () => {
  const env = {
    DATABASE_URL: "postgresql://test:test@localhost:5434/chtaw",
    JWT_ACCESS_SECRET: "a".repeat(64), JWT_REFRESH_SECRET: "b".repeat(64),
    CORS_ORIGINS: "https://pwa.example.test", NODE_ENV: "production", RENDER: "true",
  };
  it("refuses ephemeral files on Render", () => {
    expect(() => validateEnvironment(env)).toThrow("durable external media storage");
  });
  it("accepts PostgreSQL storage with a bounded quota and separate direct connection", () => {
    const value = validateEnvironment({ ...env, MEDIA_STORAGE: "postgres", DATABASE_DIRECT_URL: "postgresql://direct:test@localhost:5434/chtaw" });
    expect(value.MEDIA_MAX_TOTAL_BYTES).toBe(104857600);
    expect(value.DATABASE_DIRECT_URL).not.toBe(value.DATABASE_URL);
    expect(() => validateEnvironment({ ...env, MEDIA_STORAGE: "postgres", MEDIA_MAX_TOTAL_BYTES: -1 })).toThrow();
  });
  it("rejects arbitrary keys before using the database", async () => {
    const query = jest.fn();
    const storage = new PostgresMediaStorage({ $queryRaw: query } as unknown as PrismaService);
    await expect(storage.open("../secret.env")).rejects.toThrow("Invalid storage key");
    await expect(storage.put("../secret.env", Buffer.from("x"))).rejects.toThrow("Invalid storage key");
    await expect(storage.remove("../secret.env")).rejects.toThrow("Invalid storage key");
    expect(query).not.toHaveBeenCalled();
  });
});
