import { BadRequestException, Controller, Delete, Get, HttpCode, Injectable, Logger, Module, NotFoundException, OnModuleDestroy, OnModuleInit, Param, ParseUUIDPipe, Post, Res, StreamableFile, UploadedFile, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { Throttle } from "@nestjs/throttler";
import { randomUUID } from "node:crypto";
import type { Response } from "express";
import { PrismaService } from "../prisma/prisma.module";
import { AccessService, Actor } from "../common/access";
import { AllowUnapproved, CurrentUser } from "../auth/security";
import { accountSelect as userSelect } from "../common/presenters";
import { Storage, MediaStorage } from "../uploads/storage.module";
import { sanitizeImage } from "../uploads/uploads.module";

@Injectable()
export class ProfilePhotosService implements OnModuleInit, OnModuleDestroy {
  private logger = new Logger(ProfilePhotosService.name);
  private timer?: ReturnType<typeof setInterval>;
  private cleaning = false;
  constructor(private db: PrismaService, private access: AccessService, @Storage() private storage: MediaStorage) {}
  onModuleInit() { this.timer = setInterval(() => { void this.cleanup(); }, 30000); this.timer.unref(); }
  onModuleDestroy() { if (this.timer) clearInterval(this.timer); }
  async cleanup(readyKeys: string[] = []) {
    if (this.cleaning) return;
    this.cleaning = true;
    try {
      for (const job of await this.db.profilePhotoCleanup.findMany({ where: { OR: [{ createdAt: { lt: new Date(Date.now() - 120000) } }, { storageKey: { in: readyKeys } }] }, take: 50, orderBy: { createdAt: "asc" } })) {
        try {
          const id = job.storageKey.slice(0, -5);
          if (await this.db.user.count({ where: { profilePhotoId: id } })) continue;
          await this.storage.remove(job.storageKey);
          await this.db.profilePhotoCleanup.deleteMany({ where: { storageKey: job.storageKey } });
        } catch { this.logger.warn("Profile photo cleanup deferred; durable retry retained."); }
      }
    } catch { this.logger.warn("Profile photo cleanup temporarily unavailable."); }
    finally { this.cleaning = false; }
  }
  async save(actor: Actor, file?: Express.Multer.File) {
    await this.db.$transaction(tx => this.access.actor(tx, actor, false));
    if (!file) throw new BadRequestException("Image requise dans le champ file.");
    const image = await sanitizeImage(file.buffer, 5 * 1024 * 1024, 512);
    const photoId = randomUUID(), key = `${photoId}.webp`;
    // Reserve durable cleanup before writing storage. Fresh in-flight uploads are
    // excluded from periodic cleanup; attachment removes this reservation atomically.
    await this.db.profilePhotoCleanup.create({ data: { storageKey: key } });
    let result;
    const retired: string[] = [];
    try {
      await this.storage.put(key, image.buffer);
      result = await this.db.$transaction(async tx => {
        await tx.$queryRaw`SELECT id FROM "User" WHERE id=${actor.id}::uuid FOR UPDATE`;
        await this.access.actor(tx, actor, false);
        const previous = await tx.user.findUniqueOrThrow({ where: { id: actor.id }, select: { profilePhotoId: true } });
        if (previous.profilePhotoId) {
          retired.push(`${previous.profilePhotoId}.webp`);
          await tx.profilePhotoCleanup.upsert({ where: { storageKey: `${previous.profilePhotoId}.webp` }, create: { storageKey: `${previous.profilePhotoId}.webp` }, update: {} });
        }
        await tx.profilePhotoCleanup.deleteMany({ where: { storageKey: key } });
        return tx.user.update({ where: { id: actor.id }, data: { profilePhotoId: photoId }, select: userSelect });
      });
    } catch (error) {
      // Persist failed-upload cleanup as well, including temporary storage failures.
      await this.cleanup([key]);
      throw error;
    }
    await this.cleanup(retired);
    return result;
  }
  async remove(actor: Actor) {
    const retired: string[] = [];
    const user = await this.db.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM "User" WHERE id=${actor.id}::uuid FOR UPDATE`;
      await this.access.actor(tx, actor, false);
      const previous = await tx.user.findUniqueOrThrow({ where: { id: actor.id }, select: { profilePhotoId: true } });
      if (previous.profilePhotoId) {
        retired.push(`${previous.profilePhotoId}.webp`);
        await tx.profilePhotoCleanup.upsert({ where: { storageKey: `${previous.profilePhotoId}.webp` }, create: { storageKey: `${previous.profilePhotoId}.webp` }, update: {} });
      }
      return tx.user.update({ where: { id: actor.id }, data: { profilePhotoId: null }, select: userSelect });
    });
    await this.cleanup(retired);
    return user;
  }
  async open(actor: Actor, userId: string, photoId: string) {
    await this.db.$transaction(async tx => {
      const current = await this.access.actor(tx, actor, false);
      const target = await tx.user.findUnique({ where: { id: userId }, select: { profilePhotoId: true, status: true, disabledAt: true } });
      if (!target || target.disabledAt || target.profilePhotoId !== photoId) throw new NotFoundException("Image indisponible.");
      if (current.id !== userId) {
        await this.access.actor(tx, actor);
        if (current.role !== "ADMIN") {
          if (target.status !== "APPROVED" || !await tx.groupMember.findFirst({ where: { userId, group: { members: { some: { userId: actor.id } } } }, select: { userId: true } }))
            throw new NotFoundException("Image indisponible.");
        }
      }
    });
    try { return await this.storage.open(`${photoId}.webp`); }
    catch { throw new NotFoundException("Image indisponible."); }
  }
}

@Controller()
export class ProfilePhotosController {
  constructor(private photos: ProfilePhotosService) {}
  @AllowUnapproved() @Post("users/me/photo") @Throttle({ default: { ttl: 60000, limit: 10 } })
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 0, parts: 1 } }))
  save(@CurrentUser() actor: Actor, @UploadedFile() file?: Express.Multer.File) { return this.photos.save(actor, file); }
  @AllowUnapproved() @Delete("users/me/photo") @HttpCode(200)
  remove(@CurrentUser() actor: Actor) { return this.photos.remove(actor); }
  @AllowUnapproved() @Get("profile-photos/:userId/:photoId")
  async open(@CurrentUser() actor: Actor, @Param("userId", ParseUUIDPipe) userId: string, @Param("photoId", ParseUUIDPipe) photoId: string, @Res({ passthrough: true }) response: Response) {
    const stream = await this.photos.open(actor, userId, photoId);
    response.set({ "Content-Type": "image/webp", "Cache-Control": "private, no-store", "Content-Disposition": 'inline; filename="profile.webp"', "X-Content-Type-Options": "nosniff" });
    return new StreamableFile(stream);
  }
}
@Module({ controllers: [ProfilePhotosController], providers: [ProfilePhotosService] })
export class ProfilePhotosModule {}
