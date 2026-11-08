import "reflect-metadata";
import "dotenv/config";
import { Test } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { randomUUID } from "node:crypto";
import * as argon2 from "argon2";
import { configureApp } from "../src/bootstrap";
import { PrismaService } from "../src/prisma/prisma.module";
describe("Corrections membres et sessions sur base isolée", () => {
  let app: INestApplication;
  let db: PrismaService;
  let adminToken: string;
  let adminId: string;
  let memberToken: string;
  let cookie: string;
  let memberId: string;
  let generalId: string;
  const origin = "http://127.0.0.1:3001";
  const api = () => request(app.getHttpServer());
  beforeAll(async () => {
    const url = process.env.TEST_DATABASE_URL;
    if (!url || !/^\/chtaw_test_[a-f0-9]{12}$/.test(new URL(url).pathname) || process.env.ISOLATED_TEST_DATABASE !== new URL(url).pathname.slice(1)) throw Error("New isolated database required.");
    process.env.DATABASE_URL = url;
    const { AppModule } = await import("../src/app.module");
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = configureApp(module.createNestApplication({ bodyParser: false, logger: false }));
    await app.init();
    db = app.get(PrismaService);
    const general = await db.group.findFirst({ where: { isGeneral: true } }) ?? await db.group.create({ data: { name: "General test", isGeneral: true } });
    generalId = general.id;
    const password = "Corrections-Test-Only-2026!";
    const passwordHash = await argon2.hash(password);
    const admin = await db.user.create({ data: { email: randomUUID() + "@test.invalid", firstName: "Admin", lastName: "Test", passwordHash, role: "ADMIN", status: "APPROVED", memberships: { create: { groupId: generalId } } } });
    const member = await db.user.create({ data: { email: randomUUID() + "@test.invalid", firstName: "Member", lastName: "Test", passwordHash, status: "PENDING" } });
    memberId = member.id;
    adminId = admin.id;
    adminToken = (await api().post("/api/v1/auth/login").send({ email: admin.email, password }).expect(200)).body.accessToken;
    const login = await api().post("/api/v1/auth/login").set("Origin", origin).set("X-Session-Transport", "cookie").send({ email: member.email, password }).expect(200);
    memberToken = login.body.accessToken;
    cookie = String(login.headers["set-cookie"]![0]).split(";")[0]!;
  });
  afterAll(async () => { await app?.close(); });
  it("historise la décision et refuse de la rejouer", async () => {
    await api().patch("/api/v1/approvals/" + memberId).auth(adminToken, { type: "bearer" }).send({ status: "APPROVED" }).expect(200);
    const history = await api().get("/api/v1/approvals/" + memberId + "/history").auth(adminToken, { type: "bearer" }).expect(200);
    expect(history.body).toHaveLength(1);
    expect(history.body[0]).toMatchObject({ status: "APPROVED", actor: { firstName: "Admin" } });
    await api().patch("/api/v1/approvals/" + memberId).auth(adminToken, { type: "bearer" }).send({ status: "REJECTED" }).expect(409);
  });
  it("interdit les retraits du général et protège l’historique", async () => {
    await api().delete("/api/v1/groups/" + generalId + "/members/" + memberId).auth(adminToken, { type: "bearer" }).expect(403);
    expect(await db.groupMember.count({ where: { groupId: generalId, userId: memberId } })).toBe(1);
    await api().get("/api/v1/approvals/" + memberId + "/history").auth(memberToken, { type: "bearer" }).expect(403);
  });
  it("sert les séances personnelles réelles sans accepter un autre identifiant", async () => {
    const other = await db.user.create({ data: { email: randomUUID() + "@test.invalid", firstName: "Other", lastName: "Member", passwordHash: "unused-test-only", status: "APPROVED", memberships: { create: { groupId: generalId } } } });
    const create = async (userId: string, startsAt: Date, endsAt: Date, absent = false) => db.poll.create({ data: {
      question: "Personal " + randomUUID(), groupId: generalId, authorId: adminId, type: "SESSION", mandatoryAttendance: true,
      options: { create: { label: "Slot", position: 0, startsAt, endsAt } },
      participants: { create: { userId, ...(absent ? { absenceConfirmedAt: new Date() } : {}) } },
    } });
    const future = await create(memberId, new Date("2099-01-01T13:00:00Z"), new Date("2099-01-01T14:00:00Z"));
    const absent = await create(memberId, new Date("2020-01-01T13:00:00Z"), new Date("2020-01-01T14:00:00Z"), true);
    const foreign = await create(other.id, new Date("2099-01-02T13:00:00Z"), new Date("2099-01-02T14:00:00Z"));
    const mine = await api().get("/api/v1/attendance/me").auth(memberToken, { type: "bearer" }).expect(200);
    expect(mine.body.items.find((item: { id: string }) => item.id === future.id)).toMatchObject({ attendanceStatus: "UPCOMING", completed: false });
    expect(mine.body.items.find((item: { id: string }) => item.id === absent.id)).toMatchObject({ attendanceStatus: "ABSENT", completed: true });
    expect(mine.body.items.some((item: { id: string }) => item.id === foreign.id)).toBe(false);
    expect(mine.body.stats).toMatchObject({ upcoming: 1, absent: 1, completed: 1 });
    await api().get("/api/v1/attendance/me?userId=" + other.id).auth(memberToken, { type: "bearer" }).expect(400);
    await api().get("/api/v1/users/" + other.id + "/attendance").auth(memberToken, { type: "bearer" }).expect(403);
    await api().put("/api/v1/polls/" + future.id + "/attendance").auth(memberToken, { type: "bearer" }).send({ entries: [] }).expect(403);
    const filtered = await api().get("/api/v1/attendance/me?from=2099-01-01&to=2099-01-01&status=UPCOMING&limit=1&page=1&timeZone=Africa%2FTunis").auth(memberToken, { type: "bearer" }).expect(200);
    expect(filtered.body.total).toBe(1);
    expect(filtered.body.items[0].id).toBe(future.id);
    await api().get("/api/v1/attendance/me?from=2099-02-01&to=2099-01-01").auth(memberToken, { type: "bearer" }).expect(400);
    await api().get("/api/v1/attendance/me?timeZone=Invalid%2FZone").auth(memberToken, { type: "bearer" }).expect(400);
    const hidden = await db.group.create({ data: { name: "Private history", members: { create: { userId: adminId } } } });
    const hiddenPoll = await db.poll.create({ data: { question: "Hidden session", authorId: adminId, groupId: hidden.id, type: "SESSION", mandatoryAttendance: true, participants: { create: { userId: memberId } }, options: { create: { label: "Hidden", position: 0, startsAt: new Date("2099-03-01T10:00:00Z"), endsAt: new Date("2099-03-01T11:00:00Z") } } } });
    const hiddenResult = await api().get("/api/v1/attendance/me?groupId=" + hidden.id).auth(memberToken, { type: "bearer" }).expect(200);
    expect(hiddenResult.body.items.some((item: { id: string }) => item.id === hiddenPoll.id)).toBe(false);
  });
  it("révoque la session par cookie sans access token et contrôle l’origine", async () => {
    await api().post("/api/v1/auth/logout-browser").set("Cookie", cookie).set("Origin", "https://foreign.invalid").expect(403);
    const response = await api().post("/api/v1/auth/logout-browser").set("Cookie", cookie).set("Origin", origin).expect(204);
    expect(response.headers["set-cookie"]).toBeDefined();
    await api().get("/api/v1/auth/me").auth(memberToken, { type: "bearer" }).expect(401);
    await api().post("/api/v1/auth/logout-browser").set("Cookie", cookie).set("Origin", origin).expect(204);
  });
});
