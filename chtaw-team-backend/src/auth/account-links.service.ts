import { BadRequestException, Injectable, Logger, ServiceUnavailableException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createHash, randomBytes } from "node:crypto";
import * as argon2 from "argon2";
import { PrismaService } from "../prisma/prisma.module";
import { DomainEvents } from "../common/events";
import { FirebaseIdentity } from "./firebase.service";
import { passwordOptions } from "./auth.service";

@Injectable()
export class AccountMailer {
  constructor(private config: ConfigService) {}
  actionUrl(token: string) {
    const origin = this.config.get<string>("ACCOUNT_ACTION_ORIGIN");
    if (!origin) throw new ServiceUnavailableException("Configurez ACCOUNT_ACTION_ORIGIN pour les liens de compte.");
    const url = new URL(origin);
    if (url.origin !== origin || url.username || url.password ||
      (url.protocol !== "https:" && !(this.config.get("NODE_ENV") !== "production" && ["127.0.0.1", "localhost"].includes(url.hostname))))
      throw new ServiceUnavailableException("Origine des invitations invalide.");
    // Fragment stays out of HTTP access logs and Referer headers.
    return `${origin}/account-action#${token}`;
  }
  async send(email: string, token: string, invitation: boolean) {
    const url = this.actionUrl(token);
    const key = this.config.get<string>("RESEND_API_KEY");
    const from = this.config.get<string>("ACCOUNT_EMAIL_FROM");
    if (!key || !from) throw new ServiceUnavailableException("Service d’e-mail non configuré.");
    try {
      const response = await fetch("https://api.resend.com/emails", { method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from, to: [email], subject: invitation ? "Votre invitation Chtaw Team" : "Réinitialisation Chtaw Team",
          text: `${invitation ? "Définissez votre premier mot de passe" : "Réinitialisez votre mot de passe"} : ${url}\nCe lien personnel expire dans une heure et ne peut être utilisé qu’une fois. Si vous n’êtes pas à l’origine de cette demande, ignorez ce message.` }),
        signal: AbortSignal.timeout(15000) });
      if (!response.ok) throw Error();
      const result = await response.json() as { id?: string };
      if (!result.id) throw Error();
      return result.id;
    } catch { throw new ServiceUnavailableException("Envoi impossible. Renvoyez l’invitation ultérieurement."); }
  }
}

@Injectable()
export class AccountLinksService {
  private logger = new Logger(AccountLinksService.name);
  constructor(private db: PrismaService, private mail: AccountMailer, private firebase: FirebaseIdentity, private events: DomainEvents) {}
  async issue(userId: string, purpose: "INVITE" | "RESET") {
    const token = randomBytes(32).toString("base64url");
    const link = await this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "User" WHERE id=${userId}::uuid FOR UPDATE`;
      const user = await tx.user.findUniqueOrThrow({ where: { id: userId } });
      if (user.disabledAt || (purpose === "INVITE" && (user.role !== "COLLABORATOR" || user.activatedAt)) ||
        (purpose === "RESET" && user.role === "COLLABORATOR" && !user.activatedAt)) throw new BadRequestException("Action indisponible pour ce compte.");
      const recent = await tx.accountLink.findFirst({ where: { userId, purpose, createdAt: { gt: new Date(Date.now() - 60000) }, usedAt: null } });
      if (recent) throw new BadRequestException("Patientez une minute avant un nouvel envoi.");
      await tx.accountLink.updateMany({ where: { userId, usedAt: null }, data: { usedAt: new Date() } });
      const row = await tx.accountLink.create({ data: { userId, purpose, tokenHash: this.digest(token), expiresAt: new Date(Date.now() + 3600000) } });
      return { ...row, email: user.email };
    });
    try {
      if (this.firebase.enabled) {
        const actionUrl = this.mail.actionUrl(token);
        return await this.firebase.sendPasswordReset(link.email, purpose === "INVITE" ? actionUrl : new URL("/login", actionUrl).href);
      }
      const deliveryId = await this.mail.send(link.email, token, purpose === "INVITE");
      return { sent: true, deliveryId };
    } catch (error) {
      await this.db.accountLink.update({ where: { id: link.id }, data: { usedAt: new Date() } });
      throw error;
    }
  }
  async forgot(email: string) {
    const user = await this.db.user.findUnique({ where: { email }, select: { id: true, disabledAt: true } });
    if (user && !user.disabledAt) {
      try { await this.issue(user.id, "RESET"); }
      catch { this.logger.warn("Password reset request could not be delivered; no identity or token logged."); }
    }
    return { message: "Si un compte correspond à cette adresse, vous recevrez un lien de réinitialisation." };
  }
  async redeem(token: string, password: string) {
    if (this.firebase.enabled) throw new BadRequestException("Utilisez le lien d’action Firebase reçu par e-mail puis activez votre invitation.");
    const passwordHash = await argon2.hash(password, passwordOptions);
    const digest = this.digest(token);
    const result = await this.db.$transaction(async (tx) => {
      const found = await tx.accountLink.findUnique({ where: { tokenHash: digest } });
      if (!found) throw new BadRequestException("Lien invalide ou expiré. Demandez un nouveau lien.");
      await tx.$queryRaw`SELECT id FROM "User" WHERE id=${found.userId}::uuid FOR UPDATE`;
      const link = await tx.accountLink.findUniqueOrThrow({ where: { id: found.id }, include: { user: true } });
      if (link.usedAt || link.expiresAt <= new Date() || link.user.disabledAt ||
        (link.purpose === "INVITE" && (link.user.role !== "COLLABORATOR" || link.user.activatedAt)))
        throw new BadRequestException("Lien invalide ou expiré. Demandez un nouveau lien.");
      await tx.user.update({ where: { id: link.userId }, data: { passwordHash,
        ...(link.purpose === "INVITE" ? { activatedAt: new Date(), emailVerified: true, status: "APPROVED" } : {}) } });
      await tx.accountLink.updateMany({ where: { userId: link.userId, usedAt: null }, data: { usedAt: new Date() } });
      const sessions = await tx.refreshSession.findMany({ where: { userId: link.userId, revokedAt: null }, select: { id: true } });
      await tx.refreshSession.updateMany({ where: { userId: link.userId, revokedAt: null }, data: { revokedAt: new Date() } });
      await tx.pushSubscription.deleteMany({ where: { userId: link.userId } });
      return sessions;
    }, { timeout: 25000 });
    for (const session of result) await this.events.publish({ name: "session:revoked", sessionId: session.id, payload: {} });
    return { success: true };
  }
  async activateFirebase(token: string, idToken: string) {
    if (!this.firebase.enabled) throw new BadRequestException("Firebase n’est pas activé.");
    const sessions = await this.db.$transaction(async (tx) => {
      const found = await tx.accountLink.findUnique({ where: { tokenHash: this.digest(token) } });
      if (!found) throw new BadRequestException("Lien invalide ou expiré.");
      await tx.$queryRaw`SELECT id FROM "User" WHERE id=${found.userId}::uuid FOR UPDATE`;
      const link = await tx.accountLink.findUniqueOrThrow({ where: { id: found.id }, include: { user: true } });
      if (link.purpose !== "INVITE" || link.usedAt || link.expiresAt <= new Date() || link.user.disabledAt ||
        link.user.role !== "COLLABORATOR" || link.user.activatedAt)
        throw new BadRequestException("Lien invalide ou expiré. Demandez une nouvelle invitation à l’administrateur.");
      await this.firebase.activateInvitation(link.user.firebaseUid, link.user.email, idToken, link.createdAt);
      await tx.user.update({ where: { id: link.userId }, data: { activatedAt: new Date(), emailVerified: true, status: "APPROVED" } });
      await tx.accountLink.updateMany({ where: { userId: link.userId, usedAt: null }, data: { usedAt: new Date() } });
      const active = await tx.refreshSession.findMany({ where: { userId: link.userId, revokedAt: null }, select: { id: true } });
      await tx.refreshSession.updateMany({ where: { userId: link.userId, revokedAt: null }, data: { revokedAt: new Date() } });
      await tx.pushSubscription.deleteMany({ where: { userId: link.userId } });
      return active;
    }, { timeout: 25000 });
    for (const session of sessions) await this.events.publish({ name: "session:revoked", sessionId: session.id, payload: {} });
    return { success: true };
  }
  private digest(token: string) { return createHash("sha256").update(token).digest("hex"); }
}
