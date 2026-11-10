import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.module";
import { AccessService, Actor } from "../common/access";
import { DomainEvents } from "../common/events";
import { pollInclude, presentPoll } from "../common/presenters";
import { allSessionSlotsAbsent, reconcileAbsences } from "./attendance.reconcile";
import { MandatoryAttendanceService } from "./mandatory-attendance.service";

@Injectable()
export class SessionManagementService {
  constructor(private db: PrismaService, private access: AccessService, private events: DomainEvents, private mandatory: MandatoryAttendanceService) {}
  private async lock(tx: Prisma.TransactionClient, actor: Actor, id: string) {
    const located = await tx.poll.findUnique({ where: { id }, select: { groupId: true } });
    if (!located) throw new NotFoundException("Séance introuvable.");
    await this.access.session(tx, actor, id);
    await tx.$queryRaw`SELECT id FROM "Poll" WHERE id=${id}::uuid FOR UPDATE`;
    const poll = await tx.poll.findUniqueOrThrow({ where: { id }, include: { options: { orderBy: { position: "asc" } }, votes: true, participants: true, group: true } });
    if (poll.type !== "SESSION") throw new BadRequestException("Ce sondage n’est pas une séance.");
    const ids = [...new Set([...poll.votes.map((vote) => vote.userId), ...poll.participants.map((person) => person.userId)])].sort();
    for (const userId of ids) await tx.$queryRaw`SELECT id FROM "User" WHERE id=${userId}::uuid FOR UPDATE`;
    return { poll, ids };
  }
  async removeSlot(actor: Actor, id: string, optionId: string) {
    const updated = await this.db.$transaction(async (tx) => {
      const { poll, ids } = await this.lock(tx, actor, id);
      const option = poll.options.find((candidate) => candidate.id === optionId);
      if (!option) throw new NotFoundException("Créneau introuvable.");
      if (poll.options.length <= 1) throw new ConflictException("Pour retirer le dernier créneau, supprimez la séance.");
      await tx.attendanceEdit.deleteMany({ where: { optionId } });
      await tx.pollVoteOption.deleteMany({ where: { pollId: id, optionId } });
      await tx.pollVote.deleteMany({ where: { pollId: id, options: { none: {} } } });
      await tx.sessionMark.deleteMany({ where: { pollId: id, optionId } });
      await tx.notification.deleteMany({ where: { optionId } });
      await tx.sessionReminderDelivery.deleteMany({ where: { optionId } });
      await tx.pollOption.delete({ where: { id: optionId } });
      for (const remaining of poll.options.filter((candidate) => candidate.position > option.position))
        await tx.pollOption.update({ where: { id: remaining.id }, data: { position: remaining.position - 1 } });
      if (poll.mandatoryAttendance) {
        const options = poll.options.filter((candidate) => candidate.id !== optionId);
        const people = await tx.sessionParticipant.findMany({ where: { pollId: id }, include: { marks: true } });
        for (const person of people) {
          await tx.sessionParticipant.update({ where: { pollId_userId: { pollId: id, userId: person.userId } }, data: {
            version: { increment: 1 },
            ...(!allSessionSlotsAbsent(options, person.marks) ? { absenceConfirmedAt: null } : {}),
          } });
          await tx.sessionAttendanceEdit.create({ data: { pollId: id, userId: person.userId, actorId: actor.id,
            action: "REMOVE_SLOT", before: "ACTIVE", after: "REMOVED", version: person.version + 1 } });
        }
      }
      await reconcileAbsences(tx, ids, poll.group.name);
      return presentPoll(await tx.poll.findUniqueOrThrow({ where: { id }, include: pollInclude }));
    }, { timeout: 15000 });
    if (updated.mandatoryAttendance) await this.mandatory.processPoll(id);
    await this.events.publish({ name: "poll:updated", groupId: updated.groupId, payload: updated });
    return updated;
  }
  async remove(actor: Actor, id: string) {
    const groupId = await this.db.$transaction(async (tx) => {
      const { poll, ids } = await this.lock(tx, actor, id);
      const messages = await tx.message.findMany({ where: { pollId: id }, select: { id: true } });
      await tx.notification.deleteMany({ where: { entityId: { in: [id, ...messages.map((message) => message.id)] } } });
      await tx.message.deleteMany({ where: { pollId: id } });
      await tx.sessionAttendanceEdit.deleteMany({ where: { pollId: id } });
      await tx.sessionMark.deleteMany({ where: { pollId: id } });
      await tx.sessionParticipant.deleteMany({ where: { pollId: id } });
      await tx.attendanceEdit.deleteMany({ where: { selection: { pollId: id } } });
      await tx.poll.delete({ where: { id } });
      await reconcileAbsences(tx, ids, poll.group.name);
      return poll.groupId;
    }, { timeout: 15000 });
    await this.events.publish({ name: "poll:deleted", groupId, payload: { pollId: id } });
  }
}
