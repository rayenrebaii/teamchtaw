import { Body, ConflictException, Controller, Get, Injectable, Module, NotFoundException, Param, ParseUUIDPipe, Patch, Post, Put, Query } from "@nestjs/common";
import { Transform } from "class-transformer";
import { IsBoolean, IsEmail, IsOptional, IsString, Length, MaxLength } from "class-validator";
import { Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";
import * as argon2 from "argon2";
import { PrismaService } from "../prisma/prisma.module";
import { AccessService, Actor } from "../common/access";
import { userSelect } from "../common/presenters";
import { Admin, CurrentUser, Organizer } from "../auth/security";
import { AccountLinksService } from "../auth/account-links.service";
import { FirebaseIdentity } from "../auth/firebase.service";
import { passwordOptions } from "../auth/auth.service";
import { DomainEvents } from "../common/events";

export class CreateCollaboratorDto {
  @IsEmail() @MaxLength(254)
  @Transform(({ value }: { value: unknown }) => typeof value === "string" ? value.trim().toLowerCase() : value) email!: string;
  @IsString() @Length(2, 60)
  @Transform(({ value }: { value: unknown }) => typeof value === "string" ? value.trim() : value) firstName!: string;
  @IsString() @Length(2, 60)
  @Transform(({ value }: { value: unknown }) => typeof value === "string" ? value.trim() : value) lastName!: string;
}
export class CollaboratorQueryDto {
  @IsOptional() @IsString() @MaxLength(100) search?: string;
  @IsOptional() @IsString() @MaxLength(20) status?: string;
}
export class DisabledDto { @IsBoolean() disabled!: boolean; }
export class GroupGrantDto { @IsBoolean() granted!: boolean; }

@Injectable()
export class CollaboratorsService {
  constructor(private db: PrismaService, private access: AccessService, private links: AccountLinksService,
    private firebase: FirebaseIdentity, private events: DomainEvents) {}
  async list(actor: Actor, query: CollaboratorQueryDto) {
    return this.db.$transaction(async (tx) => {
      await this.access.actor(tx, actor, true, true);
      const search = query.search?.trim();
      return tx.user.findMany({ where: { role: "COLLABORATOR",
        ...(query.status === "DISABLED" ? { disabledAt: { not: null } } : query.status === "INVITED" ? { activatedAt: null, disabledAt: null } : query.status === "ACTIVE" ? { activatedAt: { not: null }, disabledAt: null } : {}),
        ...(search ? { OR: ["email", "firstName", "lastName"].map((key) => ({ [key]: { contains: search, mode: "insensitive" } })) } : {}) },
        select: { ...userSelect, memberships: { select: { groupId: true } } }, orderBy: [{ joinedAt: "desc" }, { id: "asc" }] });
    });
  }
  async create(actor: Actor, dto: CreateCollaboratorDto) {
    const id = randomUUID();
    const passwordHash = await argon2.hash(randomUUID(), passwordOptions);
    const user = await this.db.$transaction(async (tx) => {
      await this.access.actor(tx, actor, true, true);
      await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtextextended(${dto.email}, 0))`;
      if (await tx.user.findUnique({ where: { email: dto.email } })) throw new ConflictException("Cette adresse est déjà utilisée.");
      if (this.firebase.enabled) await this.firebase.createCollaborator(id, dto.email);
      try { return await tx.user.create({ data: { ...dto, id, passwordHash, role: "COLLABORATOR", status: "PENDING",
        ...(this.firebase.enabled ? { firebaseUid: id } : {}) }, select: userSelect }); }
      catch (error) { if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw new ConflictException("Cette adresse est déjà utilisée."); throw error; }
    }, { timeout: 25000 });
    // Preserve the pending account on delivery failure so the admin can retry explicitly.
    try { return { user, invitation: await this.links.issue(user.id, "INVITE") }; }
    catch { return { user, invitation: { sent: false, message: "Compte créé. Invitation non envoyée : vérifiez la configuration puis renvoyez-la." } }; }
  }
  async issue(actor: Actor, id: string, purpose: "INVITE" | "RESET") {
    await this.db.$transaction(async (tx) => {
      await this.access.actor(tx, actor, true, true);
      if (!await tx.user.findFirst({ where: { id, role: "COLLABORATOR" } })) throw new NotFoundException();
    });
    return this.links.issue(id, purpose);
  }
  async disabled(actor: Actor, id: string, disabled: boolean, role: "USER" | "COLLABORATOR") {
    const sessions = await this.db.$transaction(async (tx) => {
      await this.access.actor(tx, actor, true, true);
      await tx.$queryRaw`SELECT id FROM "User" WHERE id=${id}::uuid FOR UPDATE`;
      if (!await tx.user.findFirst({ where: { id, role } })) throw new NotFoundException();
      await tx.user.update({ where: { id }, data: { disabledAt: disabled ? new Date() : null } });
      if (!disabled) return [];
      await tx.accountLink.updateMany({ where: { userId: id, usedAt: null }, data: { usedAt: new Date() } });
      const active = await tx.refreshSession.findMany({ where: { userId: id, revokedAt: null }, select: { id: true } });
      await tx.refreshSession.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } });
      await tx.pushSubscription.deleteMany({ where: { userId: id } });
      return active;
    });
    for (const session of sessions) await this.events.publish({ name: "session:revoked", sessionId: session.id, payload: {} });
    return { success: true };
  }
  async grant(actor: Actor, userId: string, groupId: string, granted: boolean) {
    await this.db.$transaction(async (tx) => {
      await this.access.group(tx, actor, groupId, true);
      await tx.$queryRaw`SELECT id FROM "User" WHERE id=${userId}::uuid FOR UPDATE`;
      if (!await tx.user.findFirst({ where: { id: userId, role: "COLLABORATOR" } })) throw new NotFoundException();
      if (granted) await tx.groupMember.upsert({ where: { groupId_userId: { groupId, userId } }, create: { groupId, userId }, update: {} });
      else await tx.groupMember.deleteMany({ where: { groupId, userId } });
    });
    await this.events.publish({ name: granted ? "group:member-added" : "group:member-removed", userId, groupId, payload: { groupId, userId } });
    return { success: true };
  }
  async participants(actor: Actor) {
    return this.db.$transaction(async (tx) => {
      await this.access.organizer(tx, actor);
      return tx.user.findMany({ where: { role: "USER", status: "APPROVED", memberships: { some: { group: { members: { some: { userId: actor.id } } } } } }, select: userSelect });
    });
  }
}
@Admin()
@Controller("admin/collaborators")
export class CollaboratorsController {
  constructor(private service: CollaboratorsService) {}
  @Get() list(@CurrentUser() actor: Actor, @Query() query: CollaboratorQueryDto) { return this.service.list(actor, query); }
  @Post() create(@CurrentUser() actor: Actor, @Body() dto: CreateCollaboratorDto) { return this.service.create(actor, dto); }
  @Patch(":id/disabled") disabled(@CurrentUser() actor: Actor, @Param("id", ParseUUIDPipe) id: string, @Body() dto: DisabledDto) { return this.service.disabled(actor, id, dto.disabled, "COLLABORATOR"); }
  @Post(":id/invitation") invite(@CurrentUser() actor: Actor, @Param("id", ParseUUIDPipe) id: string) { return this.service.issue(actor, id, "INVITE"); }
  @Post(":id/reset-password") reset(@CurrentUser() actor: Actor, @Param("id", ParseUUIDPipe) id: string) { return this.service.issue(actor, id, "RESET"); }
  @Put(":id/groups/:groupId") grant(@CurrentUser() actor: Actor, @Param("id", ParseUUIDPipe) id: string, @Param("groupId", ParseUUIDPipe) groupId: string, @Body() dto: GroupGrantDto) { return this.service.grant(actor, id, groupId, dto.granted); }
}
@Controller()
export class OrganizerUsersController {
  constructor(private service: CollaboratorsService) {}
  @Organizer() @Get("organizer/participants") participants(@CurrentUser() actor: Actor) { return this.service.participants(actor); }
  @Admin() @Patch("admin/students/:id/disabled") disabled(@CurrentUser() actor: Actor, @Param("id", ParseUUIDPipe) id: string, @Body() dto: DisabledDto) { return this.service.disabled(actor, id, dto.disabled, "USER"); }
}
@Module({ providers: [CollaboratorsService], controllers: [CollaboratorsController, OrganizerUsersController] })
export class CollaboratorsModule {}
