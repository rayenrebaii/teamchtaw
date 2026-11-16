import "reflect-metadata";
import { Test } from "@nestjs/testing";
import { INestApplication } from "@nestjs/common";
import { ThrottlerStorage, ThrottlerStorageService } from "@nestjs/throttler";
import request from "supertest";
import { randomUUID } from "node:crypto";
import * as argon2 from "argon2";
import { PrismaService } from "../src/prisma/prisma.module";
import { configureApp } from "../src/bootstrap";

describe("Independent administrator establishment CRUD (isolated PostgreSQL)", () => {
  let app: INestApplication, db: PrismaService;
  let limiter = new ThrottlerStorageService();
  const tokens: Record<string, string> = {};
  const users: Record<string, string> = {};
  const endpoint = "/api/v1/admin/establishments";
  const api = () => request(app.getHttpServer());
  const auth = (role = "ADMIN") => ({ Authorization: `Bearer ${tokens[role]}` });
  beforeAll(async () => {
    if (process.env.CHTAW_ISOLATED_TESTS !== "1") throw Error("Isolated runner required.");
    const { AppModule } = await import("../src/app.module");
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(ThrottlerStorage).useValue({ increment: (...args: Parameters<ThrottlerStorageService["increment"]>) => limiter.increment(...args) }).compile();
    app = configureApp(module.createNestApplication({ bodyParser: false, logger: false }));
    await app.init(); db = app.get(PrismaService);
    const password = "Disposable-School-Test-2026!";
    const passwordHash = await argon2.hash(password);
    for (const role of ["ADMIN", "USER", "COLLABORATOR", "PENDING"] as const) {
      const user = await db.user.create({ data: { email: `school-${randomUUID()}@test.invalid`, passwordHash, firstName: "School", lastName: "Fixture",
        role: role === "PENDING" ? "USER" : role, status: role === "PENDING" ? "PENDING" : "APPROVED",
        ...(role === "COLLABORATOR" ? { activatedAt: new Date() } : {}) } });
      users[role] = user.id;
      const response = await api().post("/api/v1/auth/login").send({ email: user.email, password }).expect(200);
      tokens[role] = response.body.accessToken as string;
    }
  });
  beforeEach(() => { limiter.onApplicationShutdown(); limiter = new ThrottlerStorageService(); });
  afterAll(async () => { limiter.onApplicationShutdown(); await app?.close(); });

  it("creates, lists, reads, renames and deletes with no effects on existing business data", async () => {
    const counts = async () => [await db.user.count(), await db.group.count(), await db.poll.count(), await db.sessionParticipant.count()];
    const before = await counts();
    const name = `Lycée ${randomUUID()}`;
    const created = await api().post(endpoint).set(auth()).send({ name: ` \t${name}\n ` }).expect(201);
    const id = created.body.id as string;
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    expect(Object.keys(created.body).sort()).toEqual(["id", "name"]);
    expect(created.body.name).toBe(name);
    const list = await api().get(endpoint).set(auth()).expect(200);
    expect(list.body).toContainEqual({ id, name });
    expect((await api().get(`${endpoint}/${id}`).set(auth()).expect(200)).body).toEqual({ id, name });
    const renamed = `${name} Renommé`;
    expect((await api().patch(`${endpoint}/${id}`).set(auth()).send({ name: ` ${renamed} ` }).expect(200)).body).toEqual({ id, name: renamed });
    await api().delete(`${endpoint}/${id}`).set(auth()).expect(204);
    await api().get(`${endpoint}/${id}`).set(auth()).expect(404);
    await api().patch(`${endpoint}/${id}`).set(auth()).send({ name }).expect(404);
    await api().delete(`${endpoint}/${id}`).set(auth()).expect(404);
    expect(await counts()).toEqual(before);
  });
  it.each([{}, { name: null }, { name: "" }, { name: " \n\t " }, { name: 5 }, { name: "x".repeat(121) }, { name: "School", address: "Extra" }])("rejects invalid create and update bodies %p", async body => {
    const item = await db.establishment.create({ data: { name: randomUUID() } });
    await api().post(endpoint).set(auth()).send(body).expect(400);
    await api().patch(`${endpoint}/${item.id}`).set(auth()).send(body).expect(400);
    expect((await db.establishment.findUniqueOrThrow({ where: { id: item.id } })).name).toBe(item.name);
  });
  it("rejects case-insensitive duplicates on creation and renaming, including concurrent writes", async () => {
    const name = `Lycée ${randomUUID()}`;
    const created = await api().post(endpoint).set(auth()).send({ name }).expect(201);
    await api().post(endpoint).set(auth()).send({ name: ` ${name.toUpperCase()} ` }).expect(409);
    const other = await db.establishment.create({ data: { name: randomUUID() } });
    await api().patch(`${endpoint}/${other.id}`).set(auth()).send({ name: name.toUpperCase() }).expect(409);
    await api().patch(`${endpoint}/${created.body.id}`).set(auth()).send({ name: name.toUpperCase() }).expect(200);
    const concurrentName = `Concurrent ${randomUUID()}`;
    const responses = await Promise.all([concurrentName, concurrentName.toUpperCase()].map(name => api().post(endpoint).set(auth()).send({ name })));
    expect(responses.map(response => response.status).sort()).toEqual([201, 409]);
    // The SQL index also protects writes outside the HTTP controller.
    await expect(db.establishment.create({ data: { name: name.toLowerCase() } })).rejects.toMatchObject({ code: "P2002" });
  });
  it.each(["USER", "COLLABORATOR", "PENDING", "ANONYMOUS"])("refuses every route for %s", async role => {
    const item = await db.establishment.create({ data: { name: randomUUID() } });
    for (const build of [() => api().get(endpoint), () => api().get(`${endpoint}/${item.id}`), () => api().post(endpoint).send({ name: randomUUID() }), () => api().patch(`${endpoint}/${item.id}`).send({ name: "Forbidden" }), () => api().delete(`${endpoint}/${item.id}`)]) {
      const req = build();
      if (role !== "ANONYMOUS") req.set(auth(role));
      await req.expect(role === "ANONYMOUS" ? 401 : 403);
    }
    expect(await db.establishment.findUnique({ where: { id: item.id } })).toEqual(item);
  });
  it("rejects malformed and unknown ids", async () => {
    for (const id of ["invalid", randomUUID()]) {
      const status = id === "invalid" ? 400 : 404;
      await api().get(`${endpoint}/${id}`).set(auth()).expect(status);
      await api().patch(`${endpoint}/${id}`).set(auth()).send({ name: "School" }).expect(status);
      await api().delete(`${endpoint}/${id}`).set(auth()).expect(status);
    }
  });
  it("rejects an existing admin session after its owner loses the admin role", async () => {
    await db.user.update({ where: { id: users.ADMIN }, data: { role: "USER" } });
    await api().get(endpoint).set(auth()).expect(403);
  });
});
