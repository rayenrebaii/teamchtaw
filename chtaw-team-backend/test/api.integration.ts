import "reflect-metadata";
import "dotenv/config";
import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { io, Socket } from "socket.io-client";
import { AddressInfo } from "node:net";
import { randomUUID } from "node:crypto";
import { rm, mkdtemp } from "node:fs/promises";
import { dirname, basename, resolve, join } from "node:path";
import { execFileSync } from "node:child_process";
import sharp from "sharp";
import { hash } from "argon2";
import { PrismaService } from "../src/prisma/prisma.module";
import { configureApp } from "../src/bootstrap";
import { MEDIA_STORAGE, MediaStorage } from "../src/uploads/storage.module";
import { AuthService } from "../src/auth/auth.service";
interface Session {
  accessToken: string;
  refreshToken: string;
  user: { id: string; email: string; status: string };
}
interface Ack {
  ok: boolean;
  message?: { id: string; text: string };
  error?: { code: string };
}
describe("API réelle PostgreSQL et Socket.IO", () => {
  let app: INestApplication;
  let db: PrismaService;
  let base: string;
  let uploadDir: string;
  let admin: Session;
  let member: Session;
  let pending: Session;
  let generalId: string;
  let privateId: string;
  let secondId: string;
  let pollId: string;
  let optionId: string;
  let photoId: string;
  const password = "Fictional-Integration-Password-123!";
  const clients: Socket[] = [];
  const auth = (session: Session) => ({ Authorization: `Bearer ${session.accessToken}` });
  const api = () => request(app.getHttpServer());
  async function socket(session: Session) {
    const client = io(`${base}/community`, {
      auth: { token: session.accessToken },
      transports: ["websocket"],
      forceNew: true,
      reconnection: false,
    });
    clients.push(client);
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(Error("Socket connection timeout")), 5000);
      client.once("session:ready", () => {
        clearTimeout(timer);
        resolve();
      });
      client.once("connect_error", (error) => {
        clearTimeout(timer);
        reject(error);
      });
    });
    return client;
  }
  const ack = (socket: Socket, event: string, data: unknown) =>
    new Promise<Ack>((resolve, reject) =>
      socket
        .timeout(5000)
        .emit(event, data, (error: Error | null, result: Ack) =>
          error ? reject(error) : resolve(result),
        ),
    );
  beforeAll(async () => {
    const testUrl = process.env.TEST_DATABASE_URL;
    if (!testUrl || !/^\/chtaw_test_[a-f0-9]{12}$/.test(new URL(testUrl).pathname) || process.env.ISOLATED_TEST_DATABASE !== new URL(testUrl).pathname.slice(1))
      throw Error("Run npm run test:isolated to create a fresh test database.");
    process.env.DATABASE_URL = testUrl;
    process.env.NODE_ENV = "test";
    process.env.SWAGGER_ENABLED = "true";
    uploadDir = await mkdtemp(join(process.cwd(), ".test-uploads-"));
    process.env.UPLOAD_DIR = uploadDir;
    const { AppModule } = await import("../src/app.module");
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = configureApp(module.createNestApplication({ bodyParser: false, logger: false }));
    db = app.get(PrismaService);
    // Exact database name is checked above. This test database contains disposable fixtures only.
    await db.$executeRawUnsafe(
      'TRUNCATE TABLE "PollVoteOption", "PollVote", "PollOption", "Message", "Poll", "Media", "GroupMember", "Group", "RefreshSession", "User" CASCADE',
    );
    // Start the real background detector only after disposable fixture preparation.
    await app.listen(0, "127.0.0.1");
    base = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}`;
    const seedEnv = {
      ...process.env,
      SEED_ADMIN_EMAIL: "admin@integration.test",
      SEED_ADMIN_PASSWORD: password,
    };
    execFileSync(process.execPath, ["node_modules/tsx/dist/cli.mjs", "prisma/seed.ts"], {
      env: seedEnv,
      stdio: "pipe",
    });
    const adminUser = await db.user.findUniqueOrThrow({
      where: { email: "admin@integration.test" },
    });
    const general = await db.group.findFirstOrThrow({ where: { isGeneral: true } });
    generalId = general.id;
    admin = (
      await api().post("/api/v1/auth/login").send({ email: adminUser.email, password }).expect(200)
    ).body as Session;
  });
  afterAll(async () => {
    for (const client of clients) client.disconnect();
    if (app) await app.close();
    if (
      uploadDir &&
      dirname(resolve(uploadDir)) === process.cwd() &&
      basename(uploadDir).startsWith(".test-uploads-")
    )
      await rm(uploadDir, { recursive: true, force: true });
  });
  it("publie Swagger et la santé sans exposer de secrets", async () => {
    await api().get("/api/v1/health").expect(200);
    const docs = await api().get("/docs-json").expect(200);
    expect(docs.body.paths["/api/v1/auth/register"]).toBeDefined();
    expect(JSON.stringify(docs.body)).not.toContain("passwordHash");
  });
  it("bloque les requêtes non authentifiées", async () => {
    await api().get("/api/v1/groups").expect(401);
  });
  it("restaure et ferme une session navigateur avec cookie HttpOnly rotatif", async () => {
    const headers = { Origin: "http://127.0.0.1:3001", "X-Session-Transport": "cookie" };
    const login = await api()
      .post("/api/v1/auth/login")
      .set(headers)
      .send({ email: "admin@integration.test", password })
      .expect(200);
    expect(login.body.refreshToken).toBeUndefined();
    const setCookie = login.headers["set-cookie"] as unknown as string[];
    expect(setCookie[0]).toContain("HttpOnly");
    expect(setCookie[0]).toContain("SameSite=Lax");
    expect(setCookie[0]).toContain("Path=/api/v1/auth");
    const cookie = setCookie[0]!.split(";")[0]!;
    await api()
      .post("/api/v1/auth/refresh")
      .set("X-Session-Transport", "cookie")
      .set("Cookie", cookie)
      .send({})
      .expect(403);
    await api()
      .post("/api/v1/auth/refresh")
      .set({ ...headers, Origin: "https://evil.example" })
      .set("Cookie", cookie)
      .send({})
      .expect(403);
    const refreshed = await api()
      .post("/api/v1/auth/refresh")
      .set(headers)
      .set("Cookie", cookie)
      .send({})
      .expect(200);
    expect(refreshed.body.refreshToken).toBeUndefined();
    expect(refreshed.headers["set-cookie"]).not.toEqual(setCookie);
    const rotated = (refreshed.headers["set-cookie"] as unknown as string[])[0]!.split(";")[0]!;
    await api()
      .get("/api/v1/auth/me")
      .set("Authorization", `Bearer ${refreshed.body.accessToken}`)
      .expect(200);
    const logout = await api()
      .post("/api/v1/auth/logout")
      .set(headers)
      .set("Cookie", rotated)
      .set("Authorization", `Bearer ${refreshed.body.accessToken}`)
      .expect(204);
    expect((logout.headers["set-cookie"] as unknown as string[])[0]).toContain(
      "Expires=Thu, 01 Jan 1970",
    );
    await api()
      .post("/api/v1/auth/refresh")
      .set(headers)
      .set("Cookie", rotated)
      .send({})
      .expect(401);
  });
  it("conserve le seed idempotent et ne réinitialise pas le mot de passe admin", async () => {
    const before = await db.user.findUniqueOrThrow({
      where: { id: admin.user.id },
      select: { passwordHash: true },
    });
    execFileSync(process.execPath, ["node_modules/tsx/dist/cli.mjs", "prisma/seed.ts"], {
      env: {
        ...process.env,
        SEED_ADMIN_EMAIL: "admin@integration.test",
        SEED_ADMIN_PASSWORD: password + "different",
      },
      stdio: "pipe",
    });
    const after = await db.user.findUniqueOrThrow({
      where: { id: admin.user.id },
      select: { passwordHash: true },
    });
    expect(after.passwordHash).toBe(before.passwordHash);
    expect(await db.group.count({ where: { isGeneral: true } })).toBe(1);
  });
  it("limite CORS aux origines configurées", async () => {
    const allowed = await api()
      .get("/api/v1/health")
      .set("Origin", "http://localhost:3001")
      .expect(200);
    expect(allowed.headers["access-control-allow-origin"]).toBe("http://localhost:3001");
    const refused = await api()
      .get("/api/v1/health")
      .set("Origin", "https://untrusted.example")
      .expect(200);
    expect(refused.headers["access-control-allow-origin"]).toBeUndefined();
  });
  it("interdit de choisir son rôle ou statut à l’inscription", async () => {
    await api()
      .post("/api/v1/auth/register")
      .send({
        email: "bad@integration.test",
        password,
        firstName: "Bad",
        lastName: "Test",
        role: "ADMIN",
        status: "APPROVED",
      })
      .expect(400);
  });
  it("inscrit un compte en attente sans renvoyer son hash", async () => {
    const res = await api()
      .post("/api/v1/auth/register")
      .send({ email: " MEMBER@integration.test ", password, firstName: "Member", lastName: "Test" })
      .expect(201);
    expect(res.body.status).toBe("PENDING");
    expect(res.body.passwordHash).toBeUndefined();
    member = (
      await api()
        .post("/api/v1/auth/login")
        .send({ email: "member@integration.test", password })
        .expect(200)
    ).body as Session;
  });
  it("permet de consulter le statut, mais interdit les conversations en attente", async () => {
    await api().get("/api/v1/auth/me").set(auth(member)).expect(200);
    await api().get("/api/v1/groups").set(auth(member)).expect(403);
    await api()
      .post(`/api/v1/groups/${generalId}/messages`)
      .set(auth(member))
      .send({ text: "Forbidden" })
      .expect(403);
  });
  it("approuve le membre et l’ajoute automatiquement au général", async () => {
    const client = await socket(member);
    const reviewed = new Promise<{ status: string }>((resolve) =>
      client.once("user:reviewed", resolve),
    );
    await api()
      .patch(`/api/v1/approvals/${member.user.id}`)
      .set(auth(admin))
      .send({ status: "APPROVED" })
      .expect(200);
    expect((await reviewed).status).toBe("APPROVED");
    expect((await ack(client, "group:join", { groupId: generalId })).ok).toBe(true);
    const groups = await api().get("/api/v1/groups").set(auth(member)).expect(200);
    expect(groups.body).toHaveLength(1);
    expect(groups.body[0].id).toBe(generalId);
    await api()
      .patch(`/api/v1/approvals/${member.user.id}`)
      .set(auth(admin))
      .send({ status: "APPROVED" })
      .expect(409);
  });
  it("ne laisse pas un membre approuver les comptes", async () => {
    await api().get("/api/v1/approvals").set(auth(member)).expect(403);
  });
  it("refuse de promouvoir un compte public via le seed", async () => {
    expect(() =>
      execFileSync(process.execPath, ["node_modules/tsx/dist/cli.mjs", "prisma/seed.ts"], {
        env: {
          ...process.env,
          SEED_ADMIN_EMAIL: "member@integration.test",
          SEED_ADMIN_PASSWORD: password,
        },
        stdio: "pipe",
      }),
    ).toThrow();
    expect((await db.user.findUniqueOrThrow({ where: { id: member.user.id } })).role).toBe("USER");
  });
  it("sérialise deux validations concurrentes sans double affectation", async () => {
    const user = await api()
      .post("/api/v1/auth/register")
      .send({
        email: "concurrent@integration.test",
        password,
        firstName: "Concurrent",
        lastName: "Test",
      })
      .expect(201);
    const results = await Promise.all(
      [1, 2].map(() =>
        api()
          .patch(`/api/v1/approvals/${user.body.id}`)
          .set(auth(admin))
          .send({ status: "APPROVED" }),
      ),
    );
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(
      await db.groupMember.count({ where: { groupId: generalId, userId: user.body.id as string } }),
    ).toBe(1);
  });
  it("réserve les statistiques du dashboard à l’admin", async () => {
    await api().get("/api/v1/admin/stats").set(auth(member)).expect(403);
    const stats = await api().get("/api/v1/admin/stats").set(auth(admin)).expect(200);
    expect(stats.body.totalUsers).toBe(await db.user.count());
    expect(stats.body.groups).toBe(await db.group.count());
  });
  it("réserve la création de groupes à l’admin et protège le général", async () => {
    await api().post("/api/v1/groups").set(auth(member)).send({ name: "Forbidden" }).expect(403);
    await api().delete(`/api/v1/groups/${generalId}`).set(auth(admin)).expect(403);
    await api()
      .delete(`/api/v1/groups/${generalId}/members/${admin.user.id}`)
      .set(auth(admin))
      .expect(403);
    privateId = (
      await api().post("/api/v1/groups").set(auth(admin)).send({ name: "Running Club" }).expect(201)
    ).body.id as string;
    secondId = (
      await api()
        .post("/api/v1/groups")
        .set(auth(admin))
        .send({ name: "Training Squad" })
        .expect(201)
    ).body.id as string;
  });
  it("cache les groupes privés et refuse leur historique aux non-membres", async () => {
    expect((await api().get("/api/v1/groups").set(auth(member)).expect(200)).body).toHaveLength(1);
    await api().get(`/api/v1/groups/${privateId}/messages`).set(auth(member)).expect(403);
  });
  it("affecte un membre sans doublon", async () => {
    await api()
      .put(`/api/v1/groups/${privateId}/members/${member.user.id}`)
      .set(auth(admin))
      .expect(200);
    await api()
      .put(`/api/v1/groups/${privateId}/members/${member.user.id}`)
      .set(auth(admin))
      .expect(200);
    expect(
      await db.groupMember.count({ where: { groupId: privateId, userId: member.user.id } }),
    ).toBe(1);
    // A new HTTP read represents reloading the page: membership comes from PostgreSQL.
    const reloaded = await api().get("/api/v1/groups").set(auth(admin)).expect(200);
    expect(reloaded.body.find((g: { id: string }) => g.id === privateId).memberIds).toContain(
      member.user.id,
    );
  });
  it("refuse une affectation sans autorisation ou vers un groupe inexistant", async () => {
    const waiting = await api()
      .post("/api/v1/auth/register")
      .send({
        email: "assignment-pending@integration.test",
        password,
        firstName: "Waiting",
        lastName: "Assignment",
      })
      .expect(201);
    await api().put(`/api/v1/groups/${privateId}/members/${member.user.id}`).expect(401);
    await api()
      .put(`/api/v1/groups/${privateId}/members/${member.user.id}`)
      .set(auth(member))
      .expect(403);
    await api()
      .put(`/api/v1/groups/${randomUUID()}/members/${member.user.id}`)
      .set(auth(admin))
      .expect(404);
    await api()
      .put(`/api/v1/groups/${privateId}/members/${waiting.body.id}`)
      .set(auth(admin))
      .expect(409);
  });
  it("envoie des messages et pagine l’historique par curseur", async () => {
    for (const text of ["Premier", "Deuxième", "Troisième"])
      await api()
        .post(`/api/v1/groups/${privateId}/messages`)
        .set(auth(member))
        .send({ text })
        .expect(201);
    const page = await api()
      .get(`/api/v1/groups/${privateId}/messages?limit=2`)
      .set(auth(member))
      .expect(200);
    expect(page.body.items).toHaveLength(2);
    expect(page.body.nextCursor).toBeTruthy();
    const next = await api()
      .get(`/api/v1/groups/${privateId}/messages?limit=2&cursor=${page.body.nextCursor}`)
      .set(auth(member))
      .expect(200);
    expect(next.body.items).toHaveLength(1);
    expect(next.body.items[0].text).toBe("Premier");
  });
  it("interdit les expéditeurs injectés et les messages vides", async () => {
    await api()
      .post(`/api/v1/groups/${privateId}/messages`)
      .set(auth(member))
      .send({ text: "Hello", authorId: admin.user.id })
      .expect(400);
    await api()
      .post(`/api/v1/groups/${privateId}/messages`)
      .set(auth(member))
      .send({ text: "  " })
      .expect(400);
  });
  it("réserve les sondages à l’admin", async () => {
    await api()
      .post(`/api/v1/groups/${privateId}/polls`)
      .set(auth(member))
      .send({ question: "Quand ?", options: ["Oui", "Non"], singleChoice: true })
      .expect(403);
    const res = await api()
      .post(`/api/v1/groups/${privateId}/polls`)
      .set(auth(admin))
      .send({ question: "Quelle séance ?", options: ["Samedi", "Dimanche"], singleChoice: true })
      .expect(201);
    pollId = res.body.id as string;
    optionId = res.body.options[0].id as string;
  });
  it("empêche deux votes simultanés pour le même utilisateur", async () => {
    const results = await Promise.all(
      [1, 2].map(() =>
        api()
          .post(`/api/v1/polls/${pollId}/votes`)
          .set(auth(member))
          .send({ optionIds: [optionId] }),
      ),
    );
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(await db.pollVote.count({ where: { pollId, userId: member.user.id } })).toBe(1);
  });
  it("refuse les choix inconnus ou multiples sur un sondage simple", async () => {
    await api()
      .post(`/api/v1/polls/${pollId}/votes`)
      .set(auth(admin))
      .send({ optionIds: [randomUUID()] })
      .expect(400);
    const poll = await db.poll.findUniqueOrThrow({
      where: { id: pollId },
      include: { options: true },
    });
    await api()
      .post(`/api/v1/polls/${pollId}/votes`)
      .set(auth(admin))
      .send({ optionIds: poll.options.map((o) => o.id) })
      .expect(400);
  });
  it("accepte plusieurs choix dans une seule participation puis bloque le revote", async () => {
    const poll = (
      await api()
        .post(`/api/v1/groups/${privateId}/polls`)
        .set(auth(admin))
        .send({ question: "Quels jours ?", options: ["Samedi", "Dimanche"], singleChoice: false })
        .expect(201)
    ).body;
    const ids = (poll.options as { id: string }[]).map((o) => o.id);
    await api()
      .post(`/api/v1/polls/${poll.id}/votes`)
      .set(auth(member))
      .send({ optionIds: ids })
      .expect(201);
    await api()
      .post(`/api/v1/polls/${poll.id}/votes`)
      .set(auth(member))
      .send({ optionIds: ids })
      .expect(409);
  });
  it("refuse les votes après clôture", async () => {
    await db.poll.update({ where: { id: pollId }, data: { endsAt: new Date("2020-01-01") } });
    await api()
      .post(`/api/v1/polls/${pollId}/votes`)
      .set(auth(admin))
      .send({ optionIds: [optionId] })
      .expect(409);
  });
  it("refuse les faux fichiers image, même déclarés PNG", async () => {
    await api()
      .post(`/api/v1/groups/${privateId}/photos`)
      .set(auth(admin))
      .attach("file", Buffer.from("not an image"), {
        filename: "fake.png",
        contentType: "image/png",
      })
      .expect(400);
  });
  it("réserve les photos à l’admin et protège leur téléchargement", async () => {
    const png = await sharp({
      create: { width: 12, height: 12, channels: 3, background: "#aabbcc" },
    })
      .png()
      .toBuffer();
    await api()
      .post(`/api/v1/groups/${privateId}/photos`)
      .set(auth(member))
      .attach("file", png, "image.png")
      .expect(403);
    const photo = await api()
      .post(`/api/v1/groups/${privateId}/photos`)
      .set(auth(admin))
      .field("caption", "La team")
      .attach("file", png, "image.png")
      .expect(201);
    photoId = (photo.body.photoUrl as string).split("/").at(-1)!;
    await api().get(`/api/v1/uploads/${photoId}`).expect(401);
    const image = await api().get(`/api/v1/uploads/${photoId}`).set(auth(member)).expect(200);
    expect(image.headers["content-type"]).toContain("image/webp");
    expect(image.headers["cache-control"]).toBe("private, no-store");
  });
  it("authentifie Socket.IO et refuse de rejoindre un groupe étranger", async () => {
    const client = await socket(member);
    expect((await ack(client, "group:join", { groupId: secondId })).ok).toBe(false);
    expect((await ack(client, "group:join", { groupId: privateId })).ok).toBe(true);
    const received = new Promise<{ text: string }>((resolve) =>
      client.once("message:created", resolve),
    );
    const sent = await ack(client, "message:send", { groupId: privateId, text: "Temps réel" });
    expect(sent.ok).toBe(true);
    expect((await received).text).toBe("Temps réel");
  });
  it("déconnecte une socket munie d’un token invalide", async () => {
    const client = io(`${base}/community`, {
      auth: { token: "invalid-token" },
      transports: ["websocket"],
      forceNew: true,
      reconnection: false,
    });
    clients.push(client);
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(Error("Invalid socket was not disconnected")), 5000);
      client.once("disconnect", () => {
        clearTimeout(timer);
        resolve();
      });
      client.once("connect_error", () => {
        clearTimeout(timer);
        resolve();
      });
    });
    expect(client.connected).toBe(false);
  });
  it("retire immédiatement l’accès HTTP et WebSocket après retrait du groupe", async () => {
    const client = await socket(member);
    expect((await ack(client, "group:join", { groupId: privateId })).ok).toBe(true);
    const removed = new Promise((resolve) => client.once("group:member-removed", resolve));
    await api()
      .delete(`/api/v1/groups/${privateId}/members/${member.user.id}`)
      .set(auth(admin))
      .expect(200);
    await removed;
    await api().get(`/api/v1/uploads/${photoId}`).set(auth(member)).expect(403);
    await api().get(`/api/v1/groups/${privateId}/messages`).set(auth(member)).expect(403);
    expect((await ack(client, "message:send", { groupId: privateId, text: "Refusé" })).ok).toBe(
      false,
    );
    let leaked = false;
    client.once("message:created", () => {
      leaked = true;
    });
    await api()
      .post(`/api/v1/groups/${privateId}/messages`)
      .set(auth(admin))
      .send({ text: "Privé" })
      .expect(201);
    expect(leaked).toBe(false);
  });
  it("déplace un membre entre deux groupes dans une transaction", async () => {
    await api()
      .put(`/api/v1/groups/${privateId}/members/${member.user.id}`)
      .set(auth(admin))
      .expect(200);
    await api()
      .post(`/api/v1/groups/members/${member.user.id}/move`)
      .set(auth(admin))
      .send({ fromGroupId: privateId, toGroupId: secondId })
      .expect(201);
    expect(
      await db.groupMember.count({ where: { groupId: privateId, userId: member.user.id } }),
    ).toBe(0);
    expect(
      await db.groupMember.count({ where: { groupId: secondId, userId: member.user.id } }),
    ).toBe(1);
  });
  it("fait tourner le refresh token et révoque la session si l’ancien est rejoué", async () => {
    const session = (
      await api()
        .post("/api/v1/auth/login")
        .send({ email: "member@integration.test", password })
        .expect(200)
    ).body as Session;
    const rotated = await api()
      .post("/api/v1/auth/refresh")
      .send({ refreshToken: session.refreshToken })
      .expect(200);
    expect(rotated.body.refreshToken).not.toBe(session.refreshToken);
    await api()
      .post("/api/v1/auth/refresh")
      .send({ refreshToken: session.refreshToken })
      .expect(401);
    await api()
      .get("/api/v1/auth/me")
      .set({ Authorization: `Bearer ${rotated.body.accessToken}` })
      .expect(401);
  });
  it("liste les membres et protège les affectations automatiques du général", async () => {
    const before = await db.user.findUniqueOrThrow({ where: { id: member.user.id } });
    const details = await api().get(`/api/v1/groups/${generalId}`).set(auth(admin)).expect(200);
    expect(details.body.members).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: member.user.id, role: "USER" }),
        expect.objectContaining({ id: admin.user.id, role: "ADMIN" }),
      ]),
    );
    await api()
      .delete(`/api/v1/groups/${generalId}/members/${admin.user.id}`)
      .set(auth(admin))
      .expect(403);
    await api()
      .delete(`/api/v1/groups/${generalId}/members/${member.user.id}`)
      .set(auth(member))
      .expect(403);
    await api()
      .delete(`/api/v1/groups/${generalId}/members/${member.user.id}`)
      .set(auth(admin))
      .expect(403);
    const updated = await api().get(`/api/v1/groups/${generalId}`).set(auth(admin)).expect(200);
    expect(updated.body.memberIds).toContain(member.user.id);
    expect(updated.body.memberIds).toContain(admin.user.id);
    expect(await db.user.findUniqueOrThrow({ where: { id: member.user.id } })).toEqual(before);
    await api().get(`/api/v1/groups/${generalId}`).set(auth(member)).expect(200);
    await api().get(`/api/v1/groups/${generalId}/messages`).set(auth(member)).expect(200);
  });
  it("révoque l’access token et ferme les sockets lors du logout", async () => {
    const client = await socket(member);
    const disconnected = new Promise((resolve) => client.once("disconnect", resolve));
    await api().post("/api/v1/auth/logout").set(auth(member)).expect(204);
    await disconnected;
    await api().get("/api/v1/auth/me").set(auth(member)).expect(401);
  });
  it("refuse une inscription et garde la messagerie inaccessible", async () => {
    const user = await api()
      .post("/api/v1/auth/register")
      .send({ email: "pending@integration.test", password, firstName: "Pending", lastName: "Test" })
      .expect(201);
    pending = (
      await api()
        .post("/api/v1/auth/login")
        .send({ email: "pending@integration.test", password })
        .expect(200)
    ).body as Session;
    await api()
      .patch(`/api/v1/approvals/${user.body.id}`)
      .set(auth(admin))
      .send({ status: "REJECTED" })
      .expect(200);
    expect((await api().get("/api/v1/auth/me").set(auth(pending)).expect(200)).body.status).toBe(
      "REJECTED",
    );
    await api().get("/api/v1/groups").set(auth(pending)).expect(403);
  });
  it("supprime un groupe privé avec ses messages et médias", async () => {
    await api().delete(`/api/v1/groups/${privateId}`).set(auth(admin)).expect(204);
    expect(await db.media.count({ where: { groupId: privateId } })).toBe(0);
    expect(await db.message.count({ where: { groupId: privateId } })).toBe(0);
  });
  it("supprime un membre approuvé, ses dépendances et toutes ses sessions sans supprimer les groupes", async () => {
    const target = await db.user.create({ data: {
      email: "ban-target@integration.test", passwordHash: await hash(password),
      firstName: "Ban", lastName: "Target", status: "PENDING",
    } });
    await api().delete(`/api/v1/users/${target.id}`).expect(401);
    await api().delete(`/api/v1/users/${target.id}`).set(auth(admin)).expect(409);
    await api().delete(`/api/v1/users/${admin.user.id}`).set(auth(admin)).expect(403);
    await api().delete(`/api/v1/users/${randomUUID()}`).set(auth(admin)).expect(404);
    await api().patch(`/api/v1/approvals/${target.id}`).set(auth(admin)).send({ status: "APPROVED" }).expect(200);
    await db.groupMember.create({ data: { userId: target.id, groupId: secondId } });
    // Create fixture sessions through the real service without consuming the shared HTTP login quota.
    const login = () => app.get(AuthService).login({ email: target.email, password });
    const first = await login(), second = await login();
    await api().delete(`/api/v1/users/${admin.user.id}`).set(auth(first)).expect(403);
    const connected = await socket(first);
    const disconnected = new Promise((resolve) => connected.once("disconnect", resolve));
    const message = await api().post(`/api/v1/groups/${generalId}/messages`).set(auth(first))
      .send({ text: "Disposable member message" }).expect(201);
    const session = await db.poll.create({ data: {
      groupId: generalId, authorId: admin.user.id, question: "Retained session", type: "SESSION",
      options: { create: { label: "Session", position: 0 } },
      participants: { create: [{ userId: target.id }, { userId: admin.user.id }] },
    }, include: { options: true } });
    const optionId = session.options[0]!.id;
    await db.sessionMark.create({ data: { pollId: session.id, userId: target.id, optionId } });
    await db.sessionAttendanceEdit.create({ data: {
      pollId: session.id, userId: target.id, actorId: admin.user.id,
      action: "MARK", before: "NON_VERIFIE", after: "PRESENT", version: 1,
    } });
    const vote = await db.pollVote.create({ data: {
      userId: target.id, pollId: session.id, options: { create: { optionId } },
    } });
    await db.attendanceEdit.create({ data: {
      voteId: vote.id, optionId, actorId: admin.user.id, before: "NON_VERIFIE", after: "PRESENT", version: 1,
    } });
    const storageKey = `${randomUUID()}.webp`;
    await app.get<MediaStorage>(MEDIA_STORAGE).put(storageKey, Buffer.from("disposable media"));
    const media = await db.media.create({ data: {
      groupId: secondId, uploaderId: target.id, storageKey, mimeType: "image/webp", size: 16, width: 1, height: 1,
    } });
    await db.group.update({ where: { id: secondId }, data: { imageMediaId: media.id } });
    // Historical authored polls also have to be removable despite restrictive foreign keys.
    const ownPoll = await db.poll.create({ data: {
      groupId: generalId, authorId: target.id, question: "Disposable authored session", type: "SESSION",
      participants: { create: { userId: admin.user.id } },
    } });
    await api().delete(`/api/v1/users/${target.id}`).set(auth(admin)).expect(204);
    await disconnected;
    expect(await db.user.findUnique({ where: { id: target.id } })).toBeNull();
    expect(await db.groupMember.count({ where: { userId: target.id } })).toBe(0);
    expect(await db.refreshSession.count({ where: { userId: target.id } })).toBe(0);
    expect(await db.message.findUnique({ where: { id: message.body.id } })).toBeNull();
    expect(await db.media.findUnique({ where: { id: media.id } })).toBeNull();
    await expect(app.get<MediaStorage>(MEDIA_STORAGE).open(storageKey)).rejects.toThrow();
    expect(await db.poll.findUnique({ where: { id: ownPoll.id } })).toBeNull();
    expect(await db.poll.findUnique({ where: { id: session.id } })).not.toBeNull();
    expect(await db.sessionParticipant.count({ where: { pollId: session.id, userId: admin.user.id } })).toBe(1);
    expect(await db.group.findUniqueOrThrow({ where: { id: secondId } })).toMatchObject({ imageMediaId: null });
    expect(await db.groupMember.count({ where: { userId: admin.user.id, groupId: generalId } })).toBe(1);
    for (const credentials of [first, second]) {
      await api().get("/api/v1/auth/me").set(auth(credentials)).expect(401);
      await api().post("/api/v1/auth/refresh").send({ refreshToken: credentials.refreshToken }).expect(401);
    }
    await expect(login()).rejects.toThrow();
  });
  it("limite les tentatives de connexion échouées", async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 6; i++)
      statuses.push(
        (
          await api()
            .post("/api/v1/auth/login")
            .send({ email: "unknown@integration.test", password })
        ).status,
      );
    expect(statuses).toContain(429);
  });
});
