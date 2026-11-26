import "reflect-metadata";
import { Test } from "@nestjs/testing";
import { INestApplication } from "@nestjs/common";
import { ThrottlerStorage, ThrottlerStorageService } from "@nestjs/throttler";
import request from "supertest";
import { randomUUID } from "node:crypto";
import * as argon2 from "argon2";
import { PrismaService } from "../src/prisma/prisma.module";
import { configureApp } from "../src/bootstrap";

describe("Website contact inbox (isolated PostgreSQL)", () => {
  let app: INestApplication, db: PrismaService;
  let limiter = new ThrottlerStorageService();
  const tokens: Record<string, string> = {};
  const api = () => request(app.getHttpServer());
  const auth = (role = "ADMIN") => ({ Authorization: `Bearer ${tokens[role]}` });
  const endpoint = "/api/v1/admin/contact-requests";
  const payload = { name: "Website Visitor", email: "visitor@example.test", subject: "registration", message: "Please help with registration.", website: "" };
  beforeAll(async () => {
    if (process.env.CHTAW_ISOLATED_TESTS !== "1") throw Error("Isolated runner required.");
    const { AppModule } = await import("../src/app.module");
    const module = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(ThrottlerStorage)
      .useValue({ increment: (...args: Parameters<ThrottlerStorageService["increment"]>) => limiter.increment(...args) }).compile();
    app = configureApp(module.createNestApplication({ bodyParser: false, logger: false }));
    await app.init(); db = app.get(PrismaService);
    const password = "Disposable-Contact-2026!";
    const passwordHash = await argon2.hash(password);
    for (const role of ["ADMIN", "USER", "COLLABORATOR", "PENDING"] as const) {
      const user = await db.user.create({ data: { email: `contact-${randomUUID()}@test.invalid`, passwordHash, firstName: "Contact", lastName: "Fixture", role: role === "PENDING" ? "USER" : role,
        status: role === "PENDING" ? "PENDING" : "APPROVED", ...(role === "COLLABORATOR" ? { activatedAt: new Date() } : {}) } });
      const response = await api().post("/api/v1/auth/login").send({ email: user.email, password }).expect(200);
      tokens[role] = response.body.accessToken as string;
    }
  });
  beforeEach(() => { limiter.onApplicationShutdown(); limiter = new ThrottlerStorageService(); });
  afterAll(async () => { limiter.onApplicationShutdown(); await app?.close(); });
  it("receives anonymously, persists and allows only administration to read and process", async () => {
    expect((await api().post("/api/v1/contact").send(payload).expect(201)).body).toEqual({ received: true });
    const list = await api().get(endpoint).set(auth()).expect(200);
    const item = list.body.find((row: { name: string }) => row.name === payload.name);
    expect(item).toBeDefined(); expect(item.email).toBeUndefined(); expect(item.senderHash).toBeUndefined();
    const response = await api().get(`${endpoint}/${item.id}`).set(auth()).expect(200);
    expect(response.body.message).toBe(payload.message); expect(response.body.email).toBe(payload.email);
    expect(response.body.senderHash).toBeUndefined(); expect(response.headers["cache-control"]).toBe("private, no-store");
    await api().patch(`${endpoint}/${item.id}`).set(auth()).send({ status: "PROCESSED" }).expect(200);
    expect((await api().get(`${endpoint}/${item.id}`).set(auth()).expect(200)).body.status).toBe("PROCESSED");
    await api().patch(`${endpoint}/${item.id}`).set(auth()).send({ status: "NEW" }).expect(200);
    for (const role of ["USER", "COLLABORATOR", "PENDING", "ANONYMOUS"]) {
      for (const build of [() => api().get(endpoint), () => api().get(`${endpoint}/${item.id}`), () => api().patch(`${endpoint}/${item.id}`).send({ status: "PROCESSED" })]) {
        const req = build(); if (role !== "ANONYMOUS") req.set(auth(role));
        await req.expect(role === "ANONYMOUS" ? 401 : 403);
      }
    }
  });
  it.each([{ name: "" }, { email: "bad" }, { subject: "unknown" }, { message: "x" }, { website: "bot" }, { message: "x".repeat(5001) }, { role: "ADMIN" }])("rejects invalid input %j without persistence", async invalid => {
    const before = await db.contactRequest.count();
    await api().post("/api/v1/contact").send({ ...payload, ...invalid }).expect(400);
    expect(await db.contactRequest.count()).toBe(before);
  });
  it("enforces the durable limit under concurrent requests and ignores forged forwarded addresses", async () => {
    // Use a separate synthetic sender for the service concurrency assertion.
    const { ContactService } = await import("../src/contact/contact.module");
    const service = app.get(ContactService);
    const results = await Promise.allSettled(Array.from({ length: 5 }, () => service.receive(payload as never, "contact-concurrency-fixture")));
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(3);
    expect(results.filter(result => result.status === "rejected")).toHaveLength(2);
    for (let i = 0; i < 3; i++) await api().post("/api/v1/contact").set("X-Forwarded-For", `198.51.100.${i + 1}`).send(payload);
    await api().post("/api/v1/contact").set("X-Forwarded-For", "198.51.100.99").send(payload).expect(429);
  });
});
