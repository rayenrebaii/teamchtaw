import {
  Body,
  ConflictException,
  Controller,
  Get,
  Injectable,
  Module,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
} from "@nestjs/common";
import { ApiBearerAuth, ApiProperty, ApiTags } from "@nestjs/swagger";
import { IsIn } from "class-validator";
import { PrismaService } from "../prisma/prisma.module";
import { AccessService, Actor } from "../common/access";
import { userSelect } from "../common/presenters";
import { DomainEvents } from "../common/events";
import { Admin, CurrentUser } from "../auth/security";
import { PageDto } from "../common/query.dto";
import { UsersService, UsersModule } from "../users/users.module";
export class ReviewDto {
  @ApiProperty({ enum: ["APPROVED", "REJECTED"] }) @IsIn(["APPROVED", "REJECTED"]) status!:
    "APPROVED" | "REJECTED";
}
@Injectable()
export class ApprovalsService {
  constructor(
    private db: PrismaService,
    private access: AccessService,
    private events: DomainEvents,
  ) {}
  history(actor: Actor, userId: string) {
    return this.db.$transaction(async (tx) => {
      await this.access.actor(tx, actor, true, true);
      const user = await tx.user.findUnique({ where: { id: userId }, select: { id: true } });
      if (!user) throw new NotFoundException("Compte introuvable.");
      return tx.admissionDecision.findMany({ where: { userId }, orderBy: [{ createdAt: "asc" }, { id: "asc" }], select: { id: true, status: true, createdAt: true, actor: { select: { firstName: true, lastName: true } } } });
    });
  }
  async review(actor: Actor, userId: string, status: "APPROVED" | "REJECTED") {
    const result = await this.db.$transaction(async (tx) => {
      // Global lock order: general group, then user. All approval/membership writers follow it.
      const general = await tx.group.findFirst({ where: { isGeneral: true } });
      if (!general) throw new ConflictException("Groupe général absent : exécutez le seed.");
      await this.access.lockGroup(tx, general.id);
      await this.access.actor(tx, actor, true, true);
      await tx.$queryRaw`SELECT id FROM "User" WHERE id=${userId}::uuid FOR UPDATE`;
      const user = await tx.user.findUnique({ where: { id: userId }, select: userSelect });
      if (!user) throw new NotFoundException("Compte introuvable.");
      if (user.role !== "USER" || user.status !== "PENDING")
        throw new ConflictException("Cette demande a déjà été traitée.");
      const updated = await tx.user.update({
        where: { id: userId },
        data: { status },
        select: userSelect,
      });
      await tx.admissionDecision.create({ data: { userId, actorId: actor.id, status } });
      if (status === "APPROVED")
        await tx.groupMember.create({ data: { groupId: general.id, userId } });
      return { user: updated, generalId: general.id };
    });
    await this.events.publish({ name: "user:reviewed", userId, payload: result.user });
    if (status === "APPROVED")
      await this.events.publish({
        name: "group:member-added",
        groupId: result.generalId,
        userId,
        payload: { groupId: result.generalId, userId },
      });
    return result.user;
  }
}
@ApiTags("Approvals")
@ApiBearerAuth()
@Admin()
@Controller("approvals")
export class ApprovalsController {
  constructor(
    private approvals: ApprovalsService,
    private users: UsersService,
  ) {}
  @Get() list(@CurrentUser() actor: Actor, @Query() query: PageDto) {
    return this.users.list(actor, { ...query, status: "PENDING" });
  }
  @Get(":userId/history") history(@CurrentUser() actor: Actor, @Param("userId", ParseUUIDPipe) id: string) {
    return this.approvals.history(actor, id);
  }
  @Patch(":userId") review(
    @CurrentUser() actor: Actor,
    @Param("userId", ParseUUIDPipe) id: string,
    @Body() dto: ReviewDto,
  ) {
    return this.approvals.review(actor, id, dto.status);
  }
}
@Module({
  imports: [UsersModule],
  providers: [ApprovalsService],
  controllers: [ApprovalsController],
  exports: [ApprovalsService],
})
export class ApprovalsModule {}
