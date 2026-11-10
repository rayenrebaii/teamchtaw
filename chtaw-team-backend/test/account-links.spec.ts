import "reflect-metadata";
import { ConfigService } from "@nestjs/config";
import { AccountMailer } from "../src/auth/account-links.service";
import { FirebaseIdentity } from "../src/auth/firebase.service";
import { AccountLinksService } from "../src/auth/account-links.service";
import { PrismaService } from "../src/prisma/prisma.module";
import { DomainEvents } from "../src/common/events";

describe("Sécurité des liens de compte", () => {
  it("utilise exclusivement l’e-mail Firebase natif pour une invitation Firebase", async () => {
    const user = { email: "collab@test.invalid", role: "COLLABORATOR", disabledAt: null, activatedAt: null };
    const tx = { $queryRaw: jest.fn(), user: { findUniqueOrThrow: jest.fn().mockResolvedValue(user) }, accountLink: {
      findFirst: jest.fn().mockResolvedValue(null), updateMany: jest.fn(),
      create: jest.fn(async ({ data }) => ({ ...data, id: "link" })),
    } };
    const mail = { actionUrl: jest.fn((token: string) => `https://example.test/account-action#${token}`), send: jest.fn() };
    const firebase = { enabled: true, sendPasswordReset: jest.fn().mockResolvedValue({ sent: true, provider: "firebase" }) };
    const service = new AccountLinksService({ $transaction: (fn: (client: typeof tx) => Promise<unknown>) => fn(tx) } as unknown as PrismaService,
      mail as unknown as AccountMailer, firebase as unknown as FirebaseIdentity, {} as DomainEvents);
    await expect(service.issue("user", "INVITE")).resolves.toMatchObject({ sent: true, provider: "firebase" });
    expect(firebase.sendPasswordReset).toHaveBeenCalledWith(user.email, expect.stringMatching(/^https:\/\/example.test\/account-action#[A-Za-z0-9_-]{43}$/));
    expect(mail.send).not.toHaveBeenCalled();
  });
  it("refuse de définir directement un mot de passe Firebase avec le seul nonce applicatif", async () => {
    const service = new AccountLinksService({} as PrismaService, {} as AccountMailer, { enabled: true } as FirebaseIdentity, {} as DomainEvents);
    await expect(service.redeem("a".repeat(43), "Secure-password-2026!")).rejects.toThrow("Firebase");
  });
  it.each([
    { purpose: "RESET" }, { usedAt: new Date() }, { expiresAt: new Date(0) },
    { user: { role: "USER" } }, { user: { role: "COLLABORATOR", disabledAt: new Date() } },
    { user: { role: "COLLABORATOR", activatedAt: new Date() } },
  ])("bloque une activation avec un état interdit : %j", async (override) => {
    const link = { id: "link", userId: "user", purpose: "INVITE", usedAt: null, expiresAt: new Date(Date.now() + 3600000),
      user: { role: "COLLABORATOR", activatedAt: null, disabledAt: null }, ...override };
    const tx = { $queryRaw: jest.fn(), accountLink: { findUnique: jest.fn().mockResolvedValue(link), findUniqueOrThrow: jest.fn().mockResolvedValue(link) } };
    const firebase = { enabled: true, activateInvitation: jest.fn() };
    const service = new AccountLinksService({ $transaction: (fn: (client: typeof tx) => Promise<unknown>) => fn(tx) } as unknown as PrismaService,
      {} as AccountMailer, firebase as unknown as FirebaseIdentity, {} as DomainEvents);
    await expect(service.activateFirebase("a".repeat(43), "firebase-id-token")).rejects.toThrow();
    expect(firebase.activateInvitation).not.toHaveBeenCalled();
  });
  it("refuse une origine de production HTTP ou contenant un chemin", () => {
    for (const origin of ["http://example.test", "https://example.test/unsafe"]) {
      const mailer = new AccountMailer(new ConfigService({ ACCOUNT_ACTION_ORIGIN: origin, NODE_ENV: "production" }));
      expect(() => mailer.actionUrl("secret-token")).toThrow();
    }
  });
  it("place le jeton dans un fragment et impose une configuration explicite", () => {
    const mailer = new AccountMailer(new ConfigService({ ACCOUNT_ACTION_ORIGIN: "https://example.test", NODE_ENV: "production" }));
    expect(mailer.actionUrl("secret-token")).toBe("https://example.test/account-action#secret-token");
    expect(() => new AccountMailer(new ConfigService()).actionUrl("token")).toThrow();
  });
  it("définit le mot de passe Firebase et révoque les jetons avant activation locale", async () => {
    const calls: string[] = [];
    const firebase = { enabled: true, activateInvitation: jest.fn(async () => { calls.push("firebase"); }) };
    const link = { id: "link", userId: "user", purpose: "INVITE", createdAt: new Date(), usedAt: null, expiresAt: new Date(Date.now() + 3600000), user: { role: "COLLABORATOR", email: "collaborator@test.invalid", firebaseUid: "uid", activatedAt: null, disabledAt: null } };
    const tx = {
      $queryRaw: jest.fn(),
      accountLink: { findUnique: jest.fn().mockResolvedValue(link), findUniqueOrThrow: jest.fn().mockResolvedValue(link), updateMany: jest.fn() },
      user: { update: jest.fn(async () => { calls.push("local"); }) },
      refreshSession: { findMany: jest.fn().mockResolvedValue([{ id: "old-session" }]), updateMany: jest.fn() },
      pushSubscription: { deleteMany: jest.fn() },
    };
    const events = { publish: jest.fn() };
    const service = new AccountLinksService({ $transaction: (fn: (client: typeof tx) => Promise<unknown>) => fn(tx) } as unknown as PrismaService,
      {} as AccountMailer, firebase as unknown as FirebaseIdentity, events as unknown as DomainEvents);
    await service.activateFirebase("a".repeat(43), "firebase-id-token");
    expect(calls).toEqual(["firebase", "local"]);
    expect(firebase.activateInvitation).toHaveBeenCalledWith("uid", "collaborator@test.invalid", "firebase-id-token", link.createdAt);
    expect(tx.user.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "APPROVED", emailVerified: true }) }));
    expect(events.publish).toHaveBeenCalledWith({ name: "session:revoked", sessionId: "old-session", payload: {} });
  });
  it("une panne Firebase empêche l’activation locale et laisse le lien réutilisable", async () => {
    const link = { id: "link", userId: "user", purpose: "INVITE", usedAt: null, expiresAt: new Date(Date.now() + 3600000), user: { role: "COLLABORATOR", firebaseUid: "uid", activatedAt: null, disabledAt: null } };
    const tx = { $queryRaw: jest.fn(), accountLink: { findUnique: jest.fn().mockResolvedValue(link), findUniqueOrThrow: jest.fn().mockResolvedValue(link), updateMany: jest.fn() }, user: { update: jest.fn() } };
    const service = new AccountLinksService({ $transaction: (fn: (client: typeof tx) => Promise<unknown>) => fn(tx) } as unknown as PrismaService,
      {} as AccountMailer, { enabled: true, activateInvitation: jest.fn().mockRejectedValue(Error("Firebase unavailable")) } as unknown as FirebaseIdentity, {} as DomainEvents);
    await expect(service.activateFirebase("a".repeat(43), "firebase-id-token")).rejects.toThrow("Firebase unavailable");
    expect(tx.user.update).not.toHaveBeenCalled(); expect(tx.accountLink.updateMany).not.toHaveBeenCalled();
  });
});
