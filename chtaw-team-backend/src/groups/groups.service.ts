import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  Logger,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.module";
import { AccessService, Actor } from "../common/access";
import { DomainEvents } from "../common/events";
import { groupInclude, presentGroup, userSelect } from "../common/presenters";
import { CreateGroupDto, UpdateGroupDto } from "./groups.dto";
import { Storage, MediaStorage } from "../uploads/storage.module";
@Injectable()
export class GroupsService {
  private logger = new Logger(GroupsService.name);
  constructor(
    private db: PrismaService,
    private access: AccessService,
    private events: DomainEvents,
    @Storage() private storage: MediaStorage,
  ) {}
  list(actor: Actor) {
    return this.db.$transaction(async (tx) => {
      const user = await this.access.actor(tx, actor);
      return (
        await tx.group.findMany({
          where: user.role === "ADMIN" ? {} : { members: { some: { userId: actor.id } } },
          include: groupInclude,
          orderBy: [{ isGeneral: "desc" }, { createdAt: "asc" }],
        })
      ).map(presentGroup);
    });
  }
  get(actor: Actor, id: string) {
    return this.db.$transaction(async (tx) => {
      await this.access.group(tx, actor, id);
      const group = await tx.group.findUniqueOrThrow({ where: { id }, include: groupInclude });
      const members = await tx.user.findMany({
        where: { memberships: { some: { groupId: id } } },
        select: { id: true, firstName: true, lastName: true, bio: true, role: true },
      });
      return { ...presentGroup(group), members };
    });
  }
  create(actor: Actor, dto: CreateGroupDto) {
    return this.db.$transaction(async (tx) => {
      await this.access.actor(tx, actor, true, true);
      const admins = await tx.user.findMany({
        where: { role: "ADMIN", status: "APPROVED" },
        select: { id: true },
      });
      return presentGroup(
        await tx.group.create({
          data: {
            ...dto,
            color: dto.color ?? "#e9d5ff",
            isGeneral: false,
            members: { create: admins.map((admin) => ({ userId: admin.id })) },
          },
          include: groupInclude,
        }),
      );
    });
  }
  async update(actor: Actor, id: string, dto: UpdateGroupDto) {
    const group = await this.db.$transaction(async (tx) => {
      await this.access.group(tx, actor, id, true);
      if (dto.imageMediaId) {
        const image = await tx.media.findUnique({ where: { id: dto.imageMediaId } });
        if (!image || image.groupId !== id)
          throw new BadRequestException("Image étrangère à ce groupe.");
      }
      return presentGroup(
        await tx.group.update({ where: { id }, data: dto, include: groupInclude }),
      );
    });
    await this.events.publish({ name: "group:updated", groupId: id, payload: group });
    return group;
  }
  async delete(actor: Actor, id: string) {
    const keys = await this.db.$transaction(async (tx) => {
      const group = await this.access.group(tx, actor, id, true);
      if (group.isGeneral) throw new ForbiddenException("Le groupe général est permanent.");
      if (await tx.sessionParticipant.count({ where: { poll: { groupId: id } } }))
        throw new ConflictException("Ce groupe possède des participants de séance historisés. Annulez les séances pour préserver leur historique.");
      if (await tx.poll.count({ where: { groupId: id, attendanceLockedAt: { not: null } } }))
        throw new ConflictException("Ce groupe possède un historique de présence. Conservez-le pour préserver les absences et les corrections.");
      const media = await tx.media.findMany({
        where: { groupId: id },
        select: { storageKey: true },
      });
      await tx.message.deleteMany({ where: { groupId: id } });
      await tx.group.update({ where: { id }, data: { imageMediaId: null } });
      await tx.group.delete({ where: { id } });
      return media.map((m) => m.storageKey);
    });
    await this.events.publish({ name: "group:removed", groupId: id, payload: { groupId: id } });
    await Promise.all(
      keys.map((key) =>
        this.storage
          .remove(key)
          .catch(() => this.logger.warn("Failed to clean deleted group media")),
      ),
    );
  }
  async member(actor: Actor, groupId: string, userId: string, add: boolean) {
    const group = await this.db.$transaction(async (tx) => {
      const group = await this.access.group(tx, actor, groupId, true);
      if (group.isGeneral)
        throw new ForbiddenException("Les affectations du groupe général sont gérées automatiquement.");
      await tx.$queryRaw`SELECT id FROM "User" WHERE id=${userId}::uuid FOR UPDATE`;
      const target = await tx.user.findUnique({ where: { id: userId }, select: userSelect });
      if (!target) throw new NotFoundException();
      if (target.status !== "APPROVED")
        throw new ConflictException("Le membre doit être approuvé.");
      if (!add && target.role === "ADMIN")
        throw new ForbiddenException("Un administrateur ne peut pas être retiré de ce groupe.");
      if (add)
        await tx.groupMember.upsert({
          where: { groupId_userId: { groupId, userId } },
          create: { groupId, userId },
          update: {},
        });
      else await tx.groupMember.deleteMany({ where: { groupId, userId } });
      return presentGroup(
        await tx.group.findUniqueOrThrow({ where: { id: group.id }, include: groupInclude }),
      );
    });
    await this.events.publish({
      name: add ? "group:member-added" : "group:member-removed",
      groupId,
      userId,
      payload: { groupId, userId },
    });
    await this.events.publish({ name: "group:updated", groupId, payload: group });
    return group;
  }
  async move(actor: Actor, userId: string, from: string, to: string) {
    if (from === to) throw new BadRequestException("Choisissez deux groupes différents.");
    const result = await this.db.$transaction(async (tx) => {
      const ids = [from, to].sort();
      for (const id of ids) await this.access.group(tx, actor, id, true);
      const groups = await tx.group.findMany({ where: { id: { in: ids } } });
      if (groups.some((g) => g.isGeneral))
        throw new ForbiddenException("Déplacement impossible depuis ou vers le général.");
      await tx.$queryRaw`SELECT id FROM "User" WHERE id=${userId}::uuid FOR UPDATE`;
      const target = await tx.user.findUnique({ where: { id: userId }, select: userSelect });
      if (!target || target.status !== "APPROVED" || target.role === "ADMIN")
        throw new ConflictException("Membre non déplaçable.");
      if (
        !(await tx.groupMember.findUnique({ where: { groupId_userId: { groupId: from, userId } } }))
      )
        throw new ConflictException("Le membre est absent du groupe source.");
      await tx.groupMember.upsert({
        where: { groupId_userId: { groupId: to, userId } },
        create: { groupId: to, userId },
        update: {},
      });
      await tx.groupMember.delete({ where: { groupId_userId: { groupId: from, userId } } });
      return { userId, fromGroupId: from, toGroupId: to };
    });
    await this.events.publish({
      name: "group:member-removed",
      groupId: from,
      userId,
      payload: { groupId: from, userId },
    });
    await this.events.publish({
      name: "group:member-added",
      groupId: to,
      userId,
      payload: { groupId: to, userId },
    });
    return result;
  }
}
