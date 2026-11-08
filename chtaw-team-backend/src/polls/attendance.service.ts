import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.module";
import { AccessService, Actor } from "../common/access";
import { userSelect, pollInclude, presentPoll } from "../common/presenters";
import { finalAttendance } from "./attendance.rules";
import { SaveAttendanceDto, UpdateSessionDto } from "./polls.dto";
import { personalAttendance } from "./personal-attendance";
import { AttendanceQueryDto, PersonalAttendanceQueryDto } from "./attendance.dto";
import { validatePoll } from "./polls.validation";
import { DomainEvents } from "../common/events";
import { MandatoryAttendanceService } from "./mandatory-attendance.service";
import { attendanceAccess, mandatoryFinal, reconcileAbsences } from "./attendance.reconcile";
import { assertAttendanceStarted } from "./attendance-time";

@Injectable()
export class AttendanceService {
  constructor(
    private db: PrismaService,
    private access: AccessService,
    private events: DomainEvents,
    private mandatory: MandatoryAttendanceService,
  ) {}

  private async lockedPoll(tx: Prisma.TransactionClient, actor: Actor, id: string) {
    const located = await tx.poll.findUnique({ where: { id }, select: { groupId: true } });
    if (!located) throw new NotFoundException("Sondage introuvable.");
    await this.access.group(tx, actor, located.groupId, true);
    await tx.$queryRaw`SELECT id FROM "Poll" WHERE id=${id}::uuid FOR UPDATE`;
    const poll = await tx.poll.findUniqueOrThrow({
      where: { id },
      include: { options: true, votes: true, group: true },
    });
    if (poll.type !== "SESSION") throw new BadRequestException("Ce sondage n’est pas une séance.");
    return poll;
  }

  // Every writer locks the same student rows in stable order before computing global totals.
  // Counts are derived from distinct poll votes, never incremented per time slot.
  private async reconcile(tx: Prisma.TransactionClient, ids: string[], groupName: string) {
    await reconcileAbsences(tx, ids, groupName);
  }

  async save(actor: Actor, id: string, dto: SaveAttendanceDto) {
    if (
      (await this.db.poll.findUnique({ where: { id }, select: { mandatoryAttendance: true } }))
        ?.mandatoryAttendance
    )
      return this.mandatory.save(actor, id, dto);
    await this.db.$transaction(
      async (tx) => {
        const poll = await this.lockedPoll(tx, actor, id);
        if (poll.status === "CANCELLED") throw new ConflictException("Séance annulée.");
        const keys = dto.entries.map((entry) => `${entry.userId}:${entry.optionId}`);
        if (new Set(keys).size !== keys.length)
          throw new BadRequestException("Présences dupliquées.");
        // Lock all target users before any changes so concurrent polls cannot lose a threshold crossing.
        for (const userId of [...new Set(dto.entries.map((e) => e.userId))].sort())
          await tx.$queryRaw`SELECT id FROM "User" WHERE id=${userId}::uuid FOR UPDATE`;
        for (const entry of dto.entries) {
          const vote = poll.votes.find((v) => v.userId === entry.userId);
          const row =
            vote &&
            (await tx.pollVoteOption.findUnique({
              where: { voteId_optionId: { voteId: vote.id, optionId: entry.optionId } },
            }));
          if (!row || row.pollId !== id)
            throw new BadRequestException("Cet étudiant n’est pas inscrit à cet horaire.");
          assertAttendanceStarted(poll.options.find((option) => option.id === entry.optionId));
          if (row.version !== entry.version)
            throw new ConflictException(
              "Présence modifiée par un autre administrateur. Actualisez la liste.",
            );
          if (row.attendance === entry.status) continue;
          await tx.pollVoteOption.update({
            where: { voteId_optionId: { voteId: row.voteId, optionId: row.optionId } },
            data: { attendance: entry.status, version: { increment: 1 } },
          });
          await tx.attendanceEdit.create({
            data: {
              voteId: row.voteId,
              optionId: row.optionId,
              actorId: actor.id,
              before: row.attendance,
              after: entry.status,
              version: row.version + 1,
            },
          });
        }
        await tx.poll.update({
          where: { id },
          data: { attendanceLockedAt: poll.attendanceLockedAt ?? new Date() },
        });
        await this.reconcile(
          tx,
          dto.entries.map((e) => e.userId),
          poll.group.name,
        );
      },
      { timeout: 15000 },
    );
    const current = await this.db.poll.findUniqueOrThrow({ where: { id }, include: pollInclude });
    await this.events.publish({
      name: "poll:updated",
      groupId: current.groupId,
      payload: presentPoll(current),
    });
    return this.roster(actor, id);
  }

  async update(actor: Actor, id: string, dto: UpdateSessionDto) {
    const policy = await this.db.poll.findUnique({
      where: { id },
      select: { mandatoryAttendance: true },
    });
    validatePoll({ ...dto, mandatoryAttendance: policy?.mandatoryAttendance ?? false }, true);
    const updated = await this.db.$transaction(
      async (tx) => {
        const poll = await this.lockedPoll(tx, actor, id);
        if (dto.type !== "SESSION")
          throw new BadRequestException("Le type de sondage est immuable.");
        if (poll.status === "CANCELLED" && dto.status !== "CANCELLED")
          throw new ConflictException("Une séance annulée ne peut pas être réouverte.");
        const structureChanged =
          dto.options.length !== poll.options.length ||
          poll.options.some(
            (o) =>
              dto.options[o.position] !== o.label ||
              new Date(dto.startsAt![o.position] ?? 0).getTime() !== o.startsAt?.getTime() ||
              (poll.mandatoryAttendance &&
                new Date(dto.slotEndsAt![o.position] ?? 0).getTime() !== o.endsAt?.getTime()),
          );
        if (structureChanged && (poll.votes.length || poll.attendanceLockedAt))
          throw new ConflictException(
            "Les horaires sont verrouillés dès le premier vote. Annulez la séance pour la remplacer.",
          );
        if (
          poll.attendanceLockedAt &&
          (structureChanged || dto.endsAt !== poll.endsAt?.toISOString() || dto.status === "OPEN")
        )
          throw new ConflictException(
            "Les votes et horaires sont verrouillés après le premier pointage. Clôture ou annulation uniquement.",
          );
        if (structureChanged) {
          await tx.pollOption.deleteMany({ where: { pollId: id } });
          await tx.pollOption.createMany({
            data: dto.options.map((label, position) => ({
              pollId: id,
              label,
              position,
              startsAt: new Date(dto.startsAt![position]!),
              endsAt: poll.mandatoryAttendance ? new Date(dto.slotEndsAt![position]!) : null,
            })),
          });
        }
        // Take student locks before cancelling, then recompute within the same transaction.
        const participants = await tx.sessionParticipant.findMany({
          where: { pollId: id },
          select: { userId: true },
        });
        const concerned = [
          ...new Set([...poll.votes.map((v) => v.userId), ...participants.map((p) => p.userId)]),
        ].sort();
        for (const userId of concerned)
          await tx.$queryRaw`SELECT id FROM "User" WHERE id=${userId}::uuid FOR UPDATE`;
        const result = await tx.poll.update({
          where: { id },
          data: {
            question: dto.question,
            description: dto.description ?? "",
            endsAt: new Date(dto.endsAt!),
            status: dto.status ?? poll.status,
          },
          include: pollInclude,
        });
        if (poll.mandatoryAttendance && dto.status === "CANCELLED" && poll.status !== "CANCELLED") {
          await tx.sessionParticipant.updateMany({
            where: { pollId: id },
            data: { version: { increment: 1 } },
          });
          await tx.sessionParticipant.updateMany({
            where: { pollId: id, reportOpenedAt: { not: null }, reportResolvedAt: null },
            data: { reportResolvedAt: new Date() },
          });
          for (const person of participants) {
            const current = await tx.sessionParticipant.findUniqueOrThrow({
              where: { pollId_userId: { pollId: id, userId: person.userId } },
            });
            await tx.sessionAttendanceEdit.create({
              data: {
                pollId: id,
                userId: person.userId,
                actorId: actor.id,
                action: "CANCEL_SESSION",
                before: "ACTIVE",
                after: "CANCELLED",
                version: current.version,
              },
            });
          }
        }
        await this.reconcile(tx, concerned, poll.group.name);
        return presentPoll(result);
      },
      { timeout: 15000 },
    );
    await this.events.publish({ name: "poll:updated", groupId: updated.groupId, payload: updated });
    if (updated.mandatoryAttendance) await this.mandatory.processPoll(id);
    return updated;
  }

  async roster(actor: Actor, id: string) {
    if (
      (await this.db.poll.findUnique({ where: { id }, select: { mandatoryAttendance: true } }))
        ?.mandatoryAttendance
    )
      return this.mandatory.roster(actor, id);
    return this.db.$transaction(async (tx) => {
      const poll = await tx.poll.findUnique({
        where: { id },
        include: {
          group: { select: { id: true, name: true } },
          options: { orderBy: { position: "asc" } },
          votes: {
            include: { user: { select: { ...userSelect, absenceState: true } }, options: true },
          },
        },
      });
      if (!poll) throw new NotFoundException("Sondage introuvable.");
      await this.access.group(tx, actor, poll.groupId, true);
      if (poll.type !== "SESSION") throw new BadRequestException("Sondage ordinaire.");
      return {
        id: poll.id,
        question: poll.question,
        status: poll.status,
        group: poll.group,
        attendanceLockedAt: poll.attendanceLockedAt,
        slots: poll.options.map((option) => ({
          ...option,
          students: poll.votes.flatMap((vote) => {
            const selection = vote.options.find((o) => o.optionId === option.id);
            return !selection || vote.user.role !== "USER"
              ? []
              : [
                  {
                    user: {
                      id: vote.user.id,
                      firstName: vote.user.firstName,
                      lastName: vote.user.lastName,
                      email: vote.user.email,
                    },
                    attendance: selection.attendance,
                    version: selection.version,
                    absences: vote.user.absenceState?.total ?? 0,
                    final: finalAttendance(vote.options.map((o) => o.attendance)),
                  },
                ];
          }),
        })),
      };
    });
  }

  overview(actor: Actor, query: AttendanceQueryDto) {
    return this.db.$transaction(async (tx) => {
      await this.access.actor(tx, actor, true, true);
      if (query.from && query.to && query.from > query.to)
        throw new BadRequestException("Intervalle de dates invalide.");
      const polls = await tx.poll.findMany({
        where: {
          type: "SESSION",
          group: { members: { some: { userId: actor.id } } },
          groupId: query.groupId,
          id: query.pollId,
          ...(query.from || query.to
            ? {
                createdAt: {
                  ...(query.from ? { gte: new Date(`${query.from}T00:00:00.000Z`) } : {}),
                  ...(query.to
                    ? { lt: new Date(new Date(`${query.to}T00:00:00.000Z`).getTime() + 86400000) }
                    : {}),
                },
              }
            : {}),
        },
        include: {
          group: { select: { name: true } },
          participants: {
            where: { included: true },
            include: { marks: true, user: { select: { ...userSelect, absenceState: true } } },
          },
          votes: {
            include: { user: { select: { ...userSelect, absenceState: true } }, options: true },
          },
        },
      });
      const map = new Map<
        string,
        {
          user: (typeof polls)[number]["votes"][number]["user"];
          groups: string[];
          presences: number;
          absences: number;
          totalAbsences: number;
          pending: number;
        }
      >();
      for (const poll of polls) {
        const contributions = poll.mandatoryAttendance
          ? poll.participants.map((p) => ({
              userId: p.userId,
              user: p.user,
              final: mandatoryFinal(p),
            }))
          : poll.votes.map((v) => ({
              userId: v.userId,
              user: v.user,
              final: finalAttendance(v.options.map((o) => o.attendance)),
            }));
        for (const vote of contributions) {
          if (vote.user.role !== "USER") continue;
          const row = map.get(vote.userId) ?? {
            user: vote.user,
            groups: [],
            presences: 0,
            absences: 0,
            totalAbsences: vote.user.absenceState?.total ?? 0,
            pending: 0,
          };
          if (!row.groups.includes(poll.group.name)) row.groups.push(poll.group.name);
          if (poll.status !== "CANCELLED") {
            const final = vote.final;
            if (final === "PRESENT") row.presences++;
            else if (final === "ABSENT") row.absences++;
            else row.pending++;
          }
          map.set(vote.userId, row);
        }
      }
      const all = [...map.values()];
      const terms = query.search?.toLocaleLowerCase().split(/\s+/).filter(Boolean) ?? [];
      const items = all
        .filter(
          (row) =>
            terms.every((term) =>
              `${row.user.firstName} ${row.user.lastName} ${row.user.email}`
                .toLocaleLowerCase()
                .includes(term),
            ) &&
            (query.threshold !== "true" || row.totalAbsences >= 3),
        )
        .sort(
          (a, b) =>
            (query.order === "asc"
              ? a.totalAbsences - b.totalAbsences
              : b.totalAbsences - a.totalAbsences) || a.user.id.localeCompare(b.user.id),
        );
      const unreadAlerts = await tx.absenceAlert.count({
        where: {
          resolvedAt: null,
          readAt: null,
          user: attendanceAccess(actor.id),
        },
      });
      return {
        items: items.slice((query.page - 1) * query.limit, query.page * query.limit),
        total: items.length,
        stats: {
          sessions: polls.length,
          students: all.length,
          presences: all.reduce((n, r) => n + r.presences, 0),
          absences: all.reduce((n, r) => n + r.absences, 0),
          threshold: all.filter((r) => r.totalAbsences >= 3).length,
          unreadAlerts,
        },
      };
    });
  }

  async personalHistory(actor: Actor, query: PersonalAttendanceQueryDto) {
    if (query.from && query.to && query.from > query.to) throw new BadRequestException("Intervalle de dates invalide.");
    try { new Intl.DateTimeFormat("en", { timeZone: query.timeZone }); }
    catch { throw new BadRequestException("Fuseau horaire invalide."); }
    const history = await this.history(actor, actor.id, true);
    return { ...history, ...personalAttendance(history.sessions, query) };
  }

  history(actor: Actor, userId: string, self = false) {
    return this.db.$transaction(async (tx) => {
      await this.access.actor(tx, actor, true, !self);
      const user = await tx.user.findUnique({ where: { id: userId }, select: userSelect });
      if (!user) throw new NotFoundException("Étudiant introuvable.");
      const polls = await tx.poll.findMany({
        where: {
          type: "SESSION",
          ...(self ? {} : { group: { members: { some: { userId: actor.id } } } }),
          OR: [
            { votes: { some: { userId } } },
            { participants: { some: { userId } } },
            { mandatoryAttendance: false, group: { members: { some: { userId } } } },
          ],
        },
        orderBy: { createdAt: "desc" },
        include: {
          group: { select: { name: true, members: { where: { userId: actor.id }, select: { userId: true } } } },
          options: true,
          participants: {
            where: { userId },
            include: {
              marks: true,
              edits: {
                orderBy: { createdAt: "desc" },
                include: { actor: { select: { firstName: true, lastName: true } } },
              },
            },
          },
          votes: {
            where: { userId },
            include: {
              options: {
                include: {
                  edits: {
                    orderBy: { createdAt: "desc" },
                    include: { actor: { select: { firstName: true, lastName: true } } },
                  },
                },
              },
            },
          },
        },
      });
      if (!self && !polls.length) throw new NotFoundException("Aucun historique accessible.");
      const sessions = polls.map((poll) => ({
        id: poll.id,
        question: poll.question,
        groupName: poll.group.name,
        groupId: poll.groupId,
        currentMember: poll.group.members.length > 0,
        description: poll.description,
        slots: poll.options.map((option) => ({ optionId: option.id, label: option.label, startsAt: option.startsAt, endsAt: option.endsAt })),
        status: poll.status,
        createdAt: poll.createdAt,
        mandatoryAttendance: poll.mandatoryAttendance,
        globalEdits: poll.participants[0]?.edits.filter((e) => !e.optionId) ?? [],
        final:
          poll.status === "CANCELLED"
            ? "ANNULE"
            : poll.mandatoryAttendance && poll.participants[0]
              ? mandatoryFinal(poll.participants[0])
              : finalAttendance(poll.votes[0]?.options.map((o) => o.attendance) ?? []),
        selections:
          poll.mandatoryAttendance && poll.participants[0]
            ? poll.options.map((option) => {
                const person = poll.participants[0]!;
                const mark = person.marks.find((m) => m.optionId === option.id);
                return {
                  optionId: option.id,
                  label: option.label,
                  startsAt: option.startsAt,
                  endsAt: option.endsAt,
                  attendance: mark?.attendance ?? "NON_VERIFIE",
                  version: mark?.version ?? 0,
                  edits: person.edits.filter((e) => e.optionId === option.id),
                };
              })
            : (poll.votes[0]?.options ?? []).map((o) => ({
                optionId: o.optionId,
                label: poll.options.find((option) => option.id === o.optionId)!.label,
                startsAt: poll.options.find((option) => option.id === o.optionId)!.startsAt,
                attendance: o.attendance,
                version: o.version,
                edits: o.edits,
              })),
      }));
      const alerts = await tx.absenceAlert.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
      });
      return {
        user,
        presences: sessions.filter((p) => p.final === "PRESENT").length,
        absences: sessions.filter((p) => p.final === "ABSENT").length,
        sessions,
        alerts,
      };
    });
  }

  alerts(actor: Actor) {
    return this.db.$transaction(async (tx) => {
      await this.access.actor(tx, actor, true, true);
      return tx.absenceAlert.findMany({
        where: {
          user: attendanceAccess(actor.id),
        },
        orderBy: { createdAt: "desc" },
        include: { user: { select: { ...userSelect, absenceState: true } } },
      });
    });
  }
  readAlert(actor: Actor, id: string) {
    return this.db.$transaction(async (tx) => {
      await this.access.actor(tx, actor, true, true);
      const alert = await tx.absenceAlert.findFirst({
        where: {
          id,
          user: attendanceAccess(actor.id),
        },
      });
      if (!alert) throw new NotFoundException("Alerte introuvable.");
      return tx.absenceAlert.update({
        where: { id },
        data: { readAt: alert.readAt ?? new Date() },
      });
    });
  }
}
