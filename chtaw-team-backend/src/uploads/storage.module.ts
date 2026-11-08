import { ConflictException, Global, Inject, Injectable, Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { mkdir, writeFile, unlink, stat } from "node:fs/promises";
import { createReadStream } from "node:fs";
import { resolve } from "node:path";
import { Readable } from "node:stream";
import { PrismaService } from "../prisma/prisma.module";
export const MEDIA_STORAGE = Symbol("MEDIA_STORAGE");
export interface MediaStorage {
  put(key: string, data: Buffer): Promise<void>;
  remove(key: string): Promise<void>;
  open(key: string): Promise<Readable>;
}

function validateKey(key: string) {
  if (!/^[0-9a-f-]{36}\.webp$/.test(key)) throw Error("Invalid storage key");
  return key;
}

// Small private WebP assets persist in Neon, with an explicit quota. Reads
// still pass through UploadsService's group membership checks.
export class PostgresMediaStorage implements MediaStorage {
  constructor(private db: PrismaService, private maxBytes = 104857600) {}
  async put(key: string, data: Buffer) {
    validateKey(key);
    if (!data.length || data.length > 10485760) throw new ConflictException("Image trop volumineuse.");
    await this.db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(171142, 1)`;
      const [usage] = await tx.$queryRaw<{ bytes: bigint }[]>`SELECT COALESCE(SUM(octet_length(content)),0)::bigint AS bytes FROM "StoredMedia"`;
      if (Number(usage?.bytes ?? 0) + data.length > this.maxBytes)
        throw new ConflictException("La limite de stockage des images est atteinte.");
      await tx.$executeRaw`INSERT INTO "StoredMedia" (key, content) VALUES (${key}, ${data})`;
    });
  }
  async remove(key: string) {
    validateKey(key);
    await this.db.$executeRaw`DELETE FROM "StoredMedia" WHERE key=${key}`;
  }
  async open(key: string): Promise<Readable> {
    validateKey(key);
    const [row] = await this.db.$queryRaw<{ content: Uint8Array }[]>`SELECT content FROM "StoredMedia" WHERE key=${key}`;
    if (!row) throw Error("Media not found");
    return Readable.from([Buffer.from(row.content)]);
  }
}
@Injectable()
export class LocalMediaStorage implements MediaStorage {
  private directory: string;
  constructor(config: ConfigService) {
    this.directory = config.getOrThrow<string>("UPLOAD_DIR");
  }
  private path(key: string) {
    return resolve(this.directory, validateKey(key));
  }
  async put(key: string, data: Buffer) {
    await mkdir(this.directory, { recursive: true });
    await writeFile(this.path(key), data, { flag: "wx", mode: 0o600 });
  }
  async remove(key: string) {
    await unlink(this.path(key)).catch((e: NodeJS.ErrnoException) => {
      if (e.code !== "ENOENT") throw e;
    });
  }
  async open(key: string) {
    const file = this.path(key);
    await stat(file);
    return createReadStream(file);
  }
}
@Global()
@Module({
  providers: [{
    provide: MEDIA_STORAGE,
    inject: [ConfigService, PrismaService],
    useFactory: (config: ConfigService, db: PrismaService): MediaStorage => config.get("MEDIA_STORAGE", "local") === "postgres"
      ? new PostgresMediaStorage(db, config.get<number>("MEDIA_MAX_TOTAL_BYTES", 104857600))
      : new LocalMediaStorage(config),
  }],
  exports: [MEDIA_STORAGE],
})
export class StorageModule {}
export const Storage = () => Inject(MEDIA_STORAGE);
