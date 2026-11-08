import { resolve } from "node:path";
import { createECDH } from "node:crypto";
export function validateEnvironment(env: Record<string, unknown>) {
  const text = (key: string, fallback?: string) => {
    const value = env[key] ?? fallback;
    if (typeof value !== "string" || !value.trim()) throw Error(`Missing configuration: ${key}`);
    return value;
  };
  const number = (key: string, fallback: number, min: number, max: number) => {
    const value = Number(env[key] ?? fallback);
    if (!Number.isInteger(value) || value < min || value > max)
      throw Error(`Invalid configuration: ${key}`);
    return value;
  };
  const access = text("JWT_ACCESS_SECRET");
  const refresh = text("JWT_REFRESH_SECRET");
  if (access.length < 48 || refresh.length < 48 || access === refresh)
    throw Error("JWT secrets must be different and at least 48 characters.");
  const database = text("DATABASE_URL");
  if (!/^postgres(ql)?:\/\//.test(database)) throw Error("DATABASE_URL must use PostgreSQL.");
  const origins = text("CORS_ORIGINS")
    .split(",")
    .map((v) => v.trim());
  for (const origin of origins) {
    const url = new URL(origin);
    if (!["http:", "https:"].includes(url.protocol) || url.origin !== origin)
      throw Error("CORS_ORIGINS must contain exact HTTP origins.");
  }
  const mode = text("NODE_ENV", "development");
  if (!["development", "test", "production"].includes(mode)) throw Error("Invalid NODE_ENV.");
  const directDatabase = text("DATABASE_DIRECT_URL", database);
  if (!/^postgres(ql)?:\/\//.test(directDatabase)) throw Error("DATABASE_DIRECT_URL must use PostgreSQL.");
  const mediaStorage = text("MEDIA_STORAGE", "local");
  if (!["local", "postgres"].includes(mediaStorage)) throw Error("Invalid MEDIA_STORAGE.");
  if (mode === "production" && env.RENDER === "true" && mediaStorage === "local")
    throw Error("Render requires durable external media storage.");
  if (mode === "production" && origins.some((o) => !o.startsWith("https://")))
    throw Error("Production origins must use HTTPS.");
  const sameSite = text("REFRESH_COOKIE_SAMESITE", "lax");
  if (
    !["lax", "strict", "none"].includes(sameSite) ||
    (sameSite === "none" && mode !== "production")
  )
    throw Error("Invalid REFRESH_COOKIE_SAMESITE; none requires production HTTPS.");
  const vapid = ["VAPID_PUBLIC_KEY", "VAPID_PRIVATE_KEY", "VAPID_SUBJECT"].map((key) => typeof env[key] === "string" ? (env[key] as string).trim() : "");
  const pushEnabled = vapid.every(Boolean);
  if (vapid.some(Boolean) && !pushEnabled) throw Error("All VAPID settings must be supplied together.");
  if (pushEnabled) {
    try {
      const key = createECDH("prime256v1");
      key.setPrivateKey(Buffer.from(vapid[1]!, "base64url"));
      if (!key.getPublicKey().equals(Buffer.from(vapid[0]!, "base64url")) || !/^(mailto:[^\s@]+@[^\s@]+|https:\/\/[^\s]+)$/.test(vapid[2]!)) throw Error();
    } catch { throw Error("Invalid VAPID configuration."); }
  }
  const notificationZone = text("NOTIFICATION_TIMEZONE", "Africa/Tunis");
  new Intl.DateTimeFormat("fr", { timeZone: notificationZone });
  const pushOrigins = typeof env.PUSH_ALLOWED_ORIGINS === "string" ? env.PUSH_ALLOWED_ORIGINS.split(",").map((value) => value.trim()).filter(Boolean) : [];
  for (const origin of pushOrigins) { const url = new URL(origin); if (url.protocol !== "https:" || url.origin !== origin || url.username || url.password) throw Error("Invalid PUSH_ALLOWED_ORIGINS."); }
  return {
    ...env,
    PUSH_ENABLED: pushEnabled,
    VAPID_PUBLIC_KEY: vapid[0], VAPID_PRIVATE_KEY: vapid[1], VAPID_SUBJECT: vapid[2],
    NOTIFICATION_TIMEZONE: notificationZone, PUSH_ALLOWED_ORIGINS: pushOrigins,
    NODE_ENV: mode,
    REFRESH_COOKIE_SAMESITE: sameSite,
    HOST: text("HOST", "127.0.0.1"),
    PORT: number("PORT", 3002, 1, 65535),
    DATABASE_URL: database,
    DATABASE_DIRECT_URL: directDatabase,
    MEDIA_STORAGE: mediaStorage,
    MEDIA_MAX_TOTAL_BYTES: number("MEDIA_MAX_TOTAL_BYTES", 104857600, 1048576, 524288000),
    JWT_ACCESS_SECRET: access,
    JWT_REFRESH_SECRET: refresh,
    CORS_ORIGINS: origins,
    ACCESS_TTL_SECONDS: number("ACCESS_TTL_SECONDS", 900, 60, 3600),
    REFRESH_TTL_SECONDS: number("REFRESH_TTL_SECONDS", 604800, 3600, 2592000),
    UPLOAD_DIR: resolve(text("UPLOAD_DIR", "./uploads")),
    UPLOAD_MAX_BYTES: number("UPLOAD_MAX_BYTES", 5242880, 1024, 10485760),
    SWAGGER_ENABLED: text("SWAGGER_ENABLED", mode === "production" ? "false" : "true") === "true",
  };
}
