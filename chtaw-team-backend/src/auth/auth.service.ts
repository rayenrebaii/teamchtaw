import { BadRequestException, Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import * as argon2 from "argon2";
import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.module";
import { DomainEvents } from "../common/events";
import { userSelect } from "../common/presenters";
import { Actor } from "../common/access";
import { FirebaseLoginDto, LoginDto, RegisterDto } from "./auth.dto";
import { FirebaseIdentity } from "./firebase.service";
export interface TokenClaims {
  sub: string;
  sid: string;
  typ: "access" | "refresh";
  rotation?: number;
  exp?: number;
}
export const passwordOptions = {
  type: argon2.argon2id,
  memoryCost: 65536,
  timeCost: 3,
  parallelism: 1,
};
@Injectable()
export class AuthService {
  private dummyHash: Promise<string>;
  constructor(
    private db: PrismaService,
    private jwt: JwtService,
    private config: ConfigService,
    private events: DomainEvents,
    private firebase: FirebaseIdentity,
  ) {
    this.dummyHash = argon2.hash(randomUUID(), passwordOptions);
  }
  async register(dto: RegisterDto) {
    if (this.firebase.enabled) throw new UnauthorizedException("Utilisez l’inscription Firebase.");
    const passwordHash = await argon2.hash(dto.password, passwordOptions);
    return this.db.user.create({
      data: {
        email: dto.email,
        firstName: dto.firstName,
        lastName: dto.lastName,
        passwordHash,
        role: "USER",
        status: "PENDING",
      },
      select: userSelect,
    });
  }
  async login(dto: LoginDto) {
    if (this.firebase.enabled) return this.firebaseLogin({ idToken: await this.firebase.passwordLogin(dto.email, dto.password) });
    const user = await this.db.user.findUnique({
      where: { email: dto.email },
      select: { ...userSelect, passwordHash: true },
    });
    const valid = await argon2.verify(user?.passwordHash ?? (await this.dummyHash), dto.password);
    if (!user || !valid) throw new UnauthorizedException("Email ou mot de passe incorrect.");
    return this.openSession(user);
  }
  async firebaseLogin(dto: FirebaseLoginDto) {
    const token = await this.firebase.verify(dto.idToken);
    const identity = await this.firebase.session(token.uid, token.auth_time);
    // The current Firebase record is authoritative; never trust a frontend verification flag.
    const email = identity.email?.trim().toLowerCase();
    if (!email || email !== token.email?.trim().toLowerCase()) throw new UnauthorizedException();
    let user = await this.db.user.findUnique({ where: { firebaseUid: token.uid }, select: userSelect });
    if (!user) {
      // An existing business identity may only be linked by the reviewed migration procedure.
      const existing = await this.db.user.findUnique({ where: { email }, select: { id: true } });
      if (existing) throw new UnauthorizedException("Connexion indisponible. Contactez l’administrateur.");
      if (!dto.firstName || !dto.lastName) throw new BadRequestException("Complétez votre inscription avec votre nom et prénom.");
      user = await this.db.user.create({
        data: { email, firstName: dto.firstName, lastName: dto.lastName,
          firebaseUid: token.uid, emailVerified: identity.emailVerified,
          passwordHash: await argon2.hash(randomUUID(), passwordOptions), role: "USER", status: "PENDING" },
        select: userSelect,
      });
    } else {
      if (user.email !== email) throw new UnauthorizedException("Adresse modifiée. Contactez l’administrateur.");
      user = await this.db.user.update({ where: { id: user.id }, data: { emailVerified: identity.emailVerified }, select: userSelect });
    }
    return this.openSession(user, token.auth_time);
  }
  private async openSession(user: Prisma.UserGetPayload<{ select: typeof userSelect }> & { passwordHash?: string }, firebaseAuthTime?: number) {
    const id = randomUUID();
    const pair = await this.tokens(user.id, id, 0);
    const tokenHash = await argon2.hash(pair.refreshToken, passwordOptions);
    await this.db.refreshSession.create({
      data: {
        id,
        userId: user.id,
        firebaseAuthTime,
        tokenHash,
        expiresAt: new Date(
          Date.now() + this.config.getOrThrow<number>("REFRESH_TTL_SECONDS") * 1000,
        ),
      },
    });
    const { passwordHash: _, ...safe } = user;
    return { ...pair, user: safe };
  }
  private async tokens(userId: string, sessionId: string, rotation: number) {
    const accessSeconds = this.config.getOrThrow<number>("ACCESS_TTL_SECONDS");
    const refreshSeconds = this.config.getOrThrow<number>("REFRESH_TTL_SECONDS");
    const [accessToken, refreshToken] = await Promise.all([
      this.jwt.signAsync(
        { sub: userId, sid: sessionId, typ: "access" },
        {
          secret: this.config.getOrThrow<string>("JWT_ACCESS_SECRET"),
          expiresIn: accessSeconds,
          issuer: "chtaw-team",
          audience: "chtaw-pwa",
          jwtid: randomUUID(),
        },
      ),
      this.jwt.signAsync(
        { sub: userId, sid: sessionId, typ: "refresh", rotation },
        {
          secret: this.config.getOrThrow<string>("JWT_REFRESH_SECRET"),
          expiresIn: refreshSeconds,
          issuer: "chtaw-team",
          audience: "chtaw-refresh",
          jwtid: randomUUID(),
        },
      ),
    ]);
    return {
      accessToken,
      refreshToken,
      tokenType: "Bearer",
      expiresIn: accessSeconds,
      userId,
      sessionId,
    };
  }
  async refresh(raw: string) {
    let claims: TokenClaims;
    try {
      claims = await this.jwt.verifyAsync<TokenClaims>(raw, {
        secret: this.config.getOrThrow<string>("JWT_REFRESH_SECRET"),
        algorithms: ["HS256"],
        issuer: "chtaw-team",
        audience: "chtaw-refresh",
      });
    } catch {
      throw new UnauthorizedException("Refresh token invalide.");
    }
    if (
      claims.typ !== "refresh" ||
      !claims.sub ||
      !claims.sid ||
      !Number.isInteger(claims.rotation)
    )
      throw new UnauthorizedException();
    const result = await this.db.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM "RefreshSession" WHERE id=${claims.sid}::uuid FOR UPDATE`;
        const session = await tx.refreshSession.findUnique({
          where: { id: claims.sid },
          select: {
            id: true,
            userId: true,
            tokenHash: true,
            rotation: true,
            expiresAt: true,
            revokedAt: true,
            firebaseAuthTime: true,
            user: { select: { firebaseUid: true, email: true } },
          },
        });
        if (
          !session ||
          session.userId !== claims.sub ||
          session.revokedAt ||
          session.expiresAt <= new Date()
        )
          return null;
        if (this.firebase.enabled) {
          const identity = await this.firebase.session(session.user.firebaseUid, session.firebaseAuthTime);
          if (identity.email?.trim().toLowerCase() !== session.user.email) return null;
        }
        if (
          session.rotation !== claims.rotation ||
          !(await argon2.verify(session.tokenHash, raw))
        ) {
          await tx.refreshSession.update({
            where: { id: session.id },
            data: { revokedAt: new Date() },
          });
          return null;
        }
        const pair = await this.tokens(session.userId, session.id, session.rotation + 1);
        await tx.refreshSession.update({
          where: { id: session.id },
          data: {
            rotation: { increment: 1 },
            tokenHash: await argon2.hash(pair.refreshToken, passwordOptions),
            expiresAt: new Date(
              Date.now() + this.config.getOrThrow<number>("REFRESH_TTL_SECONDS") * 1000,
            ),
          },
        });
        return pair;
      },
      { timeout: 10000 },
    );
    if (!result) {
      await this.events.publish({ name: "session:revoked", sessionId: claims.sid, payload: {} });
      throw new UnauthorizedException("Session révoquée, expirée ou token réutilisé.");
    }
    return result;
  }
  async verifyAccess(raw: string): Promise<Actor> {
    let claims: TokenClaims;
    try {
      claims = await this.jwt.verifyAsync<TokenClaims>(raw, {
        secret: this.config.getOrThrow<string>("JWT_ACCESS_SECRET"),
        algorithms: ["HS256"],
        issuer: "chtaw-team",
        audience: "chtaw-pwa",
      });
    } catch {
      throw new UnauthorizedException("Access token invalide ou expiré.");
    }
    return this.resolveClaims(claims);
  }
  async resolveClaims(claims: TokenClaims): Promise<Actor> {
    if (claims.typ !== "access" || !claims.sub || !claims.sid) throw new UnauthorizedException();
    const session = await this.db.refreshSession.findUnique({
      where: { id: claims.sid },
      include: { user: { select: { ...userSelect, firebaseUid: true } } },
    });
    if (
      !session ||
      session.userId !== claims.sub ||
      session.revokedAt ||
      session.expiresAt <= new Date()
    )
      throw new UnauthorizedException("Session révoquée.");
    const { firebaseUid, ...user } = session.user;
    if (this.firebase.enabled) {
      const identity = await this.firebase.session(firebaseUid, session.firebaseAuthTime);
      if (identity.email?.trim().toLowerCase() !== user.email) throw new UnauthorizedException();
      if (identity.emailVerified !== user.emailVerified)
        await this.db.user.update({ where: { id: user.id }, data: { emailVerified: identity.emailVerified } });
      return { ...user, emailVerified: identity.emailVerified, sessionId: session.id };
    }
    return { ...user, emailVerified: undefined, sessionId: session.id };
  }
  async logoutBrowser(raw: string | undefined) {
    if (!raw) return;
    let claims: TokenClaims;
    try {
      claims = await this.jwt.verifyAsync<TokenClaims>(raw, {
        secret: this.config.getOrThrow<string>("JWT_REFRESH_SECRET"),
        algorithms: ["HS256"], issuer: "chtaw-team", audience: "chtaw-refresh", ignoreExpiration: true,
      });
    } catch { return; }
    if (claims.typ !== "refresh" || !claims.sid || !claims.sub) return;
    await this.db.refreshSession.updateMany({ where: { id: claims.sid, userId: claims.sub, revokedAt: null }, data: { revokedAt: new Date() } });
    await this.db.pushSubscription.deleteMany({ where: { sessionId: claims.sid } });
    await this.events.publish({ name: "session:revoked", sessionId: claims.sid, payload: {} });
  }
  async logout(actor: Actor) {
    await this.db.refreshSession.updateMany({
      where: { id: actor.sessionId, userId: actor.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    await this.db.pushSubscription.deleteMany({ where: { sessionId: actor.sessionId, userId: actor.id } });
    await this.events.publish({ name: "session:revoked", sessionId: actor.sessionId, payload: {} });
  }
}
