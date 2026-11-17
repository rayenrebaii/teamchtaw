import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.module";
import { AccessService, Actor } from "../common/access";
import { DomainEvents } from "../common/events";
import { messageInclude, pollInclude, presentMessage, presentPoll } from "../common/presenters";
import { pollGroupIds } from "../common/poll-audience";
import { assertNoSessionOverlap } from "./session-overlap";
import { allSessionSlotsAbsent, reconcileAbsences } from "./attendance.reconcile";
import { MandatoryAttendanceService } from "./mandatory-attendance.service";

@Injectable()
export class SessionManagementService {
  constructor(private db: PrismaService, private access: AccessService, private events: DomainEvents, private mandatory: MandatoryAttendanceService) {}
  private async lock(tx: Prisma.TransactionClient, actor: Actor, id: string) {
    const located = await tx.poll.findUnique({ where: { id }, select: { groupId: true } });
    if (!located) throw new NotFoundException("Séance introuvable.");
    const user = await this.access.organizer(tx, actor);
    if (user.role === "ADMIN") await this.access.poll(tx, actor, id);
    else await this.access.session(tx, actor, id);
    await tx.$queryRaw`SELECT id FROM "Poll" WHERE id=${id}::uuid FOR UPDATE`;
    const poll = await tx.poll.findUniqueOrThrow({ where: { id }, include: { groups: true, options: { orderBy: { position: "asc" } }, votes: true, participants: true, group: true } });
    if (poll.type !== "SESSION") throw new BadRequestException("Ce sondage n’est pas une séance.");
    const ids = [...new Set([...poll.votes.map((vote) => vote.userId), ...poll.participants.map((person) => person.userId)])].sort();
    for (const userId of ids) await tx.$queryRaw`SELECT id FROM "User" WHERE id=${userId}::uuid FOR UPDATE`;
    return { poll, ids };
  }
  async validateSlot(actor: Actor, id: string, optionId: string) {
    const updated = await this.db.$transaction(async tx => {
      const { poll } = await this.lock(tx, actor, id);
      const option = poll.options.find(item => item.id === optionId);
      if (!option) throw new NotFoundException("Créneau introuvable.");
      if (poll.status === "CANCELLED" || poll.archivedAt) throw new ConflictException("Cette séance n’est plus active.");
      if (!option.validatedAt) {
        if (!option.startsAt || option.startsAt <= new Date()) throw new ConflictException("Validez le créneau avant son début.");
        await tx.pollOption.update({ where: { id: optionId }, data: { validatedAt: new Date() } });
      }
      return presentPoll(await tx.poll.findUniqueOrThrow({ where: { id }, include: pollInclude }));
    });
    for (const groupId of updated.groupIds ?? [updated.groupId]) await this.events.publish({ name: "poll:updated", groupId, payload: updated });
    return updated;
  }
  async removeSlot(actor: Actor, id: string, optionId: string) {
    const updated = await this.db.$transaction(async (tx) => {
      const { poll, ids } = await this.lock(tx, actor, id);
      const option = poll.options.find((candidate) => candidate.id === optionId);
      if (!option) throw new NotFoundException("Créneau introuvable.");
      if (poll.options.length <= 1) throw new ConflictException("Pour retirer le dernier créneau, supprimez la séance.");
      if (poll.archivedAt || poll.status !== "OPEN") throw new ConflictException("Cette séance n’est plus active.");
      if (!option.startsAt || option.startsAt <= new Date()) throw new ConflictException("Ce créneau a déjà commencé et doit être conservé.");
      if (await tx.sessionMark.count({ where: { pollId: id, optionId } }) ||
          await tx.pollVoteOption.count({ where: { pollId: id, optionId, OR: [{ version: { gt: 0 } }, { attendance: { not: "NON_VERIFIE" } }] } }) ||
          await tx.attendanceEdit.count({ where: { optionId } }) || await tx.sessionAttendanceEdit.count({ where: { pollId: id, optionId } }))
        throw new ConflictException("Cet horaire possède un historique de pointage et ne peut pas être supprimé.");
      await tx.sessionAttendanceEdit.deleteMany({ where: { pollId: id, optionId } });
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
    for (const groupId of updated.groupIds ?? [updated.groupId]) await this.events.publish({ name: "poll:updated", groupId, payload: updated });
    return updated;
  }
  async addGroups(actor: Actor, id: string, groupIds: string[]) {
    const result = await this.db.$transaction(async tx => {
      const user = await this.access.organizer(tx, actor);
      const located = await tx.poll.findUnique({ where: { id }, include: { groups: true } });
      if (!located) throw new NotFoundException("Séance introuvable.");
      if (located.type !== "SESSION") throw new BadRequestException("Les groupes multiples sont réservés aux séances.");
      if (user.role !== "ADMIN" && located.authorId !== actor.id) throw new ForbiddenException("Cette séance appartient à un autre organisateur.");
      for (const groupId of [...new Set([...pollGroupIds(located), ...groupIds])].sort()) await this.access.lockGroup(tx, groupId);
      await this.access.poll(tx, actor, id);
      await tx.$queryRaw`SELECT id FROM "Poll" WHERE id=${id}::uuid FOR UPDATE`;
      const poll = await tx.poll.findUniqueOrThrow({ where: { id }, include: { ...pollInclude, options: true } });
      if (poll.archivedAt || poll.status !== "OPEN") throw new ConflictException("Cette séance n’est plus active.");
      if (poll.attendanceLockedAt || !poll.options.length || poll.options.some(option => !option.startsAt || option.startsAt <= new Date()))
        throw new ConflictException("Ajout de groupes impossible après le début de la séance, pour préserver les présences et absences.");
      const added = groupIds.filter(groupId => !pollGroupIds(poll).includes(groupId));
      for (const groupId of added) {
        await this.access.group(tx, actor, groupId);
        await assertNoSessionOverlap(tx, groupId, { type: "SESSION", startsAt: poll.options.map(option => option.startsAt!.toISOString()), slotEndsAt: poll.options.map(option => (option.endsAt ?? option.startsAt)!.toISOString()) }, id);
      }
      await tx.pollGroup.createMany({ data: added.map(groupId => ({ pollId: id, groupId })), skipDuplicates: true });
      if (poll.mandatoryAttendance && added.length) {
        const students = await tx.user.findMany({ where: { role: "USER", status: "APPROVED", memberships: { some: { groupId: { in: added } } } }, select: { id: true } });
        await tx.sessionParticipant.createMany({ data: students.map(student => ({ pollId: id, userId: student.id })), skipDuplicates: true });
      }
      const updated = await tx.poll.findUniqueOrThrow({ where: { id }, include: pollInclude });
      const messages = [];
      for (const groupId of added) messages.push(presentMessage(await tx.message.create({ data: { pollId: id, groupId, authorId: poll.authorId, kind: "poll" }, include: messageInclude })));
      return { poll: presentPoll(updated), messages };
    }, { timeout: 15000 });
    for (const groupId of result.poll.groupIds ?? [result.poll.groupId]) await this.events.publish({ name: "poll:updated", groupId, payload: result.poll });
    for (const message of result.messages) await this.events.publish({ name: "message:created", groupId: message.groupId, payload: message });
    return result.poll;
  }
}
