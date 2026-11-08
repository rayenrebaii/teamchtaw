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
export function notificationWhere(actor: Actor): Prisma.NotificationWhereInput {
  return {
    userId: actor.id,
    group: { members: { some: { userId: actor.id } } },
    ...(actor.role === "ADMIN" ? { type: { in: ["MESSAGE", "POLL"] } } : {}),
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
      return {
        items: items
          .slice(0, query.limit)
          .map(({ sourceKey: _source, userId: _owner, expiresAt: _expires, group, ...item }) => ({
            ...item,
            groupName: group.name,
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
      const item = await tx.notification.findFirst({ where: { ...notificationWhere(actor), id } });
      if (!item) throw new NotFoundException("Notification introuvable.");
      if (item.type === "MESSAGE") {
        if (!(await tx.message.findFirst({ where: { id: item.entityId, groupId: item.groupId } })))
          throw new NotFoundException("Contenu indisponible.");
        return { href: `/app/groups/${item.groupId}?message=${item.entityId}` };
      }
      const poll = await tx.poll.findFirst({ where: { id: item.entityId, groupId: item.groupId } });
      if (!poll) throw new NotFoundException("Contenu indisponible.");
      return {
        href:
          item.type === "POLL"
            ? `/app/groups/${item.groupId}?poll=${item.entityId}`
            : `/app/sessions/${item.entityId}`,
      };
    });
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
    if (!user || user.status !== "APPROVED" || item.readAt || item.expiresAt <= now) return false;
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
    return true;
  }
}
