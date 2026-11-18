import { Controller, Get, Injectable, Module, NotFoundException, Query } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Prisma } from "@prisma/client";
import { Admin, CurrentUser } from "../auth/security";
import { AccessService, Actor } from "../common/access";
import { PrismaService } from "../prisma/prisma.module";
import { AnalyticsQuery } from "./analytics.dto";
import { analyticsPeriod } from "./analytics.period";
import { alertsSql, registrationsSql, sessionsSql, summarySql } from "./analytics.sql";

export type Counts = { present: number; absent: number; pending: number };
export type GroupAnalytics = Counts & { id: string; name: string; members: number };
export type RegistrationBucket = { from: string; to: string; count: number; cumulative: number };
type SessionAnalytics = Counts & { id: string; name: string; date: string; groups: string[] };
type AlertAnalytics = { id: string; userId: string; student: string; organizer: string; absences: number; groups: string[] };
export const attendanceRate = (present: number, absent: number) => present + absent ? Math.round(1000 * present / (present + absent)) / 10 : null;

@Injectable()
export class AnalyticsService {
  constructor(private db: PrismaService, private access: AccessService, private config: ConfigService) {}
  private range(query: AnalyticsQuery) { return analyticsPeriod(query, this.config.get<string>("NOTIFICATION_TIMEZONE") || "Africa/Tunis"); }
  private async authorize(tx: Prisma.TransactionClient, actor: Actor, groupId?: string) {
    await this.access.actor(tx, actor, true, true);
    // An administrator can analyze every group, regardless of membership.
    if (groupId && !await tx.group.findUnique({ where: { id: groupId }, select: { id: true } })) throw new NotFoundException("Groupe introuvable.");
  }
  summary(actor: Actor, query: AnalyticsQuery) {
    const range = this.range(query);
    return this.db.$transaction(async tx => {
      await this.authorize(tx, actor, query.groupId);
      const [attendance] = await tx.$queryRaw<{ data: Counts & { sessions: number; groups: GroupAnalytics[] } }[]>(summarySql(range));
      const [registrations] = await tx.$queryRaw<{ data: { users: number; approved: number; pending: number; series: RegistrationBucket[] } }[]>(registrationsSql(range));
      const a = attendance!.data, r = registrations!.data;
      return {
        period: { from: range.from, to: range.to, timeZone: range.timeZone, interval: range.interval },
        generatedAt: range.now.toISOString(),
        kpis: { users: r.users, approved: r.approved, pendingUsers: r.pending,
          groups: query.groupId ? 1 : a.groups.length, sessions: a.sessions,
          present: a.present, absent: a.absent, pending: a.pending, rate: attendanceRate(a.present, a.absent) },
        registrations: r.series,
        groups: a.groups.map(group => ({ ...group, rate: attendanceRate(group.present, group.absent) })),
      };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, timeout: 20000 });
  }
  sessions(actor: Actor, query: AnalyticsQuery) {
    const range = this.range(query);
    return this.db.$transaction(async tx => {
      await this.authorize(tx, actor, query.groupId);
      const [result] = await tx.$queryRaw<{ data: { total: number; items: SessionAnalytics[] } }[]>(sessionsSql(range, query.page));
      return { ...result!.data, page: query.page, limit: 8,
        items: result!.data.items.map(item => ({ ...item, rate: attendanceRate(item.present, item.absent) })) };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, timeout: 20000 });
  }
  alerts(actor: Actor, query: AnalyticsQuery) {
    return this.db.$transaction(async tx => {
      await this.authorize(tx, actor, query.groupId);
      const [result] = await tx.$queryRaw<{ data: { total: number; items: AlertAnalytics[] } }[]>(alertsSql(query.groupId ?? null, query.page));
      return { ...result!.data, page: query.page, limit: 5 };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, timeout: 20000 });
  }
}

@Admin()
@Controller("admin/analytics")
export class AnalyticsController {
  constructor(private service: AnalyticsService) {}
  @Get() summary(@CurrentUser() actor: Actor, @Query() query: AnalyticsQuery) { return this.service.summary(actor, query); }
  @Get("sessions") sessions(@CurrentUser() actor: Actor, @Query() query: AnalyticsQuery) { return this.service.sessions(actor, query); }
  @Get("alerts") alerts(@CurrentUser() actor: Actor, @Query() query: AnalyticsQuery) { return this.service.alerts(actor, query); }
}

@Module({ providers: [AnalyticsService], controllers: [AnalyticsController] })
export class AnalyticsModule {}
