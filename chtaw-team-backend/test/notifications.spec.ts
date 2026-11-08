import "reflect-metadata";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { createECDH, randomBytes } from "node:crypto";
import webpush from "web-push";
import { defaultPreferences, permits, reminderPlan, validPushEndpoint } from "../src/notifications/notifications.rules";
import { NotificationPreferenceDto, SubscribePushDto } from "../src/notifications/notifications.dto";
import { validateEnvironment } from "../src/config/environment";
describe("Notification rules", () => {
  it.each(["MESSAGE", "POLL", "SESSION_24H", "SESSION_1H"])("respects master preference for %s", (type) => {
    expect(permits(null, type)).toBe(true);
    expect(permits({ ...defaultPreferences, enabled: false }, type)).toBe(false);
  });
  it("keeps categories independent and disables both reminders together", () => {
    expect(permits({ ...defaultPreferences, messagesEnabled: false }, "POLL")).toBe(true);
    expect(permits({ ...defaultPreferences, pollsEnabled: false }, "POLL")).toBe(false);
    for (const type of ["SESSION_24H", "SESSION_1H"]) expect(permits({ ...defaultPreferences, sessionRemindersEnabled: false }, type)).toBe(false);
  });
  it("uses real slot starts, not a vote deadline", () => {
    const start = new Date("2026-11-10T13:00:00Z"), before = new Date("2026-11-08T12:00:00Z");
    expect(reminderPlan(start, before, before, before)).toEqual([
      { type: "SESSION_24H", scheduledFor: new Date("2026-11-09T13:00:00Z"), status: "PENDING" },
      { type: "SESSION_1H", scheduledFor: new Date("2026-11-10T12:00:00Z"), status: "PENDING" },
    ]);
  });
  it("skips retrospective reminders but preserves the next future reminder", () => {
    const start = new Date("2026-11-10T13:00:00Z"), late = new Date("2026-11-10T10:00:00Z");
    expect(reminderPlan(start, late, late, late).map((job) => job.status)).toEqual(["SKIPPED", "PENDING"]);
    expect(reminderPlan(start, late, late, new Date("2026-11-10T12:30:00Z")).map((job) => job.status)).toEqual(["SKIPPED", "SKIPPED"]);
  });
  it.each(["http://fcm.googleapis.com/a", "https://127.0.0.1/a", "https://[::1]/", "https://localhost/", "https://fcm.googleapis.com.evil.test/", "https://user:secret@fcm.googleapis.com/a", "https://fcm.googleapis.com:444/a", "https://evil.test/a"])("rejects untrusted push endpoints: %s", (endpoint) => {
    expect(validPushEndpoint(endpoint)).toBe(false);
  });
  it.each(["https://fcm.googleapis.com/fcm/send/example", "https://updates.push.services.mozilla.com/wpush/v2/example", "https://web.push.apple.com/example"])("allows trusted push vendor %s", (endpoint) => {
    expect(validPushEndpoint(endpoint)).toBe(true);
  });
  it("validates boolean preferences and forbids selecting a recipient", async () => {
    for (const enabled of [null, "false", 0]) expect(await validate(plainToInstance(NotificationPreferenceDto, { enabled }))).not.toHaveLength(0);
    expect(await validate(plainToInstance(NotificationPreferenceDto, { enabled: false }))).toHaveLength(0);
    expect(await validate(plainToInstance(NotificationPreferenceDto, { userId: "another" }), { whitelist: true, forbidNonWhitelisted: true })).not.toHaveLength(0);
    expect(await validate(plainToInstance(SubscribePushDto, { endpoint: "test", keys: null }))).not.toHaveLength(0);
  });
  const env = { DATABASE_URL: "postgresql://x:y@localhost/test", JWT_ACCESS_SECRET: "a".repeat(64), JWT_REFRESH_SECRET: "b".repeat(64), CORS_ORIGINS: "http://localhost:3001" };
  it("disables push without keys and rejects partial or mismatched VAPID configuration", () => {
    expect(validateEnvironment(env).PUSH_ENABLED).toBe(false);
    expect(() => validateEnvironment({ ...env, VAPID_PUBLIC_KEY: "invalid" })).toThrow();
    const keys = webpush.generateVAPIDKeys();
    expect(validateEnvironment({ ...env, VAPID_PUBLIC_KEY: keys.publicKey, VAPID_PRIVATE_KEY: keys.privateKey, VAPID_SUBJECT: "mailto:test@example.invalid" }).PUSH_ENABLED).toBe(true);
    expect(() => validateEnvironment({ ...env, VAPID_PUBLIC_KEY: keys.publicKey, VAPID_PRIVATE_KEY: webpush.generateVAPIDKeys().privateKey, VAPID_SUBJECT: "mailto:test@example.invalid" })).toThrow();
  });
  it("builds a real encrypted Web Push request without contacting an external server", () => {
    const vapid = webpush.generateVAPIDKeys(), browser = createECDH("prime256v1"); browser.generateKeys();
    const result = webpush.generateRequestDetails({ endpoint: "https://fcm.googleapis.com/fcm/send/test", keys: { p256dh: browser.getPublicKey().toString("base64url"), auth: randomBytes(16).toString("base64url") } }, JSON.stringify({ body: "A new notification is available." }), { vapidDetails: { subject: "mailto:test@example.invalid", ...vapid }, TTL: 60 });
    expect(result.headers["Content-Encoding"]).toBe("aes128gcm");
    expect(result.headers.Authorization).toMatch(/^vapid /);
    expect(result.body).toBeInstanceOf(Buffer);
    expect(result.body!.includes(Buffer.from("A new notification"))).toBe(false);
  });
});
