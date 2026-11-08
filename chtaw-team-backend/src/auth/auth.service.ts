import { Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import * as argon2 from "argon2";
import { randomUUID } from "node:crypto";
import { PrismaService } from "../prisma/prisma.module";
import { DomainEvents } from "../common/events";
import { userSelect } from "../common/presenters";
import { Actor } from "../common/access";
import { LoginDto, RegisterDto } from "./auth.dto";
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
  ) {
    this.dummyHash = argon2.hash(randomUUID(), passwordOptions);
  }
  async register(dto: RegisterDto) {
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
    const user = await this.db.user.findUnique({
      where: { email: dto.email },
      select: { ...userSelect, passwordHash: true },
    });
    const valid = await argon2.verify(user?.passwordHash ?? (await this.dummyHash), dto.password);
    if (!user || !valid) throw new UnauthorizedException("Email ou mot de passe incorrect.");
    const id = randomUUID();
    const pair = await this.tokens(user.id, id, 0);
    const tokenHash = await argon2.hash(pair.refreshToken, passwordOptions);
    await this.db.refreshSession.create({
      data: {
        id,
        userId: user.id,
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
          },
        });
        if (
          !session ||
          session.userId !== claims.sub ||
          session.revokedAt ||
          session.expiresAt <= new Date()
        )
          return null;
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
      include: { user: { select: userSelect } },
    });
    if (
      !session ||
      session.userId !== claims.sub ||
      session.revokedAt ||
      session.expiresAt <= new Date()
    )
      throw new UnauthorizedException("Session révoquée.");
    return { ...session.user, sessionId: session.id };
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
