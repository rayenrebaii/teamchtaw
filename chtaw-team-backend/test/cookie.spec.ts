import { ConfigService } from "@nestjs/config";
import type { Request, Response } from "express";
import { RefreshCookie } from "../src/auth/refresh-cookie";
describe("Cookie de refresh navigateur", () => {
  const config = (production = false) =>
    new ConfigService({
      NODE_ENV: production ? "production" : "development",
      CORS_ORIGINS: ["http://127.0.0.1:3001"],
      REFRESH_COOKIE_SAMESITE: "lax",
      REFRESH_TTL_SECONDS: 604800,
    });
  const request = (origin?: string) =>
    ({ header: (name: string) => (name === "Origin" ? origin : "cookie") }) as Request;
  it("exige une origine autorisée même si le cookie existe", () => {
    const cookie = new RefreshCookie(config());
    expect(() => cookie.assertOrigin(request())).toThrow();
    expect(() => cookie.assertOrigin(request("https://evil.example"))).toThrow();
    expect(() => cookie.assertOrigin(request("http://127.0.0.1:3001"))).not.toThrow();
  });
  it("pose HttpOnly et SameSite, sans exposer le cookie à toutes les routes", () => {
    const cookie = new RefreshCookie(config());
    const res = { cookie: jest.fn(), setHeader: jest.fn() } as unknown as Response;
    cookie.set(res, "test-token");
    expect(res.cookie).toHaveBeenCalledWith(
      "chtaw_refresh",
      "test-token",
      expect.objectContaining({
        httpOnly: true,
        secure: false,
        sameSite: "lax",
        path: "/api/v1/auth",
      }),
    );
  });
  it("impose Secure en production avec un nom préfixé", () => {
    const cookie = new RefreshCookie(config(true));
    const res = { cookie: jest.fn(), setHeader: jest.fn() } as unknown as Response;
    cookie.set(res, "test-token");
    expect(res.cookie).toHaveBeenCalledWith(
      "__Secure-chtaw_refresh",
      "test-token",
      expect.objectContaining({ httpOnly: true, secure: true }),
    );
  });
  it("refuse un cookie manquant ou trop long", () => {
    const cookie = new RefreshCookie(config());
    expect(() => cookie.read({ headers: {} } as Request)).toThrow();
    expect(() =>
      cookie.read({ headers: { cookie: "chtaw_refresh=" + "x".repeat(2049) } } as Request),
    ).toThrow();
  });
});
