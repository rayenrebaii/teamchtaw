import { Global, Inject, Injectable, Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { mkdir, writeFile, unlink, stat } from "node:fs/promises";
import { createReadStream } from "node:fs";
import { resolve } from "node:path";
export const MEDIA_STORAGE = Symbol("MEDIA_STORAGE");
export interface MediaStorage {
  put(key: string, data: Buffer): Promise<void>;
  remove(key: string): Promise<void>;
  open(key: string): Promise<ReturnType<typeof createReadStream>>;
}
@Injectable()
export class LocalMediaStorage implements MediaStorage {
  private directory: string;
  constructor(config: ConfigService) {
    this.directory = config.getOrThrow<string>("UPLOAD_DIR");
  }
  private path(key: string) {
    if (!/^[0-9a-f-]{36}\.webp$/.test(key)) throw Error("Invalid storage key");
    return resolve(this.directory, key);
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
  providers: [{ provide: MEDIA_STORAGE, useClass: LocalMediaStorage }],
  exports: [MEDIA_STORAGE],
})
export class StorageModule {}
export const Storage = () => Inject(MEDIA_STORAGE);
