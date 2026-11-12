import "reflect-metadata";
import { Test } from "@nestjs/testing";
import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { randomUUID } from "node:crypto";
import * as argon2 from "argon2";
import { PrismaService } from "../src/prisma/prisma.module";
import { configureApp } from "../src/bootstrap";
import { ThrottlerStorage, ThrottlerStorageService } from "@nestjs/throttler";

describe("Organizer and client participation boundaries", () => {
  let app: INestApplication, db: PrismaService;
  let limiter = new ThrottlerStorageService();
  const tokens: Record<string, string> = {}, ids: Record<string, string> = {};
  let groupId: string, session: { id: string; options: { id: string }[] }, ordinary: typeof session;
  const password = "Local-Role-Participation-Test-2026!", suffix = randomUUID();
  const api = () => request(app.getHttpServer());
  const auth = (role: string) => ({ Authorization: `Bearer ${tokens[role]}` });
  beforeAll(async () => {
    if (process.env.CHTAW_ISOLATED_TESTS !== "1") throw Error("Isolated runner required.");
    const { AppModule } = await import("../src/app.module");
    const module = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(ThrottlerStorage)
      .useValue({ increment: (...args: Parameters<ThrottlerStorageService["increment"]>) => limiter.increment(...args) }).compile();
    app = configureApp(module.createNestApplication({ bodyParser: false, logger: false })); await app.init(); db = app.get(PrismaService);
    const passwordHash = await argon2.hash(password);
    for (const role of ["ADMIN", "COLLABORATOR", "USER"] as const) {
      const user = await db.user.create({ data: { email: `participation-${role.toLowerCase()}-${suffix}@test.invalid`, passwordHash, firstName: role, lastName: "Fixture", role, status: "APPROVED", ...(role === "COLLABORATOR" ? { activatedAt: new Date() } : {}) } });
      ids[role] = user.id;
      tokens[role] = (await api().post("/api/v1/auth/login").send({ email: user.email, password }).expect(200)).body.accessToken as string;
    }
    groupId = (await db.group.create({ data: { name: `Roles ${suffix}`, members: { create: Object.values(ids).map((userId) => ({ userId })) } } })).id;
    session = (await api().post(`/api/v1/groups/${groupId}/polls`).set(auth("ADMIN")).send({ question: "Session fixture", type: "SESSION", mandatoryAttendance: true,
      singleChoice: false, status: "OPEN", endsAt: new Date(Date.now() + 3600000).toISOString(), options: ["Matin"],
      startsAt: [new Date(Date.now() + 7200000).toISOString()], slotEndsAt: [new Date(Date.now() + 10800000).toISOString()] }).expect(201)).body;
    ordinary = (await api().post(`/api/v1/groups/${groupId}/polls`).set(auth("ADMIN")).send({ question: "Ordinary fixture", type: "ORDINARY", singleChoice: true, options: ["Oui", "Non"] }).expect(201)).body;
  });
  beforeEach(() => { limiter.onApplicationShutdown(); limiter = new ThrottlerStorageService(); });
  afterAll(async () => { limiter.onApplicationShutdown(); await app?.close(); });

  it.each(["ADMIN", "COLLABORATOR"])("refuses direct session vote creation and modification by %s", async (role) => {
    for (const method of ["post", "put"] as const) await api()[method](`/api/v1/polls/${session.id}/votes`).set(auth(role)).send({ optionIds: [session.options[0]!.id] }).expect(400);
    expect(await db.pollVote.count({ where: { pollId: session.id, userId: ids[role] } })).toBe(0);
    expect(await db.sessionParticipant.count({ where: { pollId: session.id, userId: ids[role] } })).toBe(0);
  });
  it.each(["ADMIN", "COLLABORATOR", "USER"])("allows %s to vote in an ordinary poll", async (role) => {
    const listed = (await api().get("/api/v1/polls?limit=100").set(auth(role)).expect(200)).body.items as { id: string }[];
    expect(listed.some((poll) => poll.id === ordinary.id)).toBe(true);
    if (role === "COLLABORATOR") expect(listed.some((poll) => poll.id === session.id)).toBe(false);
    await api().post(`/api/v1/polls/${ordinary.id}/votes`).set(auth(role)).send({ optionIds: [ordinary.options[0]!.id] }).expect(201);
  });
  it("lets a client vote in the session and records only clients as attendance participants", async () => {
    await api().post(`/api/v1/polls/${session.id}/votes`).set(auth("USER")).send({ optionIds: [session.options[0]!.id] }).expect(201);
    const participants = await db.sessionParticipant.findMany({ where: { pollId: session.id }, select: { userId: true } });
    expect(participants.map((item) => item.userId)).toEqual([ids.USER]);
  });
  it("lets only the admin remove collaborators, retaining the account and protecting admin membership", async () => {
    await api().delete(`/api/v1/groups/${groupId}/members/${ids.COLLABORATOR}`).set(auth("USER")).expect(403);
    await api().delete(`/api/v1/groups/${groupId}/members/${ids.USER}`).set(auth("COLLABORATOR")).expect(403);
    await api().delete(`/api/v1/groups/${groupId}/members/${ids.ADMIN}`).set(auth("ADMIN")).expect(403);
    await api().delete(`/api/v1/groups/${groupId}/members/${ids.COLLABORATOR}`).set(auth("ADMIN")).expect(200);
    expect(await db.user.count({ where: { id: ids.COLLABORATOR } })).toBe(1);
    expect(await db.groupMember.count({ where: { groupId, userId: ids.COLLABORATOR } })).toBe(0);
    await api().get(`/api/v1/groups/${groupId}/messages`).set(auth("COLLABORATOR")).expect(403);
  });
});
