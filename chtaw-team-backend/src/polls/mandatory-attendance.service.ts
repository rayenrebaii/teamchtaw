import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.module";
import { AccessService, Actor } from "../common/access";
import { userSelect, pollInclude, presentPoll } from "../common/presenters";
import { DomainEvents } from "../common/events";
import { AttendanceQueryDto } from "./attendance.dto";
import { ConfirmAbsenceDto, SaveAttendanceDto, SessionParticipantDto } from "./polls.dto";
import {
  allSessionSlotsAbsent,
  mandatoryFinal,
  reconcileAbsences,
  sessionFinished,
} from "./attendance.reconcile";
import { finalAttendance } from "./attendance.rules";
import { assertAttendanceStarted } from "./attendance-time";

const personInclude = {
  marks: true,
  user: { select: { ...userSelect, studentOrganizerAbsences: true } },
} satisfies Prisma.SessionParticipantInclude;
type Person = Prisma.SessionParticipantGetPayload<{ include: typeof personInclude }>;
type Session = Prisma.PollGetPayload<{ include: { options: true; group: true } }>;

@Injectable()
export class MandatoryAttendanceService implements OnModuleInit, OnModuleDestroy {
  private timer?: ReturnType<typeof setInterval>;
  private flight?: Promise<void>;
  private logger = new Logger(MandatoryAttendanceService.name);
  constructor(
    private db: PrismaService,
    private access: AccessService,
    private events: DomainEvents,
  ) {}

  onModuleInit() {
    this.timer = setInterval(
      () =>
        void this.processDueSessions().catch(() =>
          this.logger.error("Attendance detection failed; next pass will retry."),
        ),
      60000,
    );
    this.timer.unref();
    void this.processDueSessions().catch(() =>
      this.logger.error("Attendance startup detection failed; next pass will retry."),
    );
  }
  async onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
    await this.flight?.catch(() => undefined);
  }

  private async locked(tx: Prisma.TransactionClient, actor: Actor, id: string) {
    const located = await tx.poll.findUnique({ where: { id }, select: { groupId: true } });
    if (!located) throw new NotFoundException("Séance introuvable.");
    await this.access.session(tx, actor, id);
    await tx.$queryRaw`SELECT id FROM "Poll" WHERE id=${id}::uuid FOR UPDATE`;
    const poll = await tx.poll.findUniqueOrThrow({
      where: { id },
      include: { options: true, group: true },
    });
    if (!poll.mandatoryAttendance || poll.type !== "SESSION")
      throw new BadRequestException("Cette séance utilise le suivi historique.");
    return poll;
  }
  private async report(
    tx: Prisma.TransactionClient,
    poll: Session,
    person: Person,
    now = new Date(),
  ) {
    const active =
      person.included &&
      poll.status !== "CANCELLED" &&
      sessionFinished(poll.options, now) &&
      mandatoryFinal(person) === "EN_ATTENTE";
    if (active && (!person.reportOpenedAt || person.reportResolvedAt))
      await tx.sessionParticipant.update({
        where: { pollId_userId: { pollId: poll.id, userId: person.userId } },
        data: { reportOpenedAt: person.reportOpenedAt ?? now, reportResolvedAt: null },
      });
    else if (!active && person.reportOpenedAt && !person.reportResolvedAt)
      await tx.sessionParticipant.update({
        where: { pollId_userId: { pollId: poll.id, userId: person.userId } },
        data: { reportResolvedAt: now },
      });
  }
  private async confirmAllAbsent(
    tx: Prisma.TransactionClient,
    poll: Session,
    person: Person,
    actorId?: string,
  ) {
    if (
      !person.included ||
      poll.status === "CANCELLED" ||
      person.absenceConfirmedAt ||
      !allSessionSlotsAbsent(poll.options, person.marks)
    )
      return false;
    const actor =
      actorId ??
      (
        await tx.sessionAttendanceEdit.findFirst({
          where: { pollId: poll.id, userId: person.userId, action: "MARK", after: "ABSENT" },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          select: { actorId: true },
        })
      )?.actorId;
    if (!actor) return false;
    const updated = await tx.sessionParticipant.update({
      where: { pollId_userId: { pollId: poll.id, userId: person.userId } },
      data: { absenceConfirmedAt: new Date(), version: { increment: 1 } },
    });
    await tx.sessionAttendanceEdit.create({
      data: {
        pollId: poll.id,
        userId: person.userId,
        actorId: actor,
        action: "CONFIRM_ALL_SLOTS_ABSENT",
        before: "EN_ATTENTE",
        after: "ABSENT",
        version: updated.version,
      },
    });
    person.absenceConfirmedAt = updated.absenceConfirmedAt;
    person.version = updated.version;
    return true;
  }
  async processPoll(id: string) {
    await this.db.$transaction(
      async (tx) => {
        const found = await tx.poll.findUnique({
          where: { id },
          select: { groupId: true, mandatoryAttendance: true },
        });
        if (!found?.mandatoryAttendance) return;
        await this.access.lockGroup(tx, found.groupId);
        await tx.$queryRaw`SELECT id FROM "Poll" WHERE id=${id}::uuid FOR UPDATE`;
        const poll = await tx.poll.findUniqueOrThrow({
          where: { id },
          include: { options: true, group: true },
        });
        const participants = await tx.sessionParticipant.findMany({
          where: { pollId: id },
          include: personInclude,
        });
        const candidates = participants.filter(
          (person) =>
            person.included &&
            !person.absenceConfirmedAt &&
            allSessionSlotsAbsent(poll.options, person.marks),
        );
        for (const userId of candidates.map((person) => person.userId).sort())
          await tx.$queryRaw`SELECT id FROM "User" WHERE id=${userId}::uuid FOR UPDATE`;
        const changed: string[] = [];
        for (const person of participants) {
          if (await this.confirmAllAbsent(tx, poll, person)) changed.push(person.userId);
          await this.report(tx, poll, person);
        }
        await reconcileAbsences(tx, changed, poll.group.name);
      },
      { timeout: 30000 },
    );
  }
  processDueSessions(): Promise<void> {
    if (this.flight) return this.flight;
    this.flight = this.detectDueSessions().finally(() => {
      this.flight = undefined;
    });
    return this.flight;
  }
  private async detectDueSessions() {
    const due = await this.db.poll.findMany({
      where: {
        mandatoryAttendance: true,
        type: "SESSION",
        status: { not: "CANCELLED" },
        OR: [
          {
            options: { some: {}, every: { endsAt: { lte: new Date() } } },
            participants: {
              some: {
                included: true,
                absenceConfirmedAt: null,
                marks: { none: { attendance: "PRESENT" } },
                OR: [{ reportOpenedAt: null }, { reportResolvedAt: { not: null } }],
              },
            },
          },
          {
            participants: {
              some: {
                included: true,
                absenceConfirmedAt: null,
                marks: { some: { attendance: "ABSENT" }, none: { attendance: "PRESENT" } },
              },
            },
          },
        ],
      },
      select: { id: true },
    });
    for (const poll of due) {
      try {
        await this.processPoll(poll.id);
      } catch {
        this.logger.error(
          `Attendance detection failed for session ${poll.id}; next pass will retry.`,
        );
      }
    }
  }
  async save(actor: Actor, id: string, dto: SaveAttendanceDto) {
    await this.db.$transaction(
      async (tx) => {
        const poll = await this.locked(tx, actor, id);
        if (poll.status === "CANCELLED") throw new ConflictException("Séance annulée.");
        if (
          new Set(dto.entries.map((e) => `${e.userId}:${e.optionId}`)).size !== dto.entries.length
        )
          throw new BadRequestException("Pointages dupliqués.");
        const ids = [...new Set(dto.entries.map((e) => e.userId))].sort();
        for (const userId of ids)
          await tx.$queryRaw`SELECT id FROM "User" WHERE id=${userId}::uuid FOR UPDATE`;
        for (const userId of ids) {
          const key = { pollId: id, userId };
          const person = await tx.sessionParticipant.findUnique({
            where: { pollId_userId: key },
            include: personInclude,
          });
          if (!person?.included)
            throw new BadRequestException("Étudiant non concerné par cette séance.");
          const entries = dto.entries.filter((e) => e.userId === userId);
          if (entries.some((e) => e.participantVersion !== person.version))
            throw new ConflictException(
              "Pointage modifié par un autre administrateur. Actualisez la liste.",
            );
          for (const entry of entries) {
            if (!poll.options.some((o) => o.id === entry.optionId))
              throw new BadRequestException("Créneau étranger à la séance.");
            assertAttendanceStarted(poll.options.find((option) => option.id === entry.optionId));
            const mark = person.marks.find((m) => m.optionId === entry.optionId);
            if (entry.version !== (mark?.version ?? 0))
              throw new ConflictException("Ce pointage a été modifié. Actualisez la liste.");
            const before = mark?.attendance ?? "NON_VERIFIE";
            if (before === entry.status) continue;
            await tx.sessionMark.upsert({
              where: { pollId_userId_optionId: { ...key, optionId: entry.optionId } },
              create: { ...key, optionId: entry.optionId, attendance: entry.status, version: 1 },
              update: { attendance: entry.status, version: { increment: 1 } },
            });
            await tx.sessionAttendanceEdit.create({
              data: {
                ...key,
                actorId: actor.id,
                optionId: entry.optionId,
                action: "MARK",
                before,
                after: entry.status,
                version: person.version + 1,
              },
            });
          }
          const updated = await tx.sessionParticipant.update({
            where: { pollId_userId: key },
            data: { version: { increment: 1 } },
            include: personInclude,
          });
          const allAbsent = allSessionSlotsAbsent(poll.options, updated.marks);
          const hasPresence = updated.marks.some((m) => m.attendance === "PRESENT");
          if (
            updated.absenceConfirmedAt &&
            (hasPresence || (allSessionSlotsAbsent(poll.options, person.marks) && !allAbsent))
          ) {
            await tx.sessionParticipant.update({
              where: { pollId_userId: key },
              data: { absenceConfirmedAt: null },
            });
            await tx.sessionAttendanceEdit.create({
              data: {
                ...key,
                actorId: actor.id,
                action: "CLEAR_ABSENCE",
                before: "ABSENT",
                after: hasPresence ? "PRESENT" : "EN_ATTENTE",
                version: updated.version,
              },
            });
            updated.absenceConfirmedAt = null;
          }
          await this.confirmAllAbsent(tx, poll, updated, actor.id);
          await this.report(tx, poll, updated);
        }
        await tx.poll.update({
          where: { id },
          data: { attendanceLockedAt: poll.attendanceLockedAt ?? new Date() },
        });
        await reconcileAbsences(tx, ids, poll.group.name);
      },
      { timeout: 30000 },
    );
    await this.publish(id);
    return this.roster(actor, id);
  }
  async confirmAbsence(actor: Actor, id: string, userId: string, dto: ConfirmAbsenceDto) {
    await this.db.$transaction(
      async (tx) => {
        const poll = await this.locked(tx, actor, id);
        if (poll.status === "CANCELLED" || !sessionFinished(poll.options))
          throw new ConflictException(
            "Attendez la fin du dernier créneau d’une séance non annulée.",
          );
        await tx.$queryRaw`SELECT id FROM "User" WHERE id=${userId}::uuid FOR UPDATE`;
        const key = { pollId: id, userId };
        const person = await tx.sessionParticipant.findUnique({
          where: { pollId_userId: key },
          include: personInclude,
        });
        if (!person?.included) throw new BadRequestException("Étudiant non concerné.");
        if (person.version !== dto.version)
          throw new ConflictException("Signalement modifié. Actualisez la liste.");
        if (person.marks.some((m) => m.attendance === "PRESENT"))
          throw new ConflictException("Une présence est déjà confirmée.");
        if (!person.absenceConfirmedAt) {
          await tx.sessionParticipant.update({
            where: { pollId_userId: key },
            data: {
              absenceConfirmedAt: new Date(),
              reportOpenedAt: person.reportOpenedAt ?? new Date(),
              reportResolvedAt: new Date(),
              version: { increment: 1 },
            },
          });
          await tx.sessionAttendanceEdit.create({
            data: {
              ...key,
              actorId: actor.id,
              action: "CONFIRM_ABSENCE",
              before: "EN_ATTENTE",
              after: "ABSENT",
              version: person.version + 1,
            },
          });
        }
        await tx.poll.update({
          where: { id },
          data: { attendanceLockedAt: poll.attendanceLockedAt ?? new Date() },
        });
        await reconcileAbsences(tx, [userId], poll.group.name);
      },
      { timeout: 15000 },
    );
    await this.publish(id);
    return this.roster(actor, id);
  }
  async participant(actor: Actor, id: string, userId: string, dto: SessionParticipantDto) {
    await this.db.$transaction(
      async (tx) => {
        const poll = await this.locked(tx, actor, id);
        if (poll.status === "CANCELLED") throw new ConflictException("Séance annulée.");
        await tx.$queryRaw`SELECT id FROM "User" WHERE id=${userId}::uuid FOR UPDATE`;
        const key = { pollId: id, userId };
        const prior = await tx.sessionParticipant.findUnique({ where: { pollId_userId: key } });
        if ((prior?.version ?? 0) !== dto.version)
          throw new ConflictException("Participant modifié. Actualisez la liste.");
        if (dto.included) {
          const target = await tx.user.findFirst({
            where: {
              id: userId,
              role: "USER",
              status: "APPROVED",
              memberships: { some: { groupId: poll.groupId } },
            },
          });
          if (!target)
            throw new BadRequestException("Choisissez un étudiant approuvé appartenant au groupe.");
        } else if (!prior) throw new NotFoundException("Participant introuvable.");
        const person = await tx.sessionParticipant.upsert({
          where: { pollId_userId: key },
          create: { ...key, included: true, version: 1 },
          update: { included: dto.included, version: { increment: 1 } },
          include: personInclude,
        });
        await tx.sessionAttendanceEdit.create({
          data: {
            ...key,
            actorId: actor.id,
            action: "PARTICIPANT",
            before: prior?.included ? "INCLUDED" : "EXCLUDED",
            after: dto.included ? "INCLUDED" : "EXCLUDED",
            version: person.version,
          },
        });
        await this.report(tx, poll, person);
        await reconcileAbsences(tx, [userId], poll.group.name);
      },
      { timeout: 15000 },
    );
    return this.roster(actor, id);
  }
  private async publish(id: string) {
    const poll = await this.db.poll.findUniqueOrThrow({ where: { id }, include: pollInclude });
    await this.events.publish({
      name: "poll:updated",
      groupId: poll.groupId,
      payload: presentPoll(poll),
    });
  }
  private safeUser(user: Person["user"]) {
    const { studentOrganizerAbsences: _, ...safe } = user; return safe;
  }
  async roster(actor: Actor, id: string) {
    // Authorize before running the idempotent catch-up for this session.
    await this.db.$transaction((tx) => this.locked(tx, actor, id));
    await this.processPoll(id);
    return this.db.$transaction(async (tx) => {
      const poll = await this.locked(tx, actor, id);
      const people = await tx.sessionParticipant.findMany({
        where: { pollId: id },
        include: personInclude,
        orderBy: [{ user: { firstName: "asc" } }, { userId: "asc" }],
      });
      const votes = await tx.pollVote.findMany({
        where: { pollId: id },
        include: { options: true },
      });
      return {
        id,
        question: poll.question,
        status: poll.status,
        group: { id: poll.group.id, name: poll.group.name },
        mandatoryAttendance: true,
        finished: sessionFinished(poll.options),
        attendanceLockedAt: poll.attendanceLockedAt,
        participants: people.map((p) => ({
          user: this.safeUser(p.user),
          included: p.included,
          version: p.version,
          final: mandatoryFinal(p),
        })),
        slots: poll.options
          .sort((a, b) => a.position - b.position)
          .map((option) => ({
            ...option,
            students: people
              .filter((p) => p.included)
              .map((person) => {
                const mark = person.marks.find((m) => m.optionId === option.id);
                const vote = votes.find((v) => v.userId === person.userId);
                return {
                  user: this.safeUser(person.user),
                  attendance: mark?.attendance ?? "NON_VERIFIE",
                  version: mark?.version ?? 0,
                  participantVersion: person.version,
                  absences: person.user.studentOrganizerAbsences.find((state) => state.organizerId === actor.id)?.total ?? 0,
                  final: mandatoryFinal(person),
                  voted: !!vote?.options.some((o) => o.optionId === option.id),
                  hasVoted: !!vote,
                };
              }),
          })),
      };
    });
  }
  async sessions(actor: Actor, query: AttendanceQueryDto) {
    if (query.from && query.to && query.from > query.to)
      throw new BadRequestException("Période invalide.");
    await this.db.$transaction((tx) => this.access.organizer(tx, actor));
    await this.processDueSessions();
    const polls = await this.db.poll.findMany({
      where: {
        type: "SESSION",
        authorId: actor.id,
          group: { members: { some: { userId: actor.id } } },
        groupId: query.groupId,
        id: query.pollId,
      },
      include: {
        group: true,
        options: { orderBy: { position: "asc" } },
        participants: { where: { included: true }, include: { marks: true } },
        votes: { include: { options: true } },
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    });
    const now = new Date();
    const rows = polls
      .map((p) => {
        const finals = p.mandatoryAttendance
          ? p.participants.map((person) => mandatoryFinal(person))
          : p.votes.map((v) => finalAttendance(v.options.map((o) => o.attendance)));
        const lastEnd = p.options.every((o) => o.endsAt)
          ? new Date(Math.max(...p.options.map((o) => o.endsAt!.getTime())))
          : null;
        const phase =
          p.status === "CANCELLED"
            ? "CANCELLED"
            : !p.mandatoryAttendance
              ? "LEGACY"
              : sessionFinished(p.options, now)
                ? "FINISHED"
                : p.options.some((o) => o.startsAt && o.startsAt <= now)
                  ? "ONGOING"
                  : "UPCOMING";
        return {
          id: p.id,
          question: p.question,
          group: { id: p.groupId, name: p.group.name },
          status: p.status,
          phase,
          mandatoryAttendance: p.mandatoryAttendance,
          options: p.options,
          lastEnd,
          concerned: finals.length,
          present: finals.filter((f) => f === "PRESENT").length,
          toVerify:
            p.status === "CANCELLED"
              ? 0
              : p.participants.filter((person) => person.reportOpenedAt && !person.reportResolvedAt)
                  .length,
        };
      })
      .filter(
        (p) =>
          (!query.phase || p.phase === query.phase) &&
          ((!query.from && !query.to) ||
            p.options.some(
              (o) =>
                o.startsAt &&
                (!query.from || o.startsAt.toISOString().slice(0, 10) >= query.from) &&
                (!query.to || o.startsAt.toISOString().slice(0, 10) <= query.to),
            )),
      );
    return {
      items: rows.slice((query.page - 1) * query.limit, query.page * query.limit),
      total: rows.length,
    };
  }
  async reports(actor: Actor, query: AttendanceQueryDto) {
    if (query.from && query.to && query.from > query.to)
      throw new BadRequestException("Période invalide.");
    await this.db.$transaction((tx) => this.access.organizer(tx, actor));
    await this.processDueSessions();
    const rows = await this.db.sessionParticipant.findMany({
      where: {
        reportOpenedAt: { not: null },
        ...(query.reportStatus === "ALL"
          ? {}
          : { reportResolvedAt: query.reportStatus === "RESOLVED" ? { not: null } : null }),
        poll: {
          authorId: actor.id,
          group: { members: { some: { userId: actor.id } } },
          groupId: query.groupId,
          id: query.pollId,
        },
      },
      include: {
        ...personInclude,
        poll: {
          include: {
            options: { orderBy: { position: "asc" } },
            group: true,
            votes: { include: { options: true } },
          },
        },
      },
      orderBy: [{ reportOpenedAt: "desc" }, { userId: "asc" }],
    });
    const terms = query.search?.toLocaleLowerCase().split(/\s+/).filter(Boolean) ?? [];
    const filtered = rows.filter(
      (p) =>
        terms.every((term) =>
          `${p.user.firstName} ${p.user.lastName} ${p.user.email}`
            .toLocaleLowerCase()
            .includes(term),
        ) &&
        (!query.from ||
          p.poll.options.some(
            (o) => o.endsAt && o.endsAt.toISOString().slice(0, 10) >= query.from!,
          )) &&
        (!query.to ||
          p.poll.options.every(
            (o) => o.endsAt && o.endsAt.toISOString().slice(0, 10) <= query.to!,
          )),
    );
    return {
      total: filtered.length,
      items: filtered.slice((query.page - 1) * query.limit, query.page * query.limit).map((p) => ({
        pollId: p.pollId,
        user: this.safeUser(p.user),
        question: p.poll.question,
        group: { id: p.poll.groupId, name: p.poll.group.name },
        options: p.poll.options,
        votedOptionIds:
          p.poll.votes.find((v) => v.userId === p.userId)?.options.map((o) => o.optionId) ?? [],
        marks: p.marks,
        version: p.version,
        final: p.poll.status === "CANCELLED" ? "ANNULE" : mandatoryFinal(p),
        openedAt: p.reportOpenedAt,
        resolvedAt: p.reportResolvedAt,
        lastEnd: new Date(Math.max(...p.poll.options.map((o) => o.endsAt!.getTime()))),
      })),
    };
  }
}
