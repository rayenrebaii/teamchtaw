import "reflect-metadata";
import "dotenv/config";
import { INestApplication, UnauthorizedException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { randomUUID } from "node:crypto";
import request from "supertest";
import { io } from "socket.io-client";
import type { AddressInfo } from "node:net";
import { PrismaService } from "../src/prisma/prisma.module";
import { FirebaseIdentity } from "../src/auth/firebase.service";
import { configureApp } from "../src/bootstrap";

describe("Firebase bridge with isolated PostgreSQL, HTTP and Socket.IO", () => {
  let app: INestApplication, db: PrismaService, base: string;
  const uid = randomUUID(), adminUid = randomUUID();
  const email = `firebase-${uid}@integration.test`;
  const adminEmail = `firebase-admin-${adminUid}@integration.test`;
  const idToken = "test-token-" + "a".repeat(110);
  const adminToken = "test-token-" + "b".repeat(110);
  let verified = false, revoked = false;
  const authTime = Math.floor(Date.now() / 1000);
  let accessToken: string, refreshToken: string, userId: string;
  beforeAll(async () => {
    const url = process.env.TEST_DATABASE_URL;
    if (!url || !/^\/chtaw_test_[a-f0-9]{12}$/.test(new URL(url).pathname) || process.env.ISOLATED_TEST_DATABASE !== new URL(url).pathname.slice(1)) throw Error("Fresh isolated test database required.");
    process.env.DATABASE_URL = url;
    const { AppModule } = await import("../src/app.module");
    const module = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(FirebaseIdentity).useValue({
      enabled: true,
      passwordLogin: async () => { throw new UnauthorizedException("Firebase credentials rejected"); },
      verify: async (raw: string) => {
        if (raw === adminToken) return { uid: adminUid, email: adminEmail, auth_time: authTime };
        if (raw !== idToken) throw new UnauthorizedException();
        return { uid, email, auth_time: authTime };
      },
      session: async (boundUid: string, time: number) => {
        if (boundUid === adminUid && time === authTime) return { email: adminEmail, emailVerified: true };
        if (boundUid !== uid || time !== authTime || revoked) throw new UnauthorizedException();
        return { email, emailVerified: verified };
      },
    }).compile();
    app = configureApp(module.createNestApplication({ bodyParser: false, logger: false }));
    await app.listen(0, "127.0.0.1"); db = app.get(PrismaService);
    await db.user.create({ data: { id: adminUid, firebaseUid: adminUid, email: adminEmail, firstName: "Test", lastName: "Admin", passwordHash: "unused-isolated-fixture", role: "ADMIN", status: "APPROVED" } });
    if (!await db.group.findFirst({ where: { isGeneral: true } })) await db.group.create({ data: { name: "Isolated test general group", isGeneral: true } });
    base = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}`;
  });
  afterAll(async () => { await app?.close(); });
  const api = () => request(app.getHttpServer());
  const headers = () => ({ Authorization: `Bearer ${accessToken}` });
  it("registers a pending identity without exposing any password or Firebase UID", async () => {
    const result = await api().post("/api/v1/auth/firebase").send({ idToken, firstName: "Firebase", lastName: "Test" }).expect(200);
    ({ accessToken, refreshToken } = result.body); userId = result.body.user.id;
    expect(result.body.user).toMatchObject({ status: "PENDING", role: "USER", emailVerified: false });
    expect(result.body.user).not.toHaveProperty("passwordHash"); expect(result.body.user).not.toHaveProperty("firebaseUid");
  });
  it("blocks forged role and verification flags", async () => {
    await api().post("/api/v1/auth/firebase").send({ idToken, role: "ADMIN", emailVerified: true }).expect(400);
  });
  it("allows account status but blocks protected data for unverified accounts", async () => {
    await api().get("/api/v1/auth/me").set(headers()).expect(200);
    await api().get("/api/v1/groups").set(headers()).expect(403);
  });
  it("still blocks a verified account pending administrator approval", async () => {
    verified = true;
    const me = await api().get("/api/v1/auth/me").set(headers()).expect(200);
    expect(me.body).toMatchObject({ emailVerified: true, status: "PENDING" });
    await api().get("/api/v1/groups").set(headers()).expect(403);
  });
  it("does not let administrative approval bypass email verification", async () => {
    const admin = await api().post("/api/v1/auth/firebase").send({ idToken: adminToken }).expect(200);
    await api().patch(`/api/v1/approvals/${userId}`).set({ Authorization: `Bearer ${admin.body.accessToken}` }).send({ status: "APPROVED" }).expect(200);
    verified = false;
    await api().get("/api/v1/groups").set(headers()).expect(403);
  });
  it("opens protected endpoints and Socket.IO only after both validations", async () => {
    verified = true;
    await api().get("/api/v1/groups").set(headers()).expect(200);
    const socket = io(`${base}/community`, { auth: { token: accessToken }, transports: ["websocket"], reconnection: false });
    try {
      await new Promise<void>((resolve, reject) => { const timer = setTimeout(() => reject(Error("Socket timeout")), 5000); socket.once("session:ready", () => { clearTimeout(timer); resolve(); }); socket.once("connect_error", (error) => { clearTimeout(timer); reject(error); }); });
    } finally { socket.disconnect(); }
  });
  it("rejects legacy passwords after cutover and protects admin endpoints", async () => {
    await api().post("/api/v1/auth/login").send({ email, password: "old-password-does-not-work" }).expect(401);
    await api().get("/api/v1/users").set(headers()).expect(403);
  });
  it("preserves unmigrated business accounts", async () => {
    const oldId = randomUUID(), oldEmail = `old-${oldId}@integration.test`;
    await db.user.create({ data: { id: oldId, email: oldEmail, firstName: "Old", lastName: "User", passwordHash: "unused-test-fixture", status: "APPROVED" } });
    expect((await db.user.findUniqueOrThrow({ where: { id: oldId } })).firebaseUid).toBeNull();
  });
  it("invalidates existing access and refresh sessions after Firebase revocation", async () => {
    revoked = true;
    await api().get("/api/v1/auth/me").set(headers()).expect(401);
    await api().post("/api/v1/auth/refresh").send({ refreshToken }).expect(401);
    expect((await db.user.findUniqueOrThrow({ where: { id: userId } })).status).toBe("APPROVED");
  });
});
