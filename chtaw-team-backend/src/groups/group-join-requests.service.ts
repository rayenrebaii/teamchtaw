import { ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.module";
import { AccessService, Actor } from "../common/access";
import { DomainEvents } from "../common/events";

@Injectable()
export class GroupJoinRequestsService {
  constructor(private db: PrismaService, private access: AccessService, private events: DomainEvents) {}

  directory(actor: Actor) {
    return this.db.$transaction(async (tx) => {
      await this.access.actor(tx, actor);
      const groups = await tx.group.findMany({
        select: { id: true, name: true, isGeneral: true,
          members: { where: { userId: actor.id }, select: { userId: true } },
          joinRequests: { where: { userId: actor.id }, select: { status: true } } },
        orderBy: [{ isGeneral: "desc" }, { name: "asc" }, { id: "asc" }],
      });
      // No descriptions, member identities, images, messages or polls for nonmembers.
      return groups.map((group) => ({ id: group.id, name: group.name, isGeneral: group.isGeneral,
        isMember: group.members.length > 0, requestStatus: group.joinRequests[0]?.status ?? null }));
    });
  }

  request(actor: Actor, groupId: string) {
    return this.db.$transaction(async (tx) => {
      const group = await this.access.lockGroup(tx, groupId);
      await tx.$queryRaw`SELECT id FROM "User" WHERE id=${actor.id}::uuid FOR UPDATE`;
      const user = await this.access.actor(tx, actor);
      if (user.role !== "USER" && user.role !== "COLLABORATOR") throw new ForbiddenException();
      if (group.isGeneral || await tx.groupMember.findUnique({ where: { groupId_userId: { groupId, userId: actor.id } } }))
        throw new ConflictException("Vous faites déjà partie de ce groupe.");
      if (await tx.groupJoinRequest.findUnique({ where: { groupId_userId: { groupId, userId: actor.id } } }))
        throw new ConflictException("Une seule demande par groupe est autorisée, même après un refus.");
      return tx.groupJoinRequest.create({ data: { groupId, userId: actor.id }, select: { id: true, status: true } });
    });
  }

  pending(actor: Actor) {
    return this.db.$transaction(async (tx) => {
      await this.access.actor(tx, actor, true, true);
      return tx.groupJoinRequest.findMany({ where: { status: "PENDING" },
        select: { id: true, createdAt: true, status: true, group: { select: { id: true, name: true } },
          user: { select: { id: true, firstName: true, lastName: true, email: true, role: true } } },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }] });
    });
  }

  async review(actor: Actor, id: string, status: "APPROVED" | "REJECTED") {
    const result = await this.db.$transaction(async (tx) => {
      await this.access.actor(tx, actor, true, true);
      const located = await tx.groupJoinRequest.findUnique({ where: { id } });
      if (!located) throw new NotFoundException("Demande introuvable.");
      await this.access.lockGroup(tx, located.groupId);
      await tx.$queryRaw`SELECT id FROM "User" WHERE id=${located.userId}::uuid FOR UPDATE`;
      const current = await tx.groupJoinRequest.findUnique({ where: { id }, include: { user: { select: { status: true, disabledAt: true, role: true } } } });
      if (!current || current.status !== "PENDING") throw new ConflictException("Cette demande a déjà été traitée.");
      if (status === "APPROVED") {
        if (current.user.status !== "APPROVED" || current.user.disabledAt || !["USER", "COLLABORATOR"].includes(current.user.role))
          throw new ConflictException("Ce compte ne peut pas rejoindre le groupe.");
        await tx.groupMember.upsert({ where: { groupId_userId: { groupId: current.groupId, userId: current.userId } },
          create: { groupId: current.groupId, userId: current.userId }, update: {} });
      }
      return tx.groupJoinRequest.update({ where: { id }, data: { status, reviewedAt: new Date(), reviewedBy: actor.id },
        select: { id: true, groupId: true, userId: true, status: true } });
    });
    if (status === "APPROVED") await this.events.publish({ name: "group:member-added", groupId: result.groupId,
      userId: result.userId, payload: { groupId: result.groupId, userId: result.userId } });
    return result;
  }
}
