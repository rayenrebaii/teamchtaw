import "reflect-metadata";
import { ConfigService } from "@nestjs/config";
import { Reflector } from "@nestjs/core";
import { ExecutionContext } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { PrismaService } from "../src/prisma/prisma.module";
import { AuthService } from "../src/auth/auth.service";
import { FirebaseIdentity } from "../src/auth/firebase.service";
import { PermissionsGuard } from "../src/auth/security";
import { DomainEvents } from "../src/common/events";
import { validateEnvironment } from "../src/config/environment";

const verifyIdToken = jest.fn(), getUser = jest.fn();
jest.mock("firebase-admin/app", () => ({ getApps: () => [{ name: "chtaw-auth" }] }));
jest.mock("firebase-admin/auth", () => ({ getAuth: () => ({ verifyIdToken, getUser }) }));

describe("Firebase server identity", () => {
  it("refuse un émulateur en production ou sur un hôte non local", () => {
    const base = { DATABASE_URL: "postgresql://localhost/test", CORS_ORIGINS: "https://example.test", JWT_ACCESS_SECRET: "a".repeat(64), JWT_REFRESH_SECRET: "b".repeat(64) };
    expect(() => validateEnvironment({ ...base, NODE_ENV: "production", FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:9099" })).toThrow("Firebase emulator");
    expect(() => validateEnvironment({ ...base, NODE_ENV: "test", FIREBASE_AUTH_EMULATOR_HOST: "example.test:9099" })).toThrow("Firebase emulator");
  });
  const identity = new FirebaseIdentity(new ConfigService({ AUTH_PROVIDER: "firebase" }));
  it("checks token revocation with the Admin SDK", async () => {
    verifyIdToken.mockResolvedValue({ uid: "uid", email: "test@example.test", firebase: { sign_in_provider: "password" } });
    await identity.verify("token");
    expect(verifyIdToken).toHaveBeenCalledWith("token", true);
  });
  it("rejects a Google identity until a provider migration is defined", async () => {
    verifyIdToken.mockResolvedValue({ uid: "uid", email: "test@example.test", firebase: { sign_in_provider: "google.com" } });
    await expect(identity.verify("token")).rejects.toThrow();
  });
  it("rejects old local sessions and disabled identities", async () => {
    await expect(identity.session(null, null)).rejects.toThrow();
    getUser.mockResolvedValue({ disabled: true });
    await expect(identity.session("uid", 123)).rejects.toThrow();
  });
  it("invalidates local sessions after a Firebase password reset", async () => {
    getUser.mockResolvedValue({ disabled: false, tokensValidAfterTime: new Date(200000).toISOString(), emailVerified: true });
    await expect(identity.session("uid", 100)).rejects.toThrow();
    await expect(identity.session("uid", 201)).resolves.toMatchObject({ emailVerified: true });
  });
  it("requires all server credentials before enabling Firebase", () => {
    expect(() => validateEnvironment({ DATABASE_URL: "postgresql://localhost/test", CORS_ORIGINS: "http://localhost:3001", JWT_ACCESS_SECRET: "a".repeat(64), JWT_REFRESH_SECRET: "b".repeat(64), AUTH_PROVIDER: "firebase" })).toThrow("FIREBASE_PROJECT_ID");
  });
});

describe("Firebase account linking", () => {
  const findUnique = jest.fn(), create = jest.fn(), update = jest.fn(), sessionCreate = jest.fn();
  const firebase = { enabled: true, verify: jest.fn(), session: jest.fn(), passwordLogin: jest.fn().mockRejectedValue(new Error("Firebase credentials rejected")) };
  let auth: AuthService;
  beforeAll(() => {
    auth = new AuthService({ user: { findUnique, create, update }, refreshSession: { create: sessionCreate },
      $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn({
        $queryRaw: jest.fn(), refreshSession: { create: sessionCreate }, user: { findUnique: async () =>
          await (update.mock.results.at(-1)?.value ?? create.mock.results.at(-1)?.value ?? findUnique.mock.results.at(-1)?.value) },
      }),
    } as unknown as PrismaService,
      { signAsync: jest.fn().mockResolvedValue("fictional-refresh-token") } as unknown as JwtService,
      new ConfigService({ ACCESS_TTL_SECONDS: 900, REFRESH_TTL_SECONDS: 3600, JWT_ACCESS_SECRET: "a".repeat(64), JWT_REFRESH_SECRET: "b".repeat(64) }), new DomainEvents(), firebase as unknown as FirebaseIdentity);
  });
  beforeEach(() => {
    findUnique.mockReset(); create.mockReset(); update.mockReset(); sessionCreate.mockReset();
    firebase.passwordLogin.mockReset().mockRejectedValue(new Error("Firebase credentials rejected"));
    firebase.verify.mockResolvedValue({ uid: "new-uid", email: "new@example.test", auth_time: 200 });
    firebase.session.mockResolvedValue({ email: "new@example.test", emailVerified: false });
  });
  it("never falls back to legacy password hashes after cutover", async () => {
    await expect(auth.login({ email: "new@example.test", password: "anything" })).rejects.toThrow("Firebase");
    await expect(auth.register({ email: "new@example.test", password: "anything", firstName: "New", lastName: "User" })).rejects.toThrow("Firebase");
  });
  it("never links an existing business account based only on matching email", async () => {
    findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: "existing-admin" });
    await expect(auth.firebaseLogin({ idToken: "token", firstName: "New", lastName: "User" })).rejects.toThrow();
    expect(update).not.toHaveBeenCalled(); expect(create).not.toHaveBeenCalled();
  });
  it("keeps installed PWA login compatible by checking the Firebase password only", async () => {
    const user = { id: "id", email: "new@example.test", role: "ADMIN", status: "APPROVED", emailVerified: true };
    firebase.passwordLogin.mockResolvedValue("firebase-token");
    firebase.session.mockResolvedValue({ email: user.email, emailVerified: true });
    findUnique.mockResolvedValueOnce(user); update.mockResolvedValue(user);
    const result = await auth.login({ email: user.email, password: "firebase-password" });
    expect(firebase.verify).toHaveBeenCalledWith("firebase-token");
    expect(findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { firebaseUid: "new-uid" } }));
    expect(result.user.role).toBe("ADMIN");
  });
  it("creates an unverified pending USER and binds the trusted Firebase auth time", async () => {
    findUnique.mockResolvedValue(null);
    create.mockImplementation(async ({ data }) => ({ ...data, id: "new-id" }));
    const result = await auth.firebaseLogin({ idToken: "token", firstName: "New", lastName: "User" });
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ role: "USER", status: "PENDING", emailVerified: false, firebaseUid: "new-uid" }) }));
    expect(sessionCreate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ firebaseAuthTime: 200 }) }));
    expect(result.user).not.toHaveProperty("passwordHash");
  });
  it("verification changes no role or administrative approval", async () => {
    const user = { id: "id", email: "new@example.test", role: "USER", status: "PENDING", emailVerified: false };
    findUnique.mockResolvedValueOnce(user);
    firebase.session.mockResolvedValue({ email: user.email, emailVerified: true });
    update.mockResolvedValue({ ...user, emailVerified: true });
    await auth.firebaseLogin({ idToken: "token" });
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ data: { emailVerified: true } }));
  });
});

describe("Two independent access requirements", () => {
  const guard = new PermissionsGuard(new Reflector());
  for (const [status, emailVerified, allowed] of [["PENDING", false, false], ["PENDING", true, false], ["APPROVED", false, false], ["APPROVED", true, true], ["REJECTED", true, false]] as const) {
    it(`${status}, verified=${emailVerified}: allowed=${allowed}`, () => {
      const ctx = { getType: () => "http", getHandler: () => function handler() {}, getClass: () => class Controller {}, switchToHttp: () => ({ getRequest: () => ({ user: { status, emailVerified, role: "USER" } }) }) } as unknown as ExecutionContext;
      if (allowed) expect(guard.canActivate(ctx)).toBe(true);
      else expect(() => guard.canActivate(ctx)).toThrow();
    });
  }
});
