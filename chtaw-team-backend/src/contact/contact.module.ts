import { BadRequestException, Body, Controller, Get, Header, HttpException, Injectable, Module, NotFoundException, Param, ParseUUIDPipe, Patch, Post, Query, Req } from "@nestjs/common";
import { Transform } from "class-transformer";
import { IsEmail, IsIn, IsString, Length, MaxLength } from "class-validator";
import { Throttle } from "@nestjs/throttler";
import { createHash } from "node:crypto";
import type { ContactHttpRequest } from "./client-ip";
import { Admin, CurrentUser, Public } from "../auth/security";
import { AuthModule } from "../auth/auth.module";
import { AccessService, Actor } from "../common/access";
import { PrismaService } from "../prisma/prisma.module";

export const subjects = ["registration", "approval", "login", "sessions", "other"] as const;
const trim = Transform(({ value }: { value: unknown }) => typeof value === "string" ? value.trim() : value);
export class ContactDto {
  @trim @IsString() @Length(2, 120) name!: string;
  @trim @IsEmail() @MaxLength(254) email!: string;
  @IsIn(subjects) subject!: typeof subjects[number];
  @trim @IsString() @Length(10, 5000) message!: string;
  // Honeypot: hidden from visitors, never silently accepted.
  @IsString() @MaxLength(0) website!: string;
}
class ContactStatusDto { @IsIn(["NEW", "PROCESSED"]) status!: "NEW" | "PROCESSED"; }
const summary = { id: true, name: true, subject: true, status: true, createdAt: true } as const;
const detail = { ...summary, email: true, message: true, processedAt: true } as const;

@Injectable()
export class ContactService {
  constructor(private db: PrismaService, private access: AccessService) {}
  async receive(dto: ContactDto, ip: string) {
    if (!ip) throw new BadRequestException("Adresse réseau indisponible.");
    const senderHash = createHash("sha256").update(`chtaw-contact:${ip}`).digest("hex");
    await this.db.$transaction(async tx => {
      // Serialize per sender across workers; limits survive restarts.
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${senderHash}))::text`;
      const count = await tx.contactRequest.count({ where: { senderHash, createdAt: { gte: new Date(Date.now() - 15 * 60_000) } } });
      if (count >= 3) throw new HttpException("Trop de demandes. Réessayez dans 15 minutes.", 429);
      await tx.contactRequest.create({ data: { name: dto.name, email: dto.email, subject: dto.subject, message: dto.message, senderHash } });
    });
    return { received: true };
  }
  list(actor: Actor, cursor?: string) {
    return this.db.$transaction(async tx => {
      await this.access.actor(tx, actor, true, true);
      return tx.contactRequest.findMany({ select: summary, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 50,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}) });
    });
  }
  get(actor: Actor, id: string) {
    return this.db.$transaction(async tx => {
      await this.access.actor(tx, actor, true, true);
      const item = await tx.contactRequest.findUnique({ where: { id }, select: detail });
      if (!item) throw new NotFoundException("Demande introuvable.");
      return item;
    });
  }
  update(actor: Actor, id: string, status: "NEW" | "PROCESSED") {
    return this.db.$transaction(async tx => {
      await this.access.actor(tx, actor, true, true);
      if (!await tx.contactRequest.findUnique({ where: { id }, select: { id: true } })) throw new NotFoundException("Demande introuvable.");
      return tx.contactRequest.update({ where: { id }, data: { status, processedAt: status === "PROCESSED" ? new Date() : null }, select: detail });
    });
  }
}

@Controller("contact")
export class PublicContactController {
  constructor(private service: ContactService) {}
  @Public() @Post() @Throttle({ default: { limit: 3, ttl: 900000, getTracker: request => request.contactClientIp ?? request.ip } })
  receive(@Body() dto: ContactDto, @Req() request: ContactHttpRequest) {
    // Never trust arbitrary X-Forwarded-For headers.
    return this.service.receive(dto, request.contactClientIp ?? request.ip ?? "");
  }
}
@Admin() @Controller("admin/contact-requests")
export class AdminContactController {
  constructor(private service: ContactService) {}
  @Get() @Header("Cache-Control", "private, no-store")
  list(@CurrentUser() actor: Actor, @Query("cursor", new ParseUUIDPipe({ optional: true })) cursor?: string) { return this.service.list(actor, cursor); }
  @Get(":id") @Header("Cache-Control", "private, no-store")
  get(@CurrentUser() actor: Actor, @Param("id", ParseUUIDPipe) id: string) { return this.service.get(actor, id); }
  @Patch(":id") @Header("Cache-Control", "private, no-store")
  update(@CurrentUser() actor: Actor, @Param("id", ParseUUIDPipe) id: string, @Body() dto: ContactStatusDto) { return this.service.update(actor, id, dto.status); }
}
@Module({ imports: [AuthModule], controllers: [PublicContactController, AdminContactController], providers: [ContactService] })
export class ContactModule {}
