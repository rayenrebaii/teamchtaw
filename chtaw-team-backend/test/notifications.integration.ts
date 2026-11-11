import "reflect-metadata";
import "dotenv/config";
import { Test } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import request from "supertest";
import { io, type Socket } from "socket.io-client";
import { randomUUID, createECDH, randomBytes } from "node:crypto";
import type { AddressInfo } from "node:net";
import * as argon2 from "argon2";
import { PrismaService } from "../src/prisma/prisma.module";
import { ThrottlerStorage, ThrottlerStorageService } from "@nestjs/throttler";
import { AccessService } from "../src/common/access";
import { DomainEvents } from "../src/common/events";
import { configureApp } from "../src/bootstrap";
import { NotificationsWorker } from "../src/notifications/notifications.worker";
import { NotificationsService } from "../src/notifications/notifications.service";
import { PushTransport } from "../src/notifications/push.transport";
type Account = { id: string; token: string };
describe("Persistent notifications, real PostgreSQL and Socket.IO", () => {
  let app: INestApplication, db: PrismaService, worker: NotificationsWorker, second: NotificationsWorker;
  let admin: Account, student: Account, another: Account, pending: Account, outsider: Account, muted: Account, groupId: string;
  let base: string, firstId: string;
  const sockets: Socket[] = [];
  const send = jest.fn<Promise<void>, [unknown, object, number]>().mockResolvedValue(undefined);
  const push = { enabled: true, publicKey: "public-test-key", send };
  const api = () => request(app.getHttpServer());
  const get = (actor: Account, path = "") => api().get("/api/v1/notifications" + path).auth(actor.token, { type: "bearer" });
  const preferences = (actor: Account, data: object) => api().patch("/api/v1/notifications/preferences").auth(actor.token, { type: "bearer" }).send(data);
  const publish = (actor = admin, kind: "text" | "poll" = "text", pollId?: string) => db.message.create({ data: { groupId, authorId: actor.id, kind, text: "Private integration message", ...(pollId ? { pollId } : {}) } });
  const socket = async (actor: Account) => {
    const client = io(base + "/community", { auth: { token: actor.token }, transports: ["websocket"], forceNew: true, reconnection: false });
    sockets.push(client);
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(Error("Socket timeout")), 5000);
      client.once("session:ready", () => { clearTimeout(timer); resolve(); });
      client.once("connect_error", (reason) => { clearTimeout(timer); reject(reason); });
    });
    return client;
  };
  const createSession = async (start: Date, mandatoryAttendance = true) => db.poll.create({ data: {
    authorId: admin.id, groupId, question: "Scheduled " + randomUUID(), type: "SESSION", mandatoryAttendance,
    // This intentionally differs from the actual start. A reminder must not use this vote deadline.
    endsAt: new Date(start.getTime() - 1800000),
    options: { create: { label: "Real slot", position: 0, startsAt: start, endsAt: new Date(start.getTime() + 3600000) } },
    ...(mandatoryAttendance ? { participants: { create: [{ userId: student.id }, { userId: admin.id }, { userId: pending.id }, { userId: outsider.id }] } } : {}),
  }, include: { options: true } });
  beforeAll(async () => {
    const url = process.env.TEST_DATABASE_URL;
    if (!url || !/^\/chtaw_test_[a-f0-9]{12}$/.test(new URL(url).pathname) || process.env.ISOLATED_TEST_DATABASE !== new URL(url).pathname.slice(1)) throw Error("A newly created isolated test database is required.");
    process.env.DATABASE_URL = url; process.env.NODE_ENV = "test";
    const { AppModule } = await import("../src/app.module");
    const module = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(PushTransport).useValue(push).compile();
    app = configureApp(module.createNestApplication({ bodyParser: false, logger: false }));
    await app.listen(0, "127.0.0.1");
    base = "http://127.0.0.1:" + (app.getHttpServer().address() as AddressInfo).port;
    db = app.get(PrismaService); worker = app.get(NotificationsWorker);
    second = new NotificationsWorker(db, app.get(AccessService), app.get(DomainEvents), app.get(NotificationsService), app.get(PushTransport), app.get(ConfigService));
    const password = "Notifications-Test-Only-2026!", passwordHash = await argon2.hash(password);
    async function account(role: "ADMIN" | "USER" = "USER", status: "APPROVED" | "PENDING" = "APPROVED"): Promise<Account> {
      const user = await db.user.create({ data: { email: randomUUID() + "@test.invalid", firstName: "Notification", lastName: "Fixture", passwordHash, role, status } });
      // Give each disposable fixture its own login budget; keep HTTP authentication enabled.
      app.get<ThrottlerStorageService>(ThrottlerStorage).onApplicationShutdown();
      const login = await api().post("/api/v1/auth/login").send({ email: user.email, password }).expect(200);
      return { id: user.id, token: login.body.accessToken };
    }
    admin = await account("ADMIN"); student = await account(); another = await account(); pending = await account("USER", "PENDING"); outsider = await account(); muted = await account();
    const group = await db.group.create({ data: { name: "Notifications private", members: { create: [admin, student, another, pending, muted].map((actor) => ({ userId: actor.id })) } } });
    groupId = group.id;
    await preferences(muted, { enabled: false }).expect(200);
  }, 30000);
  afterAll(async () => { sockets.forEach((client) => client.close()); await second?.onModuleDestroy(); await app?.close(); });
  it("identifies a missing notification schedule migration as Prisma P2022 without altering the test schema", async () => {
    await expect(db.$transaction(async (tx) => {
      await tx.$executeRaw`ALTER TABLE "PollOption" RENAME COLUMN "notificationUpdatedAt" TO "notificationUpdatedAt_missing_test"`;
      await tx.pollOption.findMany({ take: 1 });
    })).rejects.toMatchObject({ code: "P2022" });
    // PostgreSQL rolls back both the failing query and the temporary rename.
    await expect(db.pollOption.findMany({ take: 1 })).resolves.toBeDefined();
  });
  it("persists recipient snapshots and excludes author, pending, outsiders and muted members", async () => {
    const message = await publish();
    const queued = await db.notificationEvent.findUniqueOrThrow({ where: { messageId: message.id } });
    expect(queued.recipientIds.sort()).toEqual([student.id, another.id].sort());
    await Promise.all([worker.work(), second.work()]);
    const rows = await db.notification.findMany({ where: { entityId: message.id } });
    expect(rows).toHaveLength(2); expect(rows.map((row) => row.userId).sort()).toEqual([student.id, another.id].sort());
    firstId = rows.find((row) => row.userId === student.id)!.id;
    expect(rows[0]!.body).not.toContain("Private integration");
    await worker.work(); expect(await db.notification.count({ where: { entityId: message.id } })).toBe(2);
  });
  it("authorizes history, cursor, unread counts and private no-store responses", async () => {
    const result = await get(student).expect(200);
    expect(result.headers["cache-control"]).toBe("private, no-store");
    expect(result.body.items).toHaveLength(1); expect(result.body.unreadCount).toBe(1);
    expect(result.body.items[0]).not.toHaveProperty("userId"); expect(result.body.items[0]).not.toHaveProperty("sourceKey");
    await api().get("/api/v1/notifications").expect(401);
    await get(pending).expect(403); expect((await get(outsider).expect(200)).body.items).toEqual([]);
    await get(outsider, "/" + firstId + "/target").expect(404);
    await get(outsider, "?cursor=" + firstId).expect(400);
    await api().patch("/api/v1/notifications/" + firstId + "/read").auth(outsider.token, { type: "bearer" }).expect(404);
    await preferences(student, { userId: outsider.id, enabled: false }).expect(400);
  });
  it("opens the correct message and supports read one / read all", async () => {
    const item = await db.notification.findUniqueOrThrow({ where: { id: firstId } });
    expect((await get(student, "/" + firstId + "/target").expect(200)).body.href).toBe("/app/groups/" + groupId + "?message=" + item.entityId);
    await api().patch("/api/v1/notifications/" + firstId + "/read").auth(student.token, { type: "bearer" }).expect(200);
    expect((await get(student).expect(200)).body.unreadCount).toBe(0);
    await api().patch("/api/v1/notifications/read-all").auth(another.token, { type: "bearer" }).expect(200);
    expect((await get(another).expect(200)).body.unreadCount).toBe(0);
  });
  it("notifies admins too when a student publishes", async () => {
    const message = await publish(student); await worker.work();
    const rows = await db.notification.findMany({ where: { entityId: message.id } });
    expect(rows.map((row) => row.userId).sort()).toEqual([admin.id, another.id].sort());
  });
  it("automatically processes a real message API event with the production worker lifecycle", async () => {
    const automatic = new NotificationsWorker(db, app.get(AccessService), app.get(DomainEvents), app.get(NotificationsService), app.get(PushTransport), new ConfigService({ NODE_ENV: "development", NOTIFICATION_TIMEZONE: "Africa/Tunis" }));
    automatic.onModuleInit();
    try {
      await automatic.work();
      const response = await api().post("/api/v1/groups/" + groupId + "/messages").auth(admin.token, { type: "bearer" }).send({ text: "Automatic delivery integration" }).expect(201);
      expect(await db.notification.count({ where: { entityId: response.body.id } })).toBe(2);
      expect(await db.notification.count({ where: { entityId: response.body.id, userId: admin.id } })).toBe(0);
    } finally { await automatic.onModuleDestroy(); }
  });
  it("creates one poll notification and none for an edit or vote", async () => {
    const poll = await db.poll.create({ data: { groupId, authorId: admin.id, question: "A new poll", options: { create: [{ label: "Yes", position: 0 }, { label: "No", position: 1 }] } }, include: { options: true } });
    await publish(admin, "poll", poll.id); await worker.work();
    expect(await db.notification.count({ where: { entityId: poll.id, type: "POLL" } })).toBe(2);
    expect(await db.notification.count({ where: { entityId: poll.id, type: "MESSAGE" } })).toBe(0);
    const item = await db.notification.findFirstOrThrow({ where: { entityId: poll.id, userId: student.id } });
    expect((await get(student, "/" + item.id + "/target").expect(200)).body.href).toBe("/app/groups/" + groupId + "?poll=" + poll.id);
    await db.poll.update({ where: { id: poll.id }, data: { question: "Updated poll" } });
    await db.pollVote.create({ data: { userId: student.id, pollId: poll.id, options: { create: { optionId: poll.options[0]!.id } } } });
    await worker.work(); expect(await db.notification.count({ where: { entityId: poll.id } })).toBe(2);
  });
  it("persists preferences without deleting history and observes category preferences at publication", async () => {
    const old = await db.notification.count({ where: { userId: student.id } });
    await preferences(student, { messagesEnabled: false }).expect(200);
    const message = await publish();
    await preferences(student, { messagesEnabled: true }).expect(200);
    await worker.work(); expect(await db.notification.count({ where: { userId: student.id, entityId: message.id } })).toBe(0);
    expect(await db.notification.count({ where: { userId: student.id } })).toBe(old);
    await preferences(student, { enabled: false }).expect(200);
    const next = await publish(); await worker.work();
    expect(await db.notification.count({ where: { userId: student.id, entityId: next.id } })).toBe(0);
    expect((await get(student, "/preferences").expect(200)).body.enabled).toBe(false);
    await preferences(student, { enabled: true }).expect(200);
    expect((await get(admin, "/preferences").expect(200)).body).not.toHaveProperty("sessionRemindersEnabled");
    await preferences(admin, { sessionRemindersEnabled: true }).expect(400);
  });
  it("refreshes only the recipient user room after PostgreSQL commits", async () => {
    const recipient = await socket(student), foreign = await socket(outsider), sender = await socket(admin);
    const foreignEvent = jest.fn(), senderEvent = jest.fn();
    foreign.on("notification:changed", foreignEvent); sender.on("notification:changed", senderEvent);
    const received = new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => reject(Error("Notification event not received")), 5000);
      recipient.once("notification:changed", (payload) => { clearTimeout(timer); resolve(payload); });
    });
    await publish(); await worker.work();
    expect(await received).toEqual({});
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(foreignEvent).not.toHaveBeenCalled(); expect(senderEvent).not.toHaveBeenCalled();
  });
  it("persists exactly one 24h and one 1h reminder across simultaneous workers", async () => {
    const start = new Date(Date.now() + 72 * 3600000), poll = await createSession(start);
    await worker.work();
    expect(await db.sessionReminderDelivery.count({ where: { sessionId: poll.id } })).toBe(2);
    const due24 = new Date(start.getTime() - 86400000);
    await Promise.all([worker.work(due24), second.work(due24)]);
    expect(await db.notification.count({ where: { entityId: poll.id, type: "SESSION_24H" } })).toBe(1);
    await Promise.all([worker.work(new Date(start.getTime() - 3600000)), second.work(new Date(start.getTime() - 3600000))]);
    const rows = await db.notification.findMany({ where: { entityId: poll.id } });
    expect(rows).toHaveLength(2); expect(rows.every((row) => row.userId === student.id)).toBe(true);
    expect(rows[0]!.body).toContain("Africa/Tunis");
    expect((await get(student, "/" + rows[0]!.id + "/target").expect(200)).body.href).toBe("/app/sessions/" + poll.id);
    const detail = await api().get("/api/v1/attendance/me?pollId=" + poll.id).auth(student.token, { type: "bearer" }).expect(200);
    expect(detail.body.items.map((item: { id: string }) => item.id)).toEqual([poll.id]);
    const other = await api().get("/api/v1/attendance/me?pollId=" + poll.id).auth(outsider.token, { type: "bearer" }).expect(200);
    expect(other.body.items).toEqual([]);
  });
  it("skips late 24h reminders while scheduling 1h reminders normally", async () => {
    const start = new Date(Date.now() + 3 * 3600000), poll = await createSession(start);
    await worker.work();
    expect(await db.sessionReminderDelivery.findMany({ where: { sessionId: poll.id }, orderBy: { scheduledFor: "asc" } })).toMatchObject([{ reminderType: "SESSION_24H", status: "SKIPPED" }, { reminderType: "SESSION_1H", status: "PENDING" }]);
    await worker.work(new Date(start.getTime() - 3600000));
    expect(await db.notification.count({ where: { entityId: poll.id, type: "SESSION_24H" } })).toBe(0);
    expect(await db.notification.count({ where: { entityId: poll.id, type: "SESSION_1H" } })).toBe(1);
  });
  it("cancels jobs for a cancelled session", async () => {
    const start = new Date(Date.now() + 80 * 3600000), poll = await createSession(start); await worker.work();
    await db.poll.update({ where: { id: poll.id }, data: { status: "CANCELLED" } });
    await worker.work(new Date(start.getTime() - 86400000));
    expect(await db.notification.count({ where: { entityId: poll.id } })).toBe(0);
    expect(await db.sessionReminderDelivery.count({ where: { sessionId: poll.id, status: "PENDING" } })).toBe(0);
  });
  it("recalculates starts after rescheduling without replaying the old reminder", async () => {
    const start = new Date(Date.now() + 90 * 3600000), poll = await createSession(start); await worker.work();
    const changed = new Date(start.getTime() + 5 * 3600000);
    await db.pollOption.update({ where: { id: poll.options[0]!.id }, data: { startsAt: changed, endsAt: new Date(changed.getTime() + 3600000) } });
    await worker.work();
    expect(await db.sessionReminderDelivery.count({ where: { sessionId: poll.id, startsAt: start, status: "CANCELLED" } })).toBe(2);
    await worker.work(new Date(start.getTime() - 86400000));
    expect(await db.notification.count({ where: { entityId: poll.id } })).toBe(0);
    await worker.work(new Date(changed.getTime() - 86400000));
    expect(await db.notification.count({ where: { entityId: poll.id, type: "SESSION_24H" } })).toBe(1);
  });
  it("suppresses both reminder types while preference is disabled and skips past sessions", async () => {
    const start = new Date(Date.now() + 100 * 3600000), poll = await createSession(start); await worker.work();
    await preferences(student, { sessionRemindersEnabled: false }).expect(200);
    await worker.work(new Date(start.getTime() - 86400000)); await worker.work(new Date(start.getTime() - 3600000));
    expect(await db.notification.count({ where: { entityId: poll.id } })).toBe(0);
    await preferences(student, { sessionRemindersEnabled: true }).expect(200);
    await worker.work(start); expect(await db.notification.count({ where: { entityId: poll.id } })).toBe(0);
    const past = await createSession(new Date(Date.now() - 3600000)); await worker.work();
    expect(await db.sessionReminderDelivery.count({ where: { sessionId: past.id } })).toBe(0);
  });
  it("uses selected slots for legacy sessions and skips non-voters", async () => {
    const start = new Date(Date.now() + 110 * 3600000), poll = await createSession(start, false);
    await db.pollVote.create({ data: { userId: another.id, pollId: poll.id, options: { create: { optionId: poll.options[0]!.id } } } });
    await worker.work(); await worker.work(new Date(start.getTime() - 86400000));
    const rows = await db.notification.findMany({ where: { entityId: poll.id } });
    expect(rows).toHaveLength(1); expect(rows[0]!.userId).toBe(another.id);
  });
  const subscriptionInput = () => {
    const key = createECDH("prime256v1"); key.generateKeys();
    return { endpoint: "https://fcm.googleapis.com/fcm/send/" + randomUUID(), keys: { p256dh: key.getPublicKey().toString("base64url"), auth: randomBytes(16).toString("base64url") }, language: "fr" };
  };
  const subscribe = (actor: Account, data = subscriptionInput()) => api().post("/api/v1/notifications/subscriptions").auth(actor.token, { type: "bearer" }).send(data);
  it("validates subscriptions and prevents cross-account unsubscribing", async () => {
    await subscribe(student, { ...subscriptionInput(), endpoint: "https://127.0.0.1/internal" }).expect(400);
    const data = subscriptionInput(), first = await subscribe(student, data).expect(201);
    const duplicate = await subscribe(student, data).expect(201);
    expect(duplicate.body.id).toBe(first.body.id); expect(duplicate.body.binding).not.toBe(first.body.binding);
    expect((await get(student, "/subscriptions").expect(200)).body).toEqual([{ id: duplicate.body.id, binding: duplicate.body.binding }]);
    expect((await get(outsider, "/subscriptions").expect(200)).body).toEqual([]);
    expect(duplicate.body).not.toHaveProperty("endpoint"); expect(duplicate.body).not.toHaveProperty("auth");
    await api().delete("/api/v1/notifications/subscriptions/" + first.body.id).auth(outsider.token, { type: "bearer" }).expect(204);
    expect(await db.pushSubscription.count({ where: { id: first.body.id } })).toBe(1);
    await api().delete("/api/v1/notifications/subscriptions/" + first.body.id).auth(student.token, { type: "bearer" }).expect(204);
    expect(await db.pushSubscription.count({ where: { id: first.body.id } })).toBe(0);
  });
  it("queues push independently of history and leases deliveries across workers", async () => {
    const subscription = await subscribe(student).expect(201);
    const message = await publish(); await worker.work();
    send.mockClear(); send.mockResolvedValue(undefined);
    await Promise.all([worker.deliverPush(), second.deliverPush()]);
    expect(send).toHaveBeenCalledTimes(1);
    const payload = send.mock.calls[0]![1];
    expect(JSON.stringify(payload)).not.toContain("Private integration");
    expect(JSON.stringify(payload)).not.toContain("Notifications private");
    expect(payload).toMatchObject({ binding: subscription.body.binding });
    const item = await db.notification.findFirstOrThrow({ where: { entityId: message.id, userId: student.id } });
    expect(await db.pushDelivery.findFirst({ where: { notificationId: item.id } })).toMatchObject({ status: "SENT", attempts: 1 });
    await worker.deliverPush(); expect(send).toHaveBeenCalledTimes(1);
  });
  it("removes expired 410 subscriptions without removing notification history", async () => {
    const message = await publish(); await worker.work();
    send.mockRejectedValueOnce({ statusCode: 410 }); await worker.deliverPush();
    expect(await db.pushSubscription.count({ where: { userId: student.id } })).toBe(0);
    expect(await db.notification.count({ where: { entityId: message.id, userId: student.id } })).toBe(1);
  });
  it("retries failed push without duplicating persisted notifications", async () => {
    await subscribe(student).expect(201);
    const message = await publish(); await worker.work();
    send.mockClear(); send.mockRejectedValueOnce({ statusCode: 503 });
    await worker.deliverPush();
    const item = await db.notification.findFirstOrThrow({ where: { entityId: message.id, userId: student.id } });
    const delivery = await db.pushDelivery.findFirstOrThrow({ where: { notificationId: item.id } });
    expect(delivery).toMatchObject({ status: "PENDING", attempts: 1 });
    await worker.deliverPush(); expect(send).toHaveBeenCalledTimes(1);
    send.mockResolvedValue(undefined); await worker.deliverPush(new Date(delivery.nextAttemptAt.getTime() + 1));
    expect(send).toHaveBeenCalledTimes(2);
    expect(await db.notification.count({ where: { entityId: message.id, userId: student.id } })).toBe(1);
  });
  it("rechecks group membership before history and push delivery", async () => {
    const message = await publish(); await worker.work();
    const item = await db.notification.findFirstOrThrow({ where: { entityId: message.id, userId: student.id } });
    await db.groupMember.delete({ where: { groupId_userId: { groupId, userId: student.id } } });
    send.mockClear(); await worker.deliverPush(); expect(send).not.toHaveBeenCalled();
    expect((await get(student).expect(200)).body.items).toEqual([]);
    await get(student, "/" + item.id + "/target").expect(404);
    expect(await db.notification.count({ where: { id: item.id } })).toBe(1);
    await db.groupMember.create({ data: { groupId, userId: student.id } });
  });
  it("cleans this session's subscriptions on logout and retains preferences", async () => {
    await api().post("/api/v1/auth/logout").auth(student.token, { type: "bearer" }).expect(204);
    expect(await db.pushSubscription.count({ where: { userId: student.id } })).toBe(0);
    expect(await db.notificationPreference.findUnique({ where: { userId: student.id } })).not.toBeNull();
    await get(student).expect(401);
  });
});
