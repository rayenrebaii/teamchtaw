import { Injectable, Logger, OnModuleDestroy, OnModuleInit, Optional } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.module";
import { AccessService } from "../common/access";
import { DomainEvents } from "../common/events";
import { NotificationsService } from "./notifications.service";
import { PushTransport } from "./push.transport";
import { permits, reminderPlan } from "./notifications.rules";
import { FirebaseIdentity } from "../auth/firebase.service";
@Injectable()
export class NotificationsWorker implements OnModuleInit, OnModuleDestroy {
  private timer?: ReturnType<typeof setInterval>;
  private unsubscribe?: () => void;
  private flight?: Promise<void>;
  private pushFlight?: Promise<void>;
  private logger = new Logger(NotificationsWorker.name);
  constructor(
    private db: PrismaService,
    private access: AccessService,
    private events: DomainEvents,
    private service: NotificationsService,
    private push: PushTransport,
    private config: ConfigService,
    @Optional() private firebase?: FirebaseIdentity,
  ) {}
  onModuleInit() {
    if (this.config.get("NODE_ENV") === "test") return;
    const run = () => {
      void this.work()
        .then(() => this.deliverPush())
        .catch(() => this.logger.warn("Notification worker will retry."));
    };
    this.unsubscribe = this.events.subscribe(async (event) => {
      if (["message:created", "poll:created", "poll:updated"].includes(event.name))
        await this.work();
    });
    this.timer = setInterval(run, 15000);
    this.timer.unref();
    run();
  }
  async onModuleDestroy() {
    clearInterval(this.timer);
    this.unsubscribe?.();
    await this.flight?.catch(() => undefined);
    await this.pushFlight?.catch(() => undefined);
  }
  work(now = new Date()) {
    if (this.flight) return this.flight;
    this.flight = this.run(now).finally(() => {
      this.flight = undefined;
    });
    return this.flight;
  }
  private async create(
    tx: Prisma.TransactionClient,
    data: Prisma.NotificationUncheckedCreateInput,
  ) {
    const existing = await tx.notification.findUnique({
      where: { userId_sourceKey: { userId: data.userId, sourceKey: data.sourceKey } },
    });
    if (existing) return existing;
    const notification = await tx.notification.create({ data });
    const subscriptions = await tx.pushSubscription.findMany({
      where: { userId: data.userId, session: { revokedAt: null, expiresAt: { gt: new Date() } } },
      select: { id: true },
    });
    if (subscriptions.length)
      await tx.pushDelivery.createMany({
        data: subscriptions.map((subscription) => ({
          notificationId: notification.id,
          subscriptionId: subscription.id,
        })),
        skipDuplicates: true,
      });
    return notification;
  }
  private async run(now: Date) {
    const sources = await this.db.notificationEvent.findMany({
      where: { processedAt: null },
      orderBy: { createdAt: "asc" },
      take: 100,
      include: { message: true },
    });
    for (const source of sources)
      await this.db.$transaction(
        async (tx) => {
          await this.access.lockGroup(tx, source.message.groupId);
          await tx.$queryRaw`SELECT "messageId" FROM "NotificationEvent" WHERE "messageId"=${source.messageId}::uuid FOR UPDATE`;
          const event = await tx.notificationEvent.findUnique({
            where: { messageId: source.messageId },
            include: { message: { include: { group: true } } },
          });
          if (!event || event.processedAt) return;
          const type = event.message.kind === "poll" ? "POLL" : "MESSAGE";
          for (const userId of [...event.recipientIds].sort()) {
            await tx.$queryRaw`SELECT id FROM "User" WHERE id=${userId}::uuid FOR UPDATE`;
            const member = await tx.user.findFirst({
              where: {
                id: userId,
                status: "APPROVED",
                memberships: { some: { groupId: event.message.groupId } },
              },
              include: { notificationPreference: true },
            });
            if (!member || !permits(member.notificationPreference, type)) continue;
            await this.create(tx, {
              userId,
              groupId: event.message.groupId,
              type,
              title:
                type === "POLL"
                  ? "Nouveau sondage"
                  : "Nouveau message dans " + event.message.group.name,
              body:
                type === "POLL"
                  ? "Un nouveau sondage est disponible dans " + event.message.group.name + "."
                  : "Un nouveau message a été publié.",
              entityId: type === "POLL" ? event.message.pollId! : event.message.id,
              sourceKey:
                type === "POLL" ? "poll:" + event.message.pollId : "message:" + event.message.id,
              expiresAt: new Date(now.getTime() + 86400000),
            });
          }
          await tx.notificationEvent.update({
            where: { messageId: source.messageId },
            data: { processedAt: now },
          });
        },
        { timeout: 15000 },
      );
    await this.plan(now);
    const jobs = await this.db.sessionReminderDelivery.findMany({
      where: { status: "PENDING", scheduledFor: { lte: now } },
      orderBy: { scheduledFor: "asc" },
      take: 100,
      include: { session: true },
    });
    for (const job of jobs)
      await this.db.$transaction(async (tx) => {
        await this.access.lockGroup(tx, job.session.groupId);
        await tx.$queryRaw`SELECT id FROM "Poll" WHERE id=${job.sessionId}::uuid FOR UPDATE`;
        await tx.$queryRaw`SELECT id FROM "SessionReminderDelivery" WHERE id=${job.id}::uuid FOR UPDATE`;
        const current = await tx.sessionReminderDelivery.findUnique({ where: { id: job.id } });
        if (!current || current.status !== "PENDING") return;
        await tx.$queryRaw`SELECT id FROM "User" WHERE id=${job.userId}::uuid FOR UPDATE`;
        const option = await tx.pollOption.findUnique({
          where: { id: job.optionId },
          include: { poll: { include: { group: true } } },
        });
        const student = await tx.user.findFirst({
          where: {
            id: job.userId,
            role: "USER",
            status: "APPROVED",
            memberships: { some: { groupId: job.session.groupId } },
          },
          include: { notificationPreference: true },
        });
        const concerned =
          option &&
          (option.poll.mandatoryAttendance
            ? !!(await tx.sessionParticipant.findFirst({
                where: { pollId: option.pollId, userId: job.userId, included: true },
              }))
            : !!(await tx.pollVote.findFirst({
                where: {
                  pollId: option.pollId,
                  userId: job.userId,
                  options: { some: { optionId: option.id } },
                },
              })));
        if (
          !option ||
          option.poll.status === "CANCELLED" ||
          !option.startsAt ||
          option.startsAt.getTime() !== job.startsAt.getTime() ||
          option.startsAt <= now ||
          !student ||
          !concerned
        ) {
          await tx.sessionReminderDelivery.update({
            where: { id: job.id },
            data: { status: "CANCELLED" },
          });
          return;
        }
        if (
          !permits(student.notificationPreference, job.reminderType) ||
          now.getTime() - job.scheduledFor.getTime() > 900000
        ) {
          await tx.sessionReminderDelivery.update({
            where: { id: job.id },
            data: { status: "SKIPPED" },
          });
          return;
        }
        const zone = this.config.get<string>("NOTIFICATION_TIMEZONE", "Africa/Tunis");
        const time = new Intl.DateTimeFormat("fr-FR", {
          timeZone: zone,
          hour: "2-digit",
          minute: "2-digit",
        }).format(option.startsAt);
        await this.create(tx, {
          userId: job.userId,
          groupId: option.poll.groupId,
          type: job.reminderType,
          title: job.reminderType === "SESSION_24H" ? "Séance demain" : "Séance dans 1 heure",
          body: `Votre séance ${option.poll.group.name} commence ${job.reminderType === "SESSION_24H" ? "demain " : ""}à ${time} (${zone}).`,
          entityId: option.pollId,
          optionId: option.id,
          sourceKey: "reminder:" + job.id,
          expiresAt: option.startsAt,
        });
        await tx.sessionReminderDelivery.update({
          where: { id: job.id },
          data: { status: "SENT", sentAt: now },
        });
      });
  }
  private async plan(now: Date) {
    await this.db
      .$executeRaw`UPDATE "SessionReminderDelivery" d SET status=\'CANCELLED\' WHERE d.status=\'PENDING\' AND NOT EXISTS (SELECT 1 FROM "PollOption" o JOIN "Poll" p ON p.id=o."pollId" WHERE o.id=d."optionId" AND o."startsAt"=d."startsAt" AND p.status<>\'CANCELLED\')`;
    const options = await this.db.pollOption.findMany({
      where: { startsAt: { gt: now }, poll: { type: "SESSION", status: { not: "CANCELLED" } } },
      include: { poll: true },
      orderBy: [{ startsAt: "asc" }, { id: "asc" }],
    });
    for (const option of options)
      await this.db.$transaction(async (tx) => {
        await this.access.lockGroup(tx, option.poll.groupId);
        await tx.$queryRaw`SELECT id FROM "Poll" WHERE id=${option.pollId}::uuid FOR UPDATE`;
        const current = await tx.pollOption.findUnique({
          where: { id: option.id },
          include: { poll: true },
        });
        if (!current?.startsAt || current.startsAt <= now || current.poll.status === "CANCELLED")
          return;
        const students = await tx.user.findMany({
          where: {
            role: "USER",
            status: "APPROVED",
            memberships: { some: { groupId: current.poll.groupId } },
            ...(current.poll.mandatoryAttendance
              ? { sessionParticipants: { some: { pollId: current.pollId, included: true } } }
              : {
                  votes: {
                    some: { pollId: current.pollId, options: { some: { optionId: current.id } } },
                  },
                }),
          },
          select: { id: true },
        });
        await tx.sessionReminderDelivery.updateMany({
          where: { optionId: current.id, status: "PENDING", startsAt: { not: current.startsAt } },
          data: { status: "CANCELLED" },
        });
        await tx.sessionReminderDelivery.createMany({
          data: students.flatMap((student) =>
            reminderPlan(
              current.startsAt!,
              current.notificationUpdatedAt,
              current.poll.createdAt,
              now,
            ).map((plan) => ({
              sessionId: current.pollId,
              optionId: current.id,
              userId: student.id,
              reminderType: plan.type,
              startsAt: current.startsAt!,
              scheduledFor: plan.scheduledFor,
              status: plan.status,
            })),
          ),
          skipDuplicates: true,
        });
      });
  }
  deliverPush(now = new Date()) {
    if (!this.push.enabled) return Promise.resolve();
    if (this.pushFlight) return this.pushFlight;
    this.pushFlight = this.sendPush(now).finally(() => {
      this.pushFlight = undefined;
    });
    return this.pushFlight;
  }
  private async sendPush(now: Date) {
    const jobs = await this.db.pushDelivery.findMany({
      where: {
        OR: [
          { status: "PENDING", nextAttemptAt: { lte: now } },
          { status: "SENDING", leaseUntil: { lt: now } },
        ],
      },
      take: 50,
      orderBy: { nextAttemptAt: "asc" },
    });
    for (const job of jobs) {
      const claim = await this.db.$transaction(async (tx) => {
        const rows = await tx.$queryRaw<
          { id: string }[]
        >`SELECT id FROM "PushDelivery" WHERE id=${job.id}::uuid AND (status='PENDING' AND "nextAttemptAt"<=${now} OR (status='SENDING' AND "leaseUntil"<${now})) FOR UPDATE SKIP LOCKED`;
        if (!rows.length) return null;
        const delivery = await tx.pushDelivery.findUnique({
          where: { id: job.id },
          include: { notification: true, subscription: { include: { session: { include: { user: { select: { firebaseUid: true, email: true } } } } } } },
        });
        if (!delivery) return null;
        const sub = delivery.subscription;
        let identityAllowed = true;
        if (this.config.get("AUTH_PROVIDER") === "firebase") {
          try {
            const identity = await this.firebase?.session(sub.session.user.firebaseUid, sub.session.firebaseAuthTime);
            identityAllowed = !!identity?.emailVerified && identity.email?.trim().toLowerCase() === sub.session.user.email;
          } catch { identityAllowed = false; }
        }
        if (
          delivery.attempts >= 5 ||
          !identityAllowed ||
          sub.userId !== delivery.notification.userId ||
          sub.session.revokedAt ||
          sub.session.expiresAt <= now ||
          !(await this.service.deliveryAllowed(tx, delivery.notification, now))
        ) {
          await tx.pushDelivery.update({
            where: { id: job.id },
            data: { status: "SKIPPED", leaseUntil: null },
          });
          return null;
        }
        await tx.pushDelivery.update({
          where: { id: job.id },
          data: {
            status: "SENDING",
            attempts: { increment: 1 },
            leaseUntil: new Date(now.getTime() + 180000),
          },
        });
        return delivery;
      });
      if (!claim) continue;
      try {
        await this.push.send(
          claim.subscription,
          {
            id: claim.notificationId,
            binding: claim.subscription.binding,
            title: "Team Chtaw",
            body:
              claim.subscription.language === "en"
                ? "A new notification is available in your account."
                : "Une nouvelle notification est disponible dans votre espace.",
          },
          Math.floor((claim.notification.expiresAt.getTime() - now.getTime()) / 1000),
        );
        await this.db.pushDelivery.updateMany({
          where: { id: job.id },
          data: { status: "SENT", sentAt: now, leaseUntil: null },
        });
      } catch (error) {
        const status =
          error && typeof error === "object" && "statusCode" in error
            ? Number(error.statusCode)
            : 0;
        if (status === 404 || status === 410)
          await this.db.pushSubscription.deleteMany({ where: { id: claim.subscriptionId } });
        else
          await this.db.pushDelivery.updateMany({
            where: { id: job.id },
            data: {
              status: claim.attempts >= 4 ? "FAILED" : "PENDING",
              leaseUntil: null,
              nextAttemptAt: new Date(now.getTime() + 60000 * 2 ** claim.attempts),
            },
          });
      }
    }
  }
}
