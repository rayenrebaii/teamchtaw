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
import { AccessService, Actor } from "../common/access";
import { DomainEvents } from "../common/events";
import { pollInclude, presentPoll, presentMessage, messageInclude } from "../common/presenters";
import { PageDto } from "../common/query.dto";
import { Organizer, CurrentUser } from "../auth/security";
import { CreatePollDto, VoteDto } from "./polls.dto";
import { PollDeletionModule, PollDeletionService } from "./poll-deletion.service";
import { validatePoll } from "./polls.validation";
import { assertNoSessionOverlap } from "./session-overlap";
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
        where: { archivedAt: null, ...(user.role === "ADMIN" ? {} : { group: { members: { some: { userId: actor.id } } } }), ...(user.role === "COLLABORATOR" ? { authorId: actor.id } : {}) },
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
    validatePoll(dto);
    if (dto.endsAt && new Date(dto.endsAt) <= new Date())
      throw new BadRequestException("La clôture doit être dans le futur.");
    if (new Set(dto.options.map((o) => o.toLocaleLowerCase())).size !== dto.options.length)
      throw new BadRequestException("Les réponses doivent être différentes.");
    const result = await this.db.$transaction(async (tx) => {
      const user = await this.access.organizer(tx, actor);
      await this.access.group(tx, actor, groupId);
      if (user.role === "COLLABORATOR" && dto.type !== "SESSION") throw new ForbiddenException("Seuls les sondages de séance sont autorisés.");
      await assertNoSessionOverlap(tx, groupId, dto);
      const poll = await tx.poll.create({
        data: {
          groupId,
          authorId: actor.id,
          question: dto.question,
          description: dto.description ?? "",
          type: dto.type ?? "ORDINARY",
          mandatoryAttendance: dto.type === "SESSION" && dto.mandatoryAttendance !== false,
          status: dto.status ?? "OPEN",
          singleChoice: dto.singleChoice,
          endsAt: dto.endsAt ? new Date(dto.endsAt) : null,
          options: {
            create: dto.options.map((label, position) => ({
              label,
              position,
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
          where: { role: "USER", status: "APPROVED", memberships: { some: { groupId } } },
          select: { id: true },
        });
        await tx.sessionParticipant.createMany({
          data: students.map((user) => ({ pollId: poll.id, userId: user.id })),
        });
      }
      const message = await tx.message.create({
        include: messageInclude,
        data: { groupId, authorId: actor.id, kind: "poll", pollId: poll.id },
      });
      return { poll: presentPoll(poll), message: presentMessage(message) };
    });
    await this.events.publish({ name: "poll:created", groupId, payload: result.poll });
    await this.events.publish({ name: "message:created", groupId, payload: result.message });
    return result.poll;
  }
  get(actor: Actor, id: string) {
    return this.db.$transaction(async (tx) => {
      const poll = await tx.poll.findUnique({ where: { id, archivedAt: null }, include: pollInclude });
      if (!poll) throw new NotFoundException("Sondage introuvable.");
      await this.access.group(tx, actor, poll.groupId);
      if (actor.role === "COLLABORATOR" && poll.type === "SESSION" && poll.authorId !== actor.id)
        throw new ForbiddenException("Cette séance appartient à un autre organisateur.");
      return presentPoll(poll);
    });
  }
  async vote(actor: Actor, id: string, dto: VoteDto, replace = false) {
    const poll = await this.db.$transaction(async (tx) => {
      const located = await tx.poll.findUnique({ where: { id, archivedAt: null }, select: { groupId: true } });
      if (!located) throw new NotFoundException("Sondage introuvable.");
      await this.access.group(tx, actor, located.groupId);
      await tx.$queryRaw`SELECT id FROM "Poll" WHERE id=${id}::uuid FOR UPDATE`;
      const current = await tx.poll.findUniqueOrThrow({
        where: { id },
        include: { options: true },
      });
      if (current.type === "SESSION" && actor.role !== "USER")
        throw new BadRequestException("Les inscriptions aux séances sont réservées aux étudiants.");
      if (
        current.status !== "OPEN" ||
        current.attendanceLockedAt ||
        (current.endsAt && current.endsAt <= new Date())
      )
        throw new ConflictException("Ce sondage est clôturé.");
      const existing = await tx.pollVote.findUnique({
        where: { pollId_userId: { pollId: id, userId: actor.id } },
      });
      if (replace && current.type !== "SESSION")
        throw new ConflictException("Les votes ordinaires sont définitifs.");
      if (existing && !replace) throw new ConflictException("Vous avez déjà participé.");
      if (
        !dto.optionIds.length ||
        new Set(dto.optionIds).size !== dto.optionIds.length ||
        (current.singleChoice && dto.optionIds.length !== 1) ||
        dto.optionIds.some((optionId) => !current.options.some((o) => o.id === optionId))
      )
        throw new BadRequestException("Sélection invalide.");
      const vote =
        existing ?? (await tx.pollVote.create({ data: { pollId: id, userId: actor.id } }));
      if (existing) await tx.pollVoteOption.deleteMany({ where: { voteId: existing.id } });
      // Explicit rows avoid nested writes with overlapping composite relation keys.
      await tx.pollVoteOption.createMany({
        data: dto.optionIds.map((optionId) => ({ voteId: vote.id, optionId, pollId: id })),
      });
      return presentPoll(await tx.poll.findUniqueOrThrow({ where: { id, archivedAt: null }, include: pollInclude }));
    });
    await this.events.publish({ name: "poll:updated", groupId: poll.groupId, payload: poll });
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
