import { ForbiddenException, Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Request, Response, CookieOptions } from "express";
@Injectable()
export class RefreshCookie {
  constructor(private config: ConfigService) {}
  private get name() {
    return this.config.get("NODE_ENV") === "production"
      ? "__Secure-chtaw_refresh"
      : "chtaw_refresh";
  }
  private get options(): CookieOptions {
    return {
      httpOnly: true,
      secure: this.config.get("NODE_ENV") === "production",
      sameSite: this.config.get<"lax" | "strict" | "none">("REFRESH_COOKIE_SAMESITE", "lax"),
      path: "/api/v1/auth",
    };
  }
  browser(request: Request) {
    return request.header("X-Session-Transport") === "cookie";
  }
  assertOrigin(request: Request) {
    const origin = request.header("Origin");
    if (!origin || !this.config.getOrThrow<string[]>("CORS_ORIGINS").includes(origin))
      throw new ForbiddenException("Origine de session refusée.");
  }
  read(request: Request) {
    const part = request.headers.cookie
      ?.split(";")
      .map((v) => v.trim())
      .find((v) => v.startsWith(`${this.name}=`));
    if (!part) throw new UnauthorizedException("Session navigateur absente.");
    const value = part.slice(this.name.length + 1);
    if (value.length > 2048) throw new UnauthorizedException();
    return value;
  }
  set(response: Response, token: string) {
    response.setHeader("Cache-Control", "no-store");
    response.cookie(this.name, token, {
      ...this.options,
      maxAge: this.config.getOrThrow<number>("REFRESH_TTL_SECONDS") * 1000,
    });
  }
  clear(response: Response) {
    response.clearCookie(this.name, this.options);
    response.setHeader("Cache-Control", "no-store");
  }
}
