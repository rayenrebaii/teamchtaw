import "reflect-metadata";
import "dotenv/config";
import { Test } from "@nestjs/testing";
import { INestApplication } from "@nestjs/common";
import { initializeApp, deleteApp, type App } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import request from "supertest";
import { randomUUID } from "node:crypto";
import { PrismaService } from "../src/prisma/prisma.module";
import { configureApp } from "../src/bootstrap";
import { ThrottlerStorage, ThrottlerStorageService } from "@nestjs/throttler";
import { FirebaseIdentity } from "../src/auth/firebase.service";
import { FirebaseAccountDeletionService } from "../src/users/firebase-account-deletion.service";

describe("Invitation native Firebase sans Resend : HTTP, codes réels et PostgreSQL isolé", () => {
  let app: INestApplication, db: PrismaService, firebase: App;
  let admin: string, collaborator: string, userId: string, nonce: string, code: string, freshIdToken: string;
  const project = "demo-chtaw-collaborator";
  const host = "127.0.0.1:9099";
  const email = `collaborator-${randomUUID()}@emulator.invalid`;
  const password = "Firebase-Emulator-Password-2026!";
  let limiter = new ThrottlerStorageService();
  const api = () => request(app.getHttpServer());
  const headers = (token = admin) => ({ Authorization: `Bearer ${token}` });
  async function rpc(action: string, body: object) {
    return fetch(`http://${host}/identitytoolkit.googleapis.com/v1/accounts:${action}?key=emulator-only`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
  }
  const signIn = async (address = email, secret = password) => {
    const response = await rpc("signInWithPassword", { email: address, password: secret, returnSecureToken: true });
    if (!response.ok) throw Error("Emulator sign-in failed");
    return (await response.json() as { idToken: string }).idToken;
  };
  async function lastEmail(address = email) {
    const response = await fetch(`http://${host}/emulator/v1/projects/${project}/oobCodes`);
    const data = await response.json() as { oobCodes: { email: string; oobLink: string; oobCode: string; requestType: string }[] };
    return data.oobCodes.filter((item) => item.email === address).at(-1)!;
  }
  beforeAll(async () => {
    const url = process.env.TEST_DATABASE_URL;
    if (!url || !/^\/chtaw_test_[a-f0-9]{12}$/.test(new URL(url).pathname) || process.env.ISOLATED_TEST_DATABASE !== new URL(url).pathname.slice(1)) throw Error("Isolated local database required");
    if (process.env.FIREBASE_AUTH_EMULATOR_HOST !== host) throw Error("Local Firebase emulator is required; never use production");
    process.env.AUTH_PROVIDER = "firebase"; process.env.NODE_ENV = "test"; process.env.DATABASE_URL = url;
    process.env.FIREBASE_PROJECT_ID = project; process.env.FIREBASE_WEB_API_KEY = "emulator-only";
    process.env.FIREBASE_CLIENT_EMAIL = "emulator@example.invalid"; process.env.FIREBASE_PRIVATE_KEY = "unused-emulator-credential";
    process.env.ACCOUNT_ACTION_ORIGIN = "http://127.0.0.1:3001";
    delete process.env.RESEND_API_KEY; delete process.env.ACCOUNT_EMAIL_FROM;
    firebase = initializeApp({ projectId: project }, "chtaw-auth");
    const { AppModule } = await import("../src/app.module");
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(ThrottlerStorage).useValue({ increment: (...args: Parameters<ThrottlerStorageService["increment"]>) => limiter.increment(...args) }).compile();
    app = configureApp(module.createNestApplication({ bodyParser: false, logger: false })); await app.init(); db = app.get(PrismaService);
    if (!await db.group.findFirst({ where: { isGeneral: true } }))
      await db.group.create({ data: { name: "Disposable emulator general group", isGeneral: true } });
    const adminEmail = `admin-${randomUUID()}@emulator.invalid`;
    const identity = await getAuth(firebase).createUser({ email: adminEmail, password, emailVerified: true });
    await db.user.create({ data: { firebaseUid: identity.uid, email: adminEmail, passwordHash: "unused-emulator-password", firstName: "Admin", lastName: "Emulator", role: "ADMIN", status: "APPROVED", emailVerified: true } });
    admin = (await api().post("/api/v1/auth/firebase").send({ idToken: await signIn(adminEmail) }).expect(200)).body.accessToken;
  });
  beforeEach(() => { limiter.onApplicationShutdown(); limiter = new ThrottlerStorageService(); });
  afterAll(async () => { limiter.onApplicationShutdown(); await app?.close(); if (firebase) await deleteApp(firebase); });
  it("crée exclusivement par l’admin un compte sans mot de passe et émet un e-mail Firebase natif", async () => {
    const created = (await api().post("/api/v1/admin/collaborators").set(headers()).send({ email, firstName: "Collab", lastName: "Emulator" }).expect(201)).body;
    userId = created.user.id;
    expect(created.invitation).toMatchObject({ sent: true, provider: "firebase" }); expect(created.user.status).toBe("PENDING");
    expect((await rpc("signInWithPassword", { email, password, returnSecureToken: true })).ok).toBe(false);
    const message = await lastEmail(); expect(message.requestType).toBe("PASSWORD_RESET"); code = message.oobCode;
    const continuation = new URL(new URL(message.oobLink).searchParams.get("continueUrl")!);
    expect(continuation.origin).toBe("http://127.0.0.1:3001"); expect(continuation.pathname).toBe("/account-action");
    nonce = continuation.hash.slice(1); expect(nonce).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(created).not.toHaveProperty("password"); expect(created).not.toHaveProperty("token");
  });
  it("définit le premier mot de passe via le code Firebase et bloque l’accès tant que l’invitation n’est pas activée", async () => {
    expect((await rpc("resetPassword", { oobCode: code, newPassword: password })).ok).toBe(true);
    freshIdToken = await signIn();
    await api().post("/api/v1/auth/firebase").send({ idToken: freshIdToken }).expect(401);
    const wrongIdentity = await getAuth(firebase).createUser({ email: `wrong-${randomUUID()}@emulator.invalid`, password, emailVerified: true });
    await api().post("/api/v1/auth/account-links/activate-firebase").send({ token: nonce, idToken: await signIn(wrongIdentity.email!) }).expect(400);
    expect((await db.user.findUniqueOrThrow({ where: { id: userId } })).activatedAt).toBeNull();
    await api().post("/api/v1/auth/account-links/redeem").send({ token: nonce, password }).expect(400);
  });
  it("active le rôle préattribué avec la bonne identité, interdit le rejeu et permet la connexion", async () => {
    await api().post("/api/v1/auth/account-links/activate-firebase").send({ token: nonce, idToken: freshIdToken }).expect(201);
    await api().post("/api/v1/auth/account-links/activate-firebase").send({ token: nonce, idToken: freshIdToken }).expect(400);
    expect((await rpc("resetPassword", { oobCode: code, newPassword: password + "Again" })).ok).toBe(false);
    const login = (await api().post("/api/v1/auth/firebase").send({ idToken: await signIn() }).expect(200)).body;
    collaborator = login.accessToken; expect(login.user).toMatchObject({ role: "COLLABORATOR", status: "APPROVED", emailVerified: true });
    await api().get("/api/v1/groups").set(headers(collaborator)).expect(200);
    await api().post("/api/v1/admin/collaborators").set(headers(collaborator)).send({ email: "forbidden@emulator.invalid", firstName: "Test", lastName: "Test" }).expect(403);
    await api().post("/api/v1/auth/firebase").send({ idToken: await signIn(), role: "COLLABORATOR" }).expect(400);
  });
  it("réinitialise via Firebase sans Resend, révoque l’ancienne session et conserve le rôle", async () => {
    await new Promise(resolve => setTimeout(resolve, 1200));
    await api().post(`/api/v1/admin/collaborators/${userId}/reset-password`).set(headers()).expect(201);
    const message = await lastEmail(); expect(new URL(message.oobLink).searchParams.get("continueUrl")).toBe("http://127.0.0.1:3001/login");
    const nextPassword = password + "Changed";
    expect((await rpc("resetPassword", { oobCode: message.oobCode, newPassword: nextPassword })).ok).toBe(true);
    await api().get("/api/v1/auth/me").set(headers(collaborator)).expect(401);
    const login = (await api().post("/api/v1/auth/firebase").send({ idToken: await signIn(email, nextPassword) }).expect(200)).body;
    expect(login.user.role).toBe("COLLABORATOR");
  });
  it("activates an administration agent via Firebase and preserves the principal when removing access", async () => {
    const address = `agent-${randomUUID()}@emulator.invalid`;
    const created = (await api().post("/api/v1/admin/administrators").set(headers()).send({ email: address, firstName: "Agent", lastName: "Emulator" }).expect(201)).body;
    expect(created.user).toMatchObject({ role: "ADMIN", isInvitedAdmin: true, status: "PENDING" });
    expect(created.invitation).toMatchObject({ sent: true, provider: "firebase" });
    const message = await lastEmail(address);
    const agentNonce = new URL(new URL(message.oobLink).searchParams.get("continueUrl")!).hash.slice(1);
    expect((await rpc("resetPassword", { oobCode: message.oobCode, newPassword: password })).ok).toBe(true);
    const identityToken = await signIn(address);
    await api().post("/api/v1/auth/firebase").send({ idToken: identityToken }).expect(401);
    await api().post("/api/v1/auth/account-links/activate-firebase").send({ token: agentNonce, idToken: identityToken }).expect(201);
    const login = (await api().post("/api/v1/auth/firebase").send({ idToken: await signIn(address) }).expect(200)).body;
    expect(login.user).toMatchObject({ role: "ADMIN", isInvitedAdmin: true, principalAdminId: created.user.principalAdminId, status: "APPROVED" });
    await api().get("/api/v1/admin/analytics").set(headers(login.accessToken)).expect(200);
    await api().delete(`/api/v1/users/${created.user.principalAdminId}`).set(headers(login.accessToken)).expect(403);
    const linkedAgent = await db.user.findUniqueOrThrow({ where: { id: created.user.id }, select: { firebaseUid: true } });
    await api().delete(`/api/v1/users/${created.user.id}`).set(headers()).expect(204);
    await api().get("/api/v1/auth/me").set(headers(login.accessToken)).expect(401);
    await expect(getAuth(firebase).getUser(linkedAgent.firebaseUid!)).rejects.toMatchObject({ code: "auth/user-not-found" });
    await api().post("/api/v1/auth/firebase").send({ idToken: identityToken }).expect(401);
    expect((await rpc("signInWithPassword", { email: address, password, returnSecureToken: true })).ok).toBe(false);
    expect(await db.user.findUnique({ where: { id: created.user.id } })).toMatchObject({ disabledAt: expect.any(Date) });
  });
  it("supprime aussi le compte Firebase d’un étudiant et d’un collaborateur", async () => {
    const address = `deleted-student-${randomUUID()}@emulator.invalid`;
    const identity = await getAuth(firebase).createUser({ email: address, password, emailVerified: true });
    const token = await signIn(address);
    const registered = await api().post("/api/v1/auth/firebase").send({ idToken: token, firstName: "Deleted", lastName: "Student", phone: "+21620123456", proposedEstablishmentName: "Disposable emulator school" }).expect(200);
    await api().patch(`/api/v1/approvals/${registered.body.user.id}`).set(headers()).send({ status: "APPROVED" }).expect(200);
    await api().delete(`/api/v1/users/${registered.body.user.id}`).set(headers()).expect(204);
    expect(await db.user.findUnique({ where: { id: registered.body.user.id } })).toBeNull();
    await expect(getAuth(firebase).getUser(identity.uid)).rejects.toMatchObject({ code: "auth/user-not-found" });
    expect(await db.firebaseAccountDeletion.findUnique({ where: { firebaseUid: identity.uid } })).toMatchObject({ completedAt: expect.any(Date) });
    await api().post("/api/v1/auth/firebase").send({ idToken: token, firstName: "Deleted", lastName: "Student", phone: "+21620123456", proposedEstablishmentName: "Disposable emulator school" }).expect(401);
    const collaborator = await api().post("/api/v1/admin/collaborators").set(headers()).send({ email: `deleted-coach-${randomUUID()}@emulator.invalid`, firstName: "Deleted", lastName: "Coach" }).expect(201);
    const linkedCollaborator = await db.user.findUniqueOrThrow({ where: { id: collaborator.body.user.id }, select: { firebaseUid: true } });
    await api().delete(`/api/v1/users/${collaborator.body.user.id}`).set(headers()).expect(204);
    expect(await db.user.findUnique({ where: { id: collaborator.body.user.id } })).toBeNull();
    await expect(getAuth(firebase).getUser(linkedCollaborator.firebaseUid!)).rejects.toMatchObject({ code: "auth/user-not-found" });
  });
  it("reprend une suppression Firebase après une panne avec un nouveau worker et bloque la réinscription entre-temps", async () => {
    const address = `retry-student-${randomUUID()}@emulator.invalid`;
    const identity = await getAuth(firebase).createUser({ email: address, password, emailVerified: true });
    const token = await signIn(address);
    const registration = { idToken: token, firstName: "Retry", lastName: "Student", phone: "+21620123456", proposedEstablishmentName: "Disposable emulator school" };
    const registered = await api().post("/api/v1/auth/firebase").send(registration).expect(200);
    await api().patch(`/api/v1/approvals/${registered.body.user.id}`).set(headers()).send({ status: "APPROVED" }).expect(200);
    const provider = app.get(FirebaseIdentity);
    const unavailable = jest.spyOn(provider, "deleteAccount").mockRejectedValueOnce(new Error("Simulated emulator outage"));
    try { await api().delete(`/api/v1/users/${registered.body.user.id}`).set(headers()).expect(204); }
    finally { unavailable.mockRestore(); }
    expect(await db.user.findUnique({ where: { id: registered.body.user.id } })).toBeNull();
    expect(await getAuth(firebase).getUser(identity.uid)).toMatchObject({ uid: identity.uid });
    expect(await db.firebaseAccountDeletion.findUnique({ where: { firebaseUid: identity.uid } })).toMatchObject({ completedAt: null });
    await api().post("/api/v1/auth/firebase").send(registration).expect(401);
    // Advance only this disposable job's retry date; a fresh worker has no in-memory history.
    await db.firebaseAccountDeletion.update({ where: { firebaseUid: identity.uid }, data: { nextAttemptAt: new Date(0) } });
    await new FirebaseAccountDeletionService(db, provider).drain();
    await expect(getAuth(firebase).getUser(identity.uid)).rejects.toMatchObject({ code: "auth/user-not-found" });
    expect(await db.firebaseAccountDeletion.findUnique({ where: { firebaseUid: identity.uid } })).toMatchObject({ completedAt: expect.any(Date), attempts: 2 });
  });
  it("refuse une invitation expirée et un compte désactivé, sans ouvrir de session", async () => {
    const address = `expired-${randomUUID()}@emulator.invalid`;
    const created = (await api().post("/api/v1/admin/collaborators").set(headers()).send({ email: address, firstName: "Expired", lastName: "Emulator" }).expect(201)).body;
    const message = await lastEmail(address);
    const expiredNonce = new URL(new URL(message.oobLink).searchParams.get("continueUrl")!).hash.slice(1);
    await db.accountLink.updateMany({ where: { userId: created.user.id }, data: { expiresAt: new Date(0) } });
    await api().post("/api/v1/auth/account-links/activate-firebase").send({ token: expiredNonce, idToken: freshIdToken }).expect(400);
    await api().patch(`/api/v1/admin/collaborators/${created.user.id}/disabled`).set(headers()).send({ disabled: true }).expect(200);
    await api().post(`/api/v1/admin/collaborators/${created.user.id}/invitation`).set(headers()).expect(400);
  });
});
