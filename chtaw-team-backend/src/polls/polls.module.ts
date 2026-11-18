import {
  BadRequestException,
  Body,
  ConflictException,
  ForbiddenException,
  Controller,
  Delete,
  HttpCode,
  Get,
  Injectable,
  Module,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
} from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { PrismaService } from "../prisma/prisma.module";
import { AccessService, Actor, administrationOwner } from "../common/access";
import { DomainEvents } from "../common/events";
import { pollInclude, presentPoll, presentMessage, messageInclude } from "../common/presenters";
import { PageDto } from "../common/query.dto";
import { Organizer, CurrentUser } from "../auth/security";
import { CreatePollDto, VoteDto } from "./polls.dto";
import { PollDeletionModule, PollDeletionService } from "./poll-deletion.service";
import { validatePoll } from "./polls.validation";
import { assertNoSessionOverlap } from "./session-overlap";
import { pollMember } from "../common/poll-audience";
@Injectable()
export class PollsService {
  constructor(
    private db: PrismaService,
    private access: AccessService,
    private events: DomainEvents,
  ) {}
  list(actor: Actor, query: PageDto) {
    return this.db.$transaction(async (tx) => {
      const user = await this.access.actor(tx, actor);
      const items = await tx.poll.findMany({
        where: { archivedAt: null, ...(user.role === "ADMIN" ? {} : { AND: [pollMember(actor.id)] }), ...(user.role === "COLLABORATOR" ? { OR: [{ authorId: actor.id }, { type: "ORDINARY" }] } : {}) },
        include: pollInclude,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: query.limit + 1,
        ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      });
      return {
        items: items.slice(0, query.limit).map(presentPoll),
        nextCursor: items.length > query.limit ? items[query.limit - 1]?.id : null,
      };
    });
  }
  async create(actor: Actor, groupId: string, dto: CreatePollDto) {
    if (dto.type !== "SESSION" && dto.groupIds) throw new BadRequestException("Les groupes multiples sont réservés aux séances.");
    if (dto.groupIds && !dto.groupIds.includes(groupId)) throw new BadRequestException("Le groupe de publication doit faire partie des groupes sélectionnés.");
    const groupIds = [...new Set(dto.groupIds ?? [groupId])].sort();
    validatePoll(dto);
    if (dto.endsAt && new Date(dto.endsAt) <= new Date())
      throw new BadRequestException("La clôture doit être dans le futur.");
    if (new Set(dto.options.map((o) => o.toLocaleLowerCase())).size !== dto.options.length)
      throw new BadRequestException("Les réponses doivent être différentes.");
    const result = await this.db.$transaction(async (tx) => {
      const user = await this.access.organizer(tx, actor);
      for (const target of groupIds) await this.access.group(tx, actor, target);
      if (user.role === "COLLABORATOR" && dto.type !== "SESSION") throw new ForbiddenException("Seuls les sondages de séance sont autorisés.");
      for (const target of groupIds) await assertNoSessionOverlap(tx, target, dto);
      const poll = await tx.poll.create({
        data: {
          groupId,
          groups: { createMany: { data: groupIds.map(groupId => ({ groupId })), skipDuplicates: true } },
          authorId: administrationOwner(user),
          question: dto.question,
          description: dto.description ?? "",
          type: dto.type ?? "ORDINARY",
          mandatoryAttendance: dto.type === "SESSION" && dto.mandatoryAttendance === true,
          status: dto.status ?? "OPEN",
          singleChoice: dto.singleChoice,
          endsAt: dto.endsAt ? new Date(dto.endsAt) : null,
          options: {
            create: dto.options.map((label, position) => ({
              label,
              position,
              validatedAt: dto.type === "SESSION" ? null : undefined,
              capacity: dto.type === "SESSION" ? dto.capacities![position] : null,
              startsAt: dto.type === "SESSION" ? new Date(dto.startsAt![position]!) : null,
              endsAt:
                dto.type === "SESSION" && dto.slotEndsAt?.[position]
                  ? new Date(dto.slotEndsAt[position]!)
                  : null,
            })),
          },
        },
        include: pollInclude,
      });
      if (poll.mandatoryAttendance) {
        const students = await tx.user.findMany({
          where: { role: "USER", status: "APPROVED", memberships: { some: { groupId: { in: groupIds } } } },
          select: { id: true },
        });
        await tx.sessionParticipant.createMany({
          data: students.map((user) => ({ pollId: poll.id, userId: user.id })),
        });
      }
      const messages = [];
      for (const target of groupIds) messages.push(presentMessage(await tx.message.create({
        include: messageInclude, data: { groupId: target, authorId: poll.authorId, kind: "poll", pollId: poll.id },
      })));
      return { poll: presentPoll(poll), messages };
    });
    for (const target of groupIds) await this.events.publish({ name: "poll:created", groupId: target, payload: result.poll });
    for (const message of result.messages) await this.events.publish({ name: "message:created", groupId: message.groupId, payload: message });
    return result.poll;
  }
  get(actor: Actor, id: string) {
    return this.db.$transaction(async (tx) => {
      await this.access.poll(tx, actor, id);
      const poll = await tx.poll.findUnique({ where: { id, archivedAt: null }, include: pollInclude });
      if (!poll) throw new NotFoundException("Sondage introuvable.");
      if (actor.role === "COLLABORATOR" && poll.type === "SESSION" && poll.authorId !== actor.id)
        throw new ForbiddenException("Cette séance appartient à un autre organisateur.");
      return presentPoll(poll);
    });
  }
  async vote(actor: Actor, id: string, dto: VoteDto, replace = false) {
    const poll = await this.db.$transaction(async (tx) => {
      const located = await tx.poll.findUnique({ where: { id, archivedAt: null }, select: { groupId: true } });
      if (!located) throw new NotFoundException("Sondage introuvable.");
      await this.access.poll(tx, actor, id);
      await tx.$queryRaw`SELECT id FROM "Poll" WHERE id=${id}::uuid FOR UPDATE`;
      const current = await tx.poll.findUniqueOrThrow({
        where: { id },
        include: { options: true },
      });
      if (current.type === "SESSION" && actor.role !== "USER")
        throw new BadRequestException("Les inscriptions aux séances sont réservées aux étudiants.");
      if (
        current.status !== "OPEN" ||
        (current.type !== "SESSION" && current.attendanceLockedAt) ||
        (current.type !== "SESSION" && current.endsAt && current.endsAt <= new Date())
      )
        throw new ConflictException("Ce sondage est clôturé.");
      const existing = await tx.pollVote.findUnique({
        where: { pollId_userId: { pollId: id, userId: actor.id } },
        include: { options: true },
      });
      if (replace && current.type !== "SESSION")
        throw new ConflictException("Les votes ordinaires sont définitifs.");
      if (existing && !replace) throw new ConflictException("Vous avez déjà participé.");
      if (
        (!dto.optionIds.length && !(replace && current.type === "SESSION")) ||
        new Set(dto.optionIds).size !== dto.optionIds.length ||
        ((current.singleChoice || current.type === "SESSION") && dto.optionIds.length > 1) ||
        dto.optionIds.some((optionId) => !current.options.some((o) => o.id === optionId))
      )
        throw new BadRequestException("Sélection invalide.");
      if (current.type === "SESSION") {
        const oldOptions = existing?.options ?? [];
        if (oldOptions.length > 1)
          throw new ConflictException("Votes historiques multiples : décision de l’organisateur nécessaire. Aucun vote supprimé.");
        const marked = oldOptions.some((o) => o.version > 0 || o.attendance !== "NON_VERIFIE") ||
          await tx.sessionMark.count({ where: { pollId: id, userId: actor.id, OR: [{ version: { gt: 0 } }, { attendance: { not: "NON_VERIFIE" } }] } });
        const participant = await tx.sessionParticipant.findUnique({ where: { pollId_userId: { pollId: id, userId: actor.id } } });
        if (marked || participant?.absenceConfirmedAt)
          throw new ConflictException("Votre pointage a commencé : modification du vote refusée.");
        const closed = (optionId: string) => {
          const option = current.options.find((o) => o.id === optionId);
          return !option?.startsAt || option.startsAt <= new Date();
        };
        const assertOpen = () => {
          if (oldOptions.some((o) => closed(o.optionId)) || dto.optionIds.some(closed))
            throw new ConflictException("Ce créneau a commencé : les votes, changements et retraits sont fermés.");
        };
        assertOpen();
        const target = current.options.find((o) => o.id === dto.optionIds[0]);
        if (target && !oldOptions.some((o) => o.optionId === target.id)) {
          if (target.capacity === null)
            throw new ConflictException("Capacité historique à définir par l’organisateur avant toute inscription.");
          const count = await tx.pollVoteOption.count({ where: { pollId: id, optionId: target.id } });
          if (count >= target.capacity)
            throw new ConflictException("Ce créneau est complet. Votre choix initial est conservé.");
        }
        // Recheck after database reads; a request waiting for a place cannot bypass start time.
        assertOpen();
        if (!dto.optionIds.length) {
          if (existing) await tx.pollVote.delete({ where: { id: existing.id } });
          return presentPoll(await tx.poll.findUniqueOrThrow({ where: { id }, include: pollInclude }));
        }
        if (existing && oldOptions.length === 1 && oldOptions[0]!.optionId === target?.id)
          return presentPoll(await tx.poll.findUniqueOrThrow({ where: { id }, include: pollInclude }));
      }
      const vote =
        existing ?? (await tx.pollVote.create({ data: { pollId: id, userId: actor.id } }));
      if (existing) await tx.pollVoteOption.deleteMany({ where: { voteId: existing.id } });
      // Explicit rows avoid nested writes with overlapping composite relation keys.
      await tx.pollVoteOption.createMany({
        data: dto.optionIds.map((optionId) => ({ voteId: vote.id, optionId, pollId: id })),
      });
      if (current.type === "SESSION" && current.mandatoryAttendance) {
        await tx.sessionParticipant.upsert({
          where: { pollId_userId: { pollId: id, userId: actor.id } },
          create: { pollId: id, userId: actor.id },
          update: { included: true },
        });
      }
      return presentPoll(await tx.poll.findUniqueOrThrow({ where: { id, archivedAt: null }, include: pollInclude }));
    });
    for (const groupId of poll.groupIds ?? [poll.groupId]) await this.events.publish({ name: "poll:updated", groupId, payload: poll });
    return poll;
  }
}
@ApiTags("Polls")
@ApiBearerAuth()
@Controller()
export class PollsController {
  constructor(private polls: PollsService, private deletion: PollDeletionService) {}
  @Organizer() @Delete("polls/:id") @HttpCode(204) remove(@CurrentUser() actor: Actor, @Param("id", ParseUUIDPipe) id: string) {
    return this.deletion.remove(actor, id);
  }
  @Get("polls") list(@CurrentUser() actor: Actor, @Query() query: PageDto) {
    return this.polls.list(actor, query);
  }
  @Get("polls/:id") get(@CurrentUser() actor: Actor, @Param("id", ParseUUIDPipe) id: string) {
    return this.polls.get(actor, id);
  }
  @Organizer() @Post("groups/:groupId/polls") create(
    @CurrentUser() actor: Actor,
    @Param("groupId", ParseUUIDPipe) groupId: string,
    @Body() dto: CreatePollDto,
  ) {
    return this.polls.create(actor, groupId, dto);
  }
  @Post("polls/:id/votes") vote(
    @CurrentUser() actor: Actor,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: VoteDto,
  ) {
    return this.polls.vote(actor, id, dto);
  }
  @Put("polls/:id/votes") replaceVote(
    @CurrentUser() actor: Actor,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: VoteDto,
  ) {
    return this.polls.vote(actor, id, dto, true);
  }
}
@Module({ imports: [PollDeletionModule], providers: [PollsService], controllers: [PollsController], exports: [PollsService] })
export class PollsModule {}
