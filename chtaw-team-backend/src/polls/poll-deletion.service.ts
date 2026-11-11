import { ForbiddenException, Injectable, Module, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.module";
import { AccessService, Actor } from "../common/access";
import { DomainEvents } from "../common/events";
import { reconcileAbsences } from "./attendance.reconcile";
import { sessionDeletionMode } from "./session-deletion.rules";

@Injectable()
export class PollDeletionService {
  constructor(private db: PrismaService, private access: AccessService, private events: DomainEvents) {}

  async remove(actor: Actor, id: string) {
    const groupId = await this.db.$transaction(async (tx) => {
      const user = await this.access.organizer(tx, actor);
      const located = await tx.poll.findUnique({ where: { id }, select: { groupId: true, authorId: true } });
      if (!located) throw new NotFoundException("Sondage introuvable.");
      await this.access.group(tx, actor, located.groupId);
      if (user.role !== "ADMIN" && located.authorId !== user.id)
        throw new ForbiddenException("Vous pouvez uniquement supprimer vos propres sondages.");
      await tx.$queryRaw`SELECT id FROM "Poll" WHERE id=${id}::uuid FOR UPDATE`;
      const poll = await tx.poll.findUnique({ where: { id }, include: { options: true, votes: { include: { options: true } }, participants: { include: { marks: true } }, group: true } });
      if (!poll || poll.archivedAt) throw new NotFoundException("Sondage introuvable.");
      const mode = sessionDeletionMode(poll);
      const ids = [...new Set([...poll.votes.map((vote) => vote.userId), ...poll.participants.map((person) => person.userId)])].sort();
      for (const userId of ids) await tx.$queryRaw`SELECT id FROM "User" WHERE id=${userId}::uuid FOR UPDATE`;
      const messages = await tx.message.findMany({ where: { pollId: id }, select: { id: true } });
      await tx.notification.deleteMany({ where: { entityId: { in: [id, ...messages.map((message) => message.id)] } } });
      await tx.message.deleteMany({ where: { pollId: id } });
      await tx.sessionReminderDelivery.deleteMany({ where: { sessionId: id } });
      if (mode === "ARCHIVE") {
        // Keep attendance, dates and audit records used by histories and absence totals.
        // Mandatory attendance is independent of voting; its obsolete ballots can be reclaimed.
        if (poll.mandatoryAttendance) {
          await tx.attendanceEdit.deleteMany({ where: { selection: { pollId: id } } });
          await tx.pollVote.deleteMany({ where: { pollId: id } });
        }
        await tx.poll.update({ where: { id }, data: { archivedAt: new Date(), description: "" } });
        return poll.groupId;
      }
      await tx.sessionAttendanceEdit.deleteMany({ where: { pollId: id } });
      await tx.sessionMark.deleteMany({ where: { pollId: id } });
      await tx.sessionParticipant.deleteMany({ where: { pollId: id } });
      await tx.attendanceEdit.deleteMany({ where: { selection: { pollId: id } } });
      await tx.poll.delete({ where: { id } });
      if (poll.type === "SESSION") await reconcileAbsences(tx, ids, poll.group.name);
      return poll.groupId;
    }, { timeout: 15000 });
    await this.events.publish({ name: "poll:deleted", groupId, payload: { pollId: id } });
    return { pollId: id };
  }
}

@Module({ providers: [PollDeletionService], exports: [PollDeletionService] })
export class PollDeletionModule {}
