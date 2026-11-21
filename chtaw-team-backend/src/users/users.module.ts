import { BadRequestException, Body, Controller, Delete, Get, HttpCode, Injectable, Module, Param, ParseUUIDPipe, Patch, Query, Res, StreamableFile } from "@nestjs/common";
import type { Response } from "express";
import { StudentsExportQuery, StudentsExportService } from "./students-export.service";
import { UserBansService } from "./user-bans.service";
import { ApiBearerAuth, ApiPropertyOptional, ApiTags } from "@nestjs/swagger";
import { Transform } from "class-transformer";
import { ValidateIf, IsString, MaxLength, MinLength } from "class-validator";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.module";
import { Admin, AllowUnapproved, CurrentUser } from "../auth/security";
import { AccessService, Actor } from "../common/access";
import { accountSelect as userSelect } from "../common/presenters";
import { UsersQueryDto } from "../common/query.dto";
import { MembersQueryDto } from "./members-query.dto";
import { TABLE_PAGE_SIZE } from "../common/pagination";
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
  members(actor: Actor, query: MembersQueryDto) {
    if (query.from && query.before && new Date(query.from) >= new Date(query.before))
      throw new BadRequestException("Période invalide.");
    return this.db.$transaction(async (tx) => {
      await this.access.actor(tx, actor, true, true);
      const base: Prisma.UserWhereInput = {
        role: { not: "COLLABORATOR" },
        NOT: { isInvitedAdmin: true, disabledAt: { not: null } },
      };
      const terms = query.search?.trim().split(/\s+/).filter(Boolean) ?? [];
      const where: Prisma.UserWhereInput = {
        ...base,
        status: query.status,
        ...(query.groupId ? { memberships: { some: { groupId: query.groupId } } } : {}),
        ...(query.from || query.before ? { joinedAt: {
          ...(query.from ? { gte: new Date(query.from) } : {}),
          ...(query.before ? { lt: new Date(query.before) } : {}),
        } } : {}),
        AND: terms.map(term => ({ OR: [
          { firstName: { contains: term, mode: "insensitive" } },
          { lastName: { contains: term, mode: "insensitive" } },
          { email: { contains: term, mode: "insensitive" } },
        ] })),
      };
      const total = await tx.user.count({ where });
      const page = Math.min(query.page, Math.max(1, Math.ceil(total / TABLE_PAGE_SIZE)));
      const direction = query.order === "oldest" ? "asc" : "desc";
      const [items, statuses] = await Promise.all([
        tx.user.findMany({ where, select: userSelect, orderBy: [{ joinedAt: direction }, { id: direction }],
          skip: (page - 1) * TABLE_PAGE_SIZE, take: TABLE_PAGE_SIZE }),
        tx.user.groupBy({ by: ["status"], where: base, _count: { _all: true } }),
      ]);
      const counts = { ALL: 0, PENDING: 0, APPROVED: 0, REJECTED: 0 };
      for (const entry of statuses) { counts[entry.status] = entry._count._all; counts.ALL += entry._count._all; }
      return { items, total, page, pageSize: TABLE_PAGE_SIZE, counts };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  }
  list(actor: Actor, query: UsersQueryDto) {
    return this.db.$transaction(async (tx) => {
      await this.access.actor(tx, actor, true, true);
      const search = query.search;
      const where: Prisma.UserWhereInput = {
        status: query.status,
        role: { not: "COLLABORATOR" },
        NOT: { isInvitedAdmin: true, disabledAt: { not: null } },
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
  @Admin() @Get("members") members(@CurrentUser() actor: Actor, @Query() query: MembersQueryDto) {
    return this.users.members(actor, query);
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
  constructor(private users: UsersService, private studentsExport: StudentsExportService) {}
  @Get("students/export") async exportStudents(@CurrentUser() actor: Actor, @Query() query: StudentsExportQuery, @Res({ passthrough: true }) response: Response) {
    const file = await this.studentsExport.export(actor, query.language);
    response.set({
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="chtaw-team-students.xlsx"',
      "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff",
    });
    return new StreamableFile(file);
  }
  @Get("stats") statistics(@CurrentUser() actor: Actor) {
    return this.users.statistics(actor);
  }
}
@Module({
  controllers: [UsersController, AdminStatisticsController],
  providers: [UsersService, UserBansService, StudentsExportService],
  exports: [UsersService],
})
export class UsersModule {}
