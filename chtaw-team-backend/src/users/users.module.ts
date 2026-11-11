import { Body, Controller, Delete, Get, HttpCode, Injectable, Module, Param, ParseUUIDPipe, Patch, Query } from "@nestjs/common";
import { UserBansService } from "./user-bans.service";
import { ApiBearerAuth, ApiPropertyOptional, ApiTags } from "@nestjs/swagger";
import { Transform } from "class-transformer";
import { ValidateIf, IsString, MaxLength, MinLength } from "class-validator";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.module";
import { Admin, AllowUnapproved, CurrentUser } from "../auth/security";
import { AccessService, Actor } from "../common/access";
import { userSelect } from "../common/presenters";
import { UsersQueryDto } from "../common/query.dto";
export class ProfileDto {
  @ApiPropertyOptional()
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsString()
  @MinLength(2)
  @MaxLength(60)
  @Transform(({ value }: { value: unknown }) => (typeof value === "string" ? value.trim() : value))
  firstName?: string;
  @ApiPropertyOptional()
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsString()
  @MinLength(2)
  @MaxLength(60)
  @Transform(({ value }: { value: unknown }) => (typeof value === "string" ? value.trim() : value))
  lastName?: string;
  @ApiPropertyOptional()
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsString()
  @MaxLength(250)
  bio?: string;
}
@Injectable()
export class UsersService {
  constructor(
    private db: PrismaService,
    private access: AccessService,
  ) {}
  list(actor: Actor, query: UsersQueryDto) {
    return this.db.$transaction(async (tx) => {
      await this.access.actor(tx, actor, true, true);
      const search = query.search;
      const where: Prisma.UserWhereInput = {
        status: query.status,
        role: { not: "COLLABORATOR" },
        ...(search
          ? {
              OR: [
                { firstName: { contains: search, mode: "insensitive" } },
                { lastName: { contains: search, mode: "insensitive" } },
                { email: { contains: search, mode: "insensitive" } },
              ],
            }
          : {}),
      };
      const items = await tx.user.findMany({
        where,
        select: userSelect,
        orderBy: [{ joinedAt: "desc" }, { id: "desc" }],
        take: query.limit + 1,
        ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      });
      const hasMore = items.length > query.limit;
      return {
        items: items.slice(0, query.limit),
        nextCursor: hasMore ? items[query.limit - 1]?.id : null,
      };
    });
  }
  profile(actor: Actor, dto: ProfileDto) {
    return this.db.$transaction(async (tx) => {
      await this.access.actor(tx, actor, false);
      return tx.user.update({ where: { id: actor.id }, data: dto, select: userSelect });
    });
  }
  statistics(actor: Actor) {
    return this.db.$transaction(async (tx) => {
      await this.access.actor(tx, actor, true, true);
      const [totalUsers, pendingUsers, approvedUsers, groups, messages, polls] = await Promise.all([
        tx.user.count(),
        tx.user.count({ where: { status: "PENDING" } }),
        tx.user.count({ where: { status: "APPROVED" } }),
        tx.group.count(),
        tx.message.count(),
        tx.poll.count({ where: { archivedAt: null } }),
      ]);
      return { totalUsers, pendingUsers, approvedUsers, groups, messages, polls };
    });
  }
}
@ApiTags("Users")
@ApiBearerAuth()
@Controller("users")
export class UsersController {
  constructor(private users: UsersService, private bans: UserBansService) {}
  @Admin() @Delete(":id") @HttpCode(204) remove(
    @CurrentUser() actor: Actor, @Param("id", ParseUUIDPipe) id: string,
  ) {
    return this.bans.remove(actor, id);
  }
  @Admin() @Get() list(@CurrentUser() actor: Actor, @Query() query: UsersQueryDto) {
    return this.users.list(actor, query);
  }
  @AllowUnapproved() @Get("me") me(@CurrentUser() actor: Actor) {
    const { sessionId: _, ...user } = actor;
    return user;
  }
  @AllowUnapproved() @Patch("me") profile(@CurrentUser() actor: Actor, @Body() dto: ProfileDto) {
    return this.users.profile(actor, dto);
  }
}
@ApiTags("Administration")
@ApiBearerAuth()
@Admin()
@Controller("admin")
export class AdminStatisticsController {
  constructor(private users: UsersService) {}
  @Get("stats") statistics(@CurrentUser() actor: Actor) {
    return this.users.statistics(actor);
  }
}
@Module({
  controllers: [UsersController, AdminStatisticsController],
  providers: [UsersService, UserBansService],
  exports: [UsersService],
})
export class UsersModule {}
