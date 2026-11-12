import "reflect-metadata";
import { Test } from "@nestjs/testing";
import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { randomUUID } from "node:crypto";
import * as argon2 from "argon2";
import { PrismaService } from "../src/prisma/prisma.module";
import { configureApp } from "../src/bootstrap";
import { ThrottlerStorage, ThrottlerStorageService } from "@nestjs/throttler";

describe("Group join requests: privacy, decisions and duplicate protection", () => {
  let app: INestApplication, db: PrismaService;
  let limiter = new ThrottlerStorageService();
  let admin: string, member: string, collaborator: string, unapproved: string;
  let memberId: string, collaboratorId: string;
  const suffix = randomUUID();
  const password = "Local-Join-Request-Test-2026!";
  const api = () => request(app.getHttpServer());
  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
  const makeGroup = () => db.group.create({ data: { name: `Available ${randomUUID()}`, description: "Private description" } });
  beforeAll(async () => {
    if (process.env.CHTAW_ISOLATED_TESTS !== "1") throw Error("Isolated test runner required.");
    const { AppModule } = await import("../src/app.module");
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(ThrottlerStorage).useValue({ increment: (...args: Parameters<ThrottlerStorageService["increment"]>) => limiter.increment(...args) }).compile();
    app = configureApp(module.createNestApplication({ bodyParser: false, logger: false }));
    await app.init(); db = app.get(PrismaService);
    const passwordHash = await argon2.hash(password);
    for (const role of ["ADMIN", "USER", "COLLABORATOR", "PENDING"] as const) {
      const user = await db.user.create({ data: { email: `join-${role.toLowerCase()}-${suffix}@test.invalid`, firstName: role, lastName: "Fixture",
        passwordHash, role: role === "PENDING" ? "USER" : role, status: role === "PENDING" ? "PENDING" : "APPROVED",
        ...(role === "COLLABORATOR" ? { activatedAt: new Date() } : {}) } });
      const token = (await api().post("/api/v1/auth/login").send({ email: user.email, password }).expect(200)).body.accessToken as string;
      if (role === "ADMIN") admin = token;
      if (role === "USER") { member = token; memberId = user.id; }
      if (role === "COLLABORATOR") { collaborator = token; collaboratorId = user.id; }
      if (role === "PENDING") unapproved = token;
    }
  });
  beforeEach(() => { limiter.onApplicationShutdown(); limiter = new ThrottlerStorageService(); });
  afterAll(async () => { limiter.onApplicationShutdown(); await app?.close(); });

  it.each(["USER", "COLLABORATOR"] as const)("lists only names and keeps content private for %s before approval", async (role) => {
    const token = role === "USER" ? member : collaborator;
    const group = await makeGroup();
    const result = await api().get("/api/v1/groups/directory").set(auth(token)).expect(200);
    const visible = result.body.find((item: { id: string }) => item.id === group.id);
    expect(visible).toEqual({ id: group.id, name: group.name, isGeneral: false, isMember: false, requestStatus: null });
    for (const path of [`/groups/${group.id}`, `/groups/${group.id}/messages`]) await api().get(`/api/v1${path}`).set(auth(token)).expect(403);
    await api().post(`/api/v1/groups/${group.id}/messages`).set(auth(token)).send({ text: "Forbidden" }).expect(403);
    const join = await api().post(`/api/v1/groups/${group.id}/join-requests`).set(auth(token)).send({}).expect(201);
    expect(join.body.status).toBe("PENDING");
    await api().get(`/api/v1/groups/${group.id}/messages`).set(auth(token)).expect(403);
    await api().post(`/api/v1/groups/${group.id}/join-requests`).set(auth(token)).send({}).expect(409);
    await api().get("/api/v1/groups/join-requests").set(auth(token)).expect(403);
    await api().patch(`/api/v1/groups/join-requests/${join.body.id}`).set(auth(token)).send({ status: "APPROVED" }).expect(403);
    const pending = await api().get("/api/v1/groups/join-requests").set(auth(admin)).expect(200);
    expect(pending.body).toContainEqual(expect.objectContaining({ id: join.body.id, group: { id: group.id, name: group.name }, user: expect.objectContaining({ role }) }));
    await api().patch(`/api/v1/groups/join-requests/${join.body.id}`).set(auth(admin)).send({ status: "APPROVED" }).expect(200);
    await api().get(`/api/v1/groups/${group.id}/messages`).set(auth(token)).expect(200);
    expect(await db.groupMember.count({ where: { groupId: group.id, userId: role === "USER" ? memberId : collaboratorId } })).toBe(1);
    await api().patch(`/api/v1/groups/join-requests/${join.body.id}`).set(auth(admin)).send({ status: "REJECTED" }).expect(409);
  });

  it.each(["USER", "COLLABORATOR"] as const)("allows one request for %s under concurrent submissions and blocks resubmission after refusal", async (role) => {
    const token = role === "USER" ? member : collaborator;
    const group = await makeGroup();
    const responses = await Promise.all([1, 2].map(() => api().post(`/api/v1/groups/${group.id}/join-requests`).set(auth(token)).send({})));
    expect(responses.map((response) => response.status).sort()).toEqual([201, 409]);
    const id = responses.find((response) => response.status === 201)!.body.id as string;
    await api().patch(`/api/v1/groups/join-requests/${id}`).set(auth(admin)).send({ status: "REJECTED" }).expect(200);
    await api().post(`/api/v1/groups/${group.id}/join-requests`).set(auth(token)).send({}).expect(409);
    await api().get(`/api/v1/groups/${group.id}/messages`).set(auth(token)).expect(403);
    expect(await db.groupJoinRequest.count({ where: { groupId: group.id } })).toBe(1);
    expect(await db.groupMember.count({ where: { groupId: group.id } })).toBe(0);
    const directory = await api().get("/api/v1/groups/directory").set(auth(token)).expect(200);
    expect(directory.body.find((item: { id: string }) => item.id === group.id).requestStatus).toBe("REJECTED");
  });

  it("requires account approval, validates decisions and rejects requests for existing memberships", async () => {
    const group = await makeGroup();
    await api().get("/api/v1/groups/directory").set(auth(unapproved)).expect(403);
    await api().post(`/api/v1/groups/${group.id}/join-requests`).set(auth(unapproved)).send({}).expect(403);
    await api().get("/api/v1/groups/directory").expect(401);
    await db.groupMember.create({ data: { groupId: group.id, userId: memberId } });
    await api().post(`/api/v1/groups/${group.id}/join-requests`).set(auth(member)).send({}).expect(409);
    const join = await api().post(`/api/v1/groups/${group.id}/join-requests`).set(auth(collaborator)).send({}).expect(201);
    await api().patch(`/api/v1/groups/join-requests/${join.body.id}`).set(auth(admin)).send({ status: "PENDING" }).expect(400);
    const decisions = await Promise.all(["APPROVED", "REJECTED"].map((status) => api().patch(`/api/v1/groups/join-requests/${join.body.id}`).set(auth(admin)).send({ status })));
    expect(decisions.map((response) => response.status).sort()).toEqual([200, 409]);
  });
});
