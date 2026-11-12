import {
  BadRequestException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createHash, randomUUID } from "node:crypto";
import { Notification, Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.module";
import { AccessService, Actor } from "../common/access";
import {
  NotificationPreferenceDto,
  NotificationQueryDto,
  SubscribePushDto,
} from "./notifications.dto";
import { defaultPreferences, permits, validPushEndpoint } from "./notifications.rules";
import { PushTransport } from "./push.transport";
import { notificationContent } from "./notifications.content";
export function notificationWhere(actor: Actor): Prisma.NotificationWhereInput {
  return {
    userId: actor.id,
    ...(actor.role === "ADMIN" ? {} : { group: { members: { some: { userId: actor.id } } } }),
    ...(actor.role !== "USER" ? { type: { in: ["MESSAGE", "POLL", "ABSENCE_ALERT"] } } : {}),
  };
}
@Injectable()
export class NotificationsService {
  constructor(
    private db: PrismaService,
    private access: AccessService,
    private config: ConfigService,
    private push: PushTransport,
  ) {}
  settings(actor: Actor) {
    return this.db.$transaction(async (tx) => {
      await this.access.actor(tx, actor);
      const stored =
        (await tx.notificationPreference.findUnique({ where: { userId: actor.id } })) ??
        defaultPreferences;
      return {
        enabled: stored.enabled,
        messagesEnabled: stored.messagesEnabled,
        pollsEnabled: stored.pollsEnabled,
        ...(actor.role === "USER"
          ? { sessionRemindersEnabled: stored.sessionRemindersEnabled }
          : {}),
      };
    });
  }
  async updateSettings(actor: Actor, dto: NotificationPreferenceDto) {
    if (actor.role === "ADMIN" && dto.sessionRemindersEnabled !== undefined)
      throw new BadRequestException("Les rappels concernent uniquement les étudiants.");
    await this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "User" WHERE id=${actor.id}::uuid FOR UPDATE`;
      await this.access.actor(tx, actor);
      await tx.notificationPreference.upsert({
        where: { userId: actor.id },
        create: { userId: actor.id, ...dto },
        update: dto,
      });
    });
    return this.settings(actor);
  }
  configuration() {
    return { enabled: this.push.enabled, publicKey: this.push.publicKey };
  }
  list(actor: Actor, query: NotificationQueryDto) {
    return this.db.$transaction(async (tx) => {
      await this.access.actor(tx, actor);
      const where = {
        ...notificationWhere(actor),
        ...(query.unread === "true" ? { readAt: null } : {}),
      };
      if (
        query.cursor &&
        !(await tx.notification.findFirst({
          where: { ...where, id: query.cursor },
          select: { id: true },
        }))
      )
        throw new BadRequestException("Curseur invalide.");
      const items = await tx.notification.findMany({
        where,
        include: { group: { select: { name: true } } },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: query.limit + 1,
        ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      });
      const unreadCount = await tx.notification.count({
        where: { ...notificationWhere(actor), readAt: null },
      });
      const visible = items.slice(0, query.limit);
      const content = await this.describe(tx, visible.map((item) => ({ ...item, groupName: item.group.name })), query.language);
      return {
        items: visible
          .map(({ sourceKey: _source, userId: _owner, expiresAt: _expires, group, ...item }) => ({
            ...item,
            groupName: group.name,
            ...content.get(item.id),
          })),
        nextCursor: items.length > query.limit ? items[query.limit - 1]!.id : null,
        unreadCount,
      };
    });
  }
  async read(actor: Actor, id?: string) {
    return this.db.$transaction(async (tx) => {
      await this.access.actor(tx, actor);
      if (
        id &&
        !(await tx.notification.findFirst({
          where: { ...notificationWhere(actor), id },
          select: { id: true },
        }))
      )
        throw new NotFoundException("Notification introuvable.");
      await tx.notification.updateMany({
        where: { ...notificationWhere(actor), readAt: null, ...(id ? { id } : {}) },
        data: { readAt: new Date() },
      });
      return {
        unreadCount: await tx.notification.count({
          where: { ...notificationWhere(actor), readAt: null },
        }),
      };
    });
  }
  target(actor: Actor, id: string) {
    return this.db.$transaction(async (tx) => {
      await this.access.actor(tx, actor);
      return this.resolveTarget(tx, actor, id);
    });
  }
  async open(actor: Actor, id: string) {
    return this.db.$transaction(async (tx) => {
      await this.access.actor(tx, actor);
      await tx.$queryRaw`SELECT id FROM "Notification" WHERE id=${id}::uuid FOR UPDATE`;
      const target = await this.resolveTarget(tx, actor, id);
      await tx.notification.delete({ where: { id } });
      const unreadCount = await tx.notification.count({ where: { ...notificationWhere(actor), readAt: null } });
      // Deletion is committed before every connected device refreshes its badge.
      await tx.$queryRaw`SELECT pg_notify('chtaw_notifications', ${actor.id})::text AS notified`;
      return { ...target, unreadCount };
    });
  }
  private async resolveTarget(tx: Prisma.TransactionClient, actor: Actor, id: string) {
      const item = await tx.notification.findFirst({ where: { ...notificationWhere(actor), id } });
      if (!item) throw new NotFoundException("Notification introuvable.");
      if (item.type === "ABSENCE_ALERT") {
        const alert = await tx.organizerAbsenceAlert.findFirst({ where: { id: item.entityId,
          ...(actor.role === "ADMIN" ? {} : { organizerId: actor.id }) } });
        if (!alert) throw new NotFoundException("Signalement indisponible.");
        return { href: `${actor.role === "ADMIN" ? "/admin/collaborator-reports" : "/collaborator/reports"}?alert=${alert.id}` };
      }
      if (item.type === "MESSAGE") {
        if (!(await tx.message.findFirst({ where: { id: item.entityId, groupId: item.groupId } })))
          throw new NotFoundException("Contenu indisponible.");
        return { href: `/app/groups/${item.groupId}?message=${item.entityId}` };
      }
      const poll = await tx.poll.findFirst({ where: { id: item.entityId, groupId: item.groupId, archivedAt: null } });
      if (!poll) throw new NotFoundException("Contenu indisponible.");
      return {
        href:
          item.type === "POLL"
            ? `/app/groups/${item.groupId}?poll=${item.entityId}`
            : `/app/sessions/${item.entityId}`,
      };
  }
  async describe(tx: Prisma.TransactionClient, items: { id: string; type: string; entityId: string; groupId: string; groupName: string; optionId?: string | null; title: string; body: string }[], language = "fr") {
    const messageIds = items.filter((item) => item.type === "MESSAGE").map((item) => item.entityId);
    const pollIds = items.filter((item) => item.type === "POLL" || item.type.startsWith("SESSION_")).map((item) => item.entityId);
    const alertIds = items.filter((item) => item.type === "ABSENCE_ALERT").map((item) => item.entityId);
    const [messages, polls, alerts] = await Promise.all([
      messageIds.length ? tx.message.findMany({ where: { id: { in: messageIds } }, include: { author: { select: { firstName: true, lastName: true } } } }) : [],
      pollIds.length ? tx.poll.findMany({ where: { id: { in: pollIds }, archivedAt: null }, include: { author: { select: { firstName: true, lastName: true } }, options: { select: { id: true, label: true, startsAt: true } } } }) : [],
      alertIds.length ? tx.organizerAbsenceAlert.findMany({ where: { id: { in: alertIds } }, include: { user: { select: { firstName: true, lastName: true } } } }) : [],
    ]);
    return new Map(items.map((item) => {
      const message = messages.find((row) => row.id === item.entityId && row.groupId === item.groupId);
      const poll = polls.find((row) => row.id === item.entityId && row.groupId === item.groupId);
      const alert = alerts.find((row) => row.id === item.entityId);
      const author = message?.author ?? poll?.author;
      const option = poll?.options.find((row) => row.id === item.optionId);
      return [item.id, notificationContent({ ...item, authorName: author ? `${author.firstName} ${author.lastName}` : undefined,
        text: message?.text ?? poll?.question, photo: message?.kind === "photo", session: poll?.type === "SESSION",
        startsAt: option?.startsAt, slot: option?.label, studentName: alert ? `${alert.user.firstName} ${alert.user.lastName}` : undefined, absenceCount: alert?.pollIds.length },
      language, this.config.get<string>("NOTIFICATION_TIMEZONE", "Africa/Tunis"))];
    }));
  }
  subscriptions(actor: Actor) {
    return this.db.$transaction(async (tx) => {
      await this.access.actor(tx, actor);
      return tx.pushSubscription.findMany({
        where: { userId: actor.id, sessionId: actor.sessionId },
        select: { id: true, binding: true },
      });
    });
  }
  async subscribe(actor: Actor, dto: SubscribePushDto) {
    if (!this.push.enabled)
      throw new ServiceUnavailableException("Les notifications système ne sont pas configurées.");
    if (
      !validPushEndpoint(dto.endpoint, this.config.get<string[]>("PUSH_ALLOWED_ORIGINS", [])) ||
      !dto.keys ||
      Buffer.from(dto.keys.p256dh, "base64url").length !== 65 ||
      Buffer.from(dto.keys.p256dh, "base64url")[0] !== 4 ||
      Buffer.from(dto.keys.auth, "base64url").length !== 16
    )
      throw new BadRequestException("Abonnement Push invalide.");
    const endpointHash = createHash("sha256").update(dto.endpoint).digest("hex");
    return this.db.$transaction(async (tx) => {
      await this.access.actor(tx, actor);
      const data = {
        userId: actor.id,
        sessionId: actor.sessionId,
        endpoint: dto.endpoint,
        ...dto.keys,
        language: dto.language,
        binding: randomUUID(),
      };
      const subscription = await tx.pushSubscription.upsert({
        where: { endpointHash },
        create: { ...data, endpointHash },
        update: data,
      });
      return { id: subscription.id, binding: subscription.binding, userId: actor.id };
    });
  }
  async unsubscribe(actor: Actor, id: string) {
    await this.db.$transaction(async (tx) => {
      await this.access.actor(tx, actor);
      await tx.pushSubscription.deleteMany({
        where: { id, userId: actor.id, sessionId: actor.sessionId },
      });
    });
  }
  async deliveryAllowed(tx: Prisma.TransactionClient, item: Notification, now: Date) {
    const user = await tx.user.findUnique({ where: { id: item.userId } });
    if (!user || user.disabledAt || user.status !== "APPROVED" || item.readAt || item.expiresAt <= now) return false;
    if (
      !(await tx.groupMember.findUnique({
        where: { groupId_userId: { groupId: item.groupId, userId: user.id } },
      }))
    )
      return false;
    if (
      !permits(
        await tx.notificationPreference.findUnique({ where: { userId: user.id } }),
        item.type,
      )
    )
      return false;
    if (item.type.startsWith("SESSION_")) {
      const option =
        item.optionId &&
        (await tx.pollOption.findUnique({ where: { id: item.optionId }, include: { poll: true } }));
      if (
        user.role !== "USER" ||
        !option ||
        option.pollId !== item.entityId ||
        option.poll.status === "CANCELLED" ||
        !option.startsAt ||
        option.startsAt <= now ||
        option.startsAt.getTime() !== item.expiresAt.getTime()
      )
        return false;
      if (option.poll.mandatoryAttendance)
        return !!(await tx.sessionParticipant.findFirst({
          where: { pollId: item.entityId, userId: user.id, included: true },
        }));
      return !!(await tx.pollVote.findFirst({
        where: {
          pollId: item.entityId,
          userId: user.id,
          options: { some: { optionId: option.id } },
        },
      }));
    }
    if (item.type === "ABSENCE_ALERT") return !!(await tx.organizerAbsenceAlert.findFirst({
      where: { id: item.entityId, resolvedAt: null, ...(user.role === "ADMIN" ? {} : { organizerId: user.id }) },
    }));
    return true;
  }
}
