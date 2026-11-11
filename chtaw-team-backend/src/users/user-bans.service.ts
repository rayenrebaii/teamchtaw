import { ConflictException, ForbiddenException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.module";
import { AccessService, Actor } from "../common/access";
import { DomainEvents } from "../common/events";
import { groupInclude, presentGroup } from "../common/presenters";
import { Storage, MediaStorage } from "../uploads/storage.module";
import { reconcileAbsences } from "../polls/attendance.reconcile";

@Injectable()
export class UserBansService {
  private logger = new Logger(UserBansService.name);
  constructor(
    private db: PrismaService,
    private access: AccessService,
    private events: DomainEvents,
    @Storage() private storage: MediaStorage,
  ) {}

  async remove(actor: Actor, userId: string) {
    const result = await this.db.$transaction(async (tx) => {
      await this.access.actor(tx, actor, true, true);
      // Use the same group-before-user lock order as membership and approval writers.
      await tx.$queryRaw`SELECT id FROM "Group" WHERE id IN (
        SELECT "groupId" FROM "GroupMember" WHERE "userId" = ${userId}::uuid
        UNION SELECT "groupId" FROM "Media" WHERE "uploaderId" = ${userId}::uuid
        UNION SELECT "groupId" FROM "Poll" WHERE "authorId" = ${userId}::uuid
      ) ORDER BY id FOR UPDATE`;
      // Lock the removed account and students affected by its authored sessions in stable order.
      await tx.$queryRaw`SELECT id FROM "User" WHERE id IN (
        SELECT ${userId}::uuid
        UNION SELECT s."userId" FROM "SessionParticipant" s JOIN "Poll" p ON p.id=s."pollId" WHERE p."authorId"=${userId}::uuid
        UNION SELECT v."userId" FROM "PollVote" v JOIN "Poll" p ON p.id=v."pollId" WHERE p."authorId"=${userId}::uuid
      ) ORDER BY id FOR UPDATE`;
      const user = await tx.user.findUnique({ where: { id: userId } });
      if (!user) throw new NotFoundException("Compte introuvable.");
      if (user.id === actor.id || user.role === "ADMIN")
        throw new ForbiddenException("Un compte administrateur ne peut pas être supprimé.");
      if (user.status !== "APPROVED" && user.role !== "COLLABORATOR")
        throw new ConflictException("Seul un membre approuvé peut être banni.");
      const affectedStudents = await tx.user.findMany({
        where: { id: { not: userId }, role: "USER", OR: [
          { sessionParticipants: { some: { poll: { authorId: userId } } } },
          { votes: { some: { poll: { authorId: userId } } } },
        ] },
        select: { id: true },
      });

      const memberships = await tx.groupMember.findMany({ where: { userId }, select: { groupId: true } });
      const sessions = await tx.refreshSession.findMany({ where: { userId }, select: { id: true } });
      const media = await tx.media.findMany({ where: { uploaderId: userId }, select: { storageKey: true } });
      const ownPoll = { authorId: userId };
      const ownParticipation = { OR: [{ userId }, { poll: ownPoll }] };
      const messages = await tx.message.findMany({
        where: { OR: [{ authorId: userId }, { media: { uploaderId: userId } }, { poll: ownPoll }] },
        select: { id: true },
      });
      const polls = await tx.poll.findMany({ where: ownPoll, select: { id: true } });
      await tx.organizerAbsenceAlert.deleteMany({ where: { OR: [{ userId }, { organizerId: userId }] } });
      await tx.organizerAbsenceState.deleteMany({ where: { OR: [{ userId }, { organizerId: userId }] } });
      // Remove dependent rows in FK order. The transaction rolls back every change on failure.
      await tx.sessionAttendanceEdit.deleteMany({ where: {
        OR: [{ actorId: userId }, { userId }, { participant: { poll: ownPoll } }],
      } });
      await tx.sessionMark.deleteMany({ where: { OR: [{ userId }, { participant: { poll: ownPoll } }] } });
      await tx.sessionParticipant.deleteMany({ where: ownParticipation });
      await tx.attendanceEdit.deleteMany({
        where: { OR: [{ actorId: userId }, { selection: { vote: { OR: [{ userId }, { poll: ownPoll }] } } }] },
      });
      await tx.pollVote.deleteMany({ where: { OR: [{ userId }, { poll: ownPoll }] } });
      await tx.notification.deleteMany({ where: {
        OR: [{ userId }, { entityId: { in: [...messages, ...polls].map((item) => item.id) } }],
      } });
      await tx.message.deleteMany({ where: { id: { in: messages.map((message) => message.id) } } });
      await tx.poll.deleteMany({ where: ownPoll });
      await tx.media.deleteMany({ where: { uploaderId: userId } });
      await tx.admissionDecision.deleteMany({ where: { OR: [{ userId }, { actorId: userId }] } });
      await tx.$executeRaw`UPDATE "NotificationEvent" SET "recipientIds" = array_remove("recipientIds", ${userId}::uuid)
        WHERE ${userId}::uuid = ANY("recipientIds")`;
      // Cascades also remove every group membership, session and personal notification.
      await tx.user.delete({ where: { id: userId } });
      await reconcileAbsences(tx, affectedStudents.map((student) => student.id), "Séances supprimées");
      const groups = await tx.group.findMany({
        where: { id: { in: memberships.map((membership) => membership.groupId) } }, include: groupInclude,
      });
      return { sessions, media, groups: groups.map(presentGroup) };
    }, { timeout: 15000 });

    for (const session of result.sessions)
      await this.events.publish({ name: "session:revoked", sessionId: session.id, payload: {} });
    for (const group of result.groups)
      await this.events.publish({ name: "group:updated", groupId: group.id, payload: group });
    await this.events.publish({ name: "user:deleted", userId, payload: { userId } });
    await Promise.all(result.media.map(({ storageKey }) => this.storage.remove(storageKey)
      .catch(() => this.logger.warn("Failed to clean deleted account media"))));
  }
}
