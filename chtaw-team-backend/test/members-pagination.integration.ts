import "reflect-metadata";
import { Test } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { randomUUID } from "node:crypto";
import * as argon2 from "argon2";
import { PrismaService } from "../src/prisma/prisma.module";
import { configureApp } from "../src/bootstrap";

describe("Members pagination over HTTP", () => {
  let app: INestApplication, db: PrismaService, token: string, userToken: string;
  const marker = `pagination-${randomUUID()}`;
  const password = "Disposable-Members-2026!";
  const api = () => request(app.getHttpServer());
  const auth = () => ({ Authorization: `Bearer ${token}` });
  beforeAll(async () => {
    if (process.env.CHTAW_ISOLATED_TESTS !== "1") throw Error("Isolated runner required.");
    const { AppModule } = await import("../src/app.module");
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = configureApp(module.createNestApplication({ bodyParser: false, logger: false }));
    await app.init(); db = app.get(PrismaService);
    const passwordHash = await argon2.hash(password);
    for (const role of ["ADMIN", "USER"] as const) {
      const user = await db.user.create({ data: { email: `${role}-${marker}@test.invalid`, firstName: "Pagination", lastName: role, passwordHash, role, status: "APPROVED" } });
      const response = await api().post("/api/v1/auth/login").send({ email: user.email, password }).expect(200);
      if (role === "ADMIN") token = response.body.accessToken as string;
      else userToken = response.body.accessToken as string;
    }
    await db.user.createMany({ data: Array.from({ length: 13 }, (_, index) => ({
      email: `${index}-${marker}@test.invalid`, firstName: "Batch", lastName: marker, passwordHash,
      status: index < 7 ? "PENDING" as const : "APPROVED" as const,
      joinedAt: new Date("2026-11-01T12:00:00Z"),
    })) });
  });
  afterAll(async () => { await app?.close(); });
  it("returns disjoint batches of six with stable ordering, totals and server search", async () => {
    const getPage = (page: number) => api().get("/api/v1/users/members").set(auth()).query({ page, search: `Batch ${marker}` }).expect(200);
    const first = await getPage(1), second = await getPage(2), third = await getPage(3);
    expect(first.body.items).toHaveLength(6);
    expect(second.body.items).toHaveLength(6);
    expect(third.body.items).toHaveLength(1);
    expect(first.body.total).toBe(13);
    expect(first.body.pageSize).toBe(6);
    const ids = [...first.body.items, ...second.body.items, ...third.body.items].map((user: { id: string }) => user.id);
    expect(new Set(ids).size).toBe(13);
    const again = await getPage(1);
    expect(again.body.items.map((user: { id: string }) => user.id)).toEqual(ids.slice(0, 6));
    const pending = await api().get("/api/v1/users/members").set(auth()).query({ status: "PENDING", search: `Batch ${marker}` }).expect(200);
    expect(pending.body.total).toBe(7);
    expect(pending.body.items.every((user: { status: string }) => user.status === "PENDING")).toBe(true);
    expect(pending.body.counts.PENDING).toBeGreaterThanOrEqual(7);
  });
  it("validates parameters and restricts access to administrators", async () => {
    await api().get("/api/v1/users/members?page=0").set(auth()).expect(400);
    await api().get("/api/v1/users/members?limit=1000").set(auth()).expect(400);
    await api().get("/api/v1/users/members").set({ Authorization: `Bearer ${userToken}` }).expect(403);
    await api().get("/api/v1/users/members").expect(401);
  });
});
