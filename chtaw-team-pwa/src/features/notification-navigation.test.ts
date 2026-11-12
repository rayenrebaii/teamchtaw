import { afterEach, expect, it, vi } from "vitest";
import { notificationLoginDestination, notificationLoginPath, validNotificationTarget } from "./notification-navigation";
const id = "00000000-0000-4000-8000-000000000001";
afterEach(() => vi.unstubAllEnvs());
it.each(["USER", "ADMIN", "COLLABORATOR"])("preserves a notification source across a normal login for %s", (role) => {
  expect(notificationLoginPath("?open=" + id)).toBe("/login?notification=" + id);
  expect(notificationLoginDestination({ role, status: "APPROVED" }, "?notification=" + id)).toBe("/app/notifications?open=" + id);
});
it("preserves account approval and verification instead of bypassing them", () => {
  expect(notificationLoginDestination({ role: "USER", status: "PENDING" }, "?notification=" + id)).toBe("/pending-approval");
  vi.stubEnv("NEXT_PUBLIC_AUTH_PROVIDER", "firebase");
  expect(notificationLoginDestination({ role: "USER", status: "APPROVED", emailVerified: false }, "?notification=" + id)).toBe("/verify-email");
});
it("rejects external or malformed targets", () => {
  for (const href of ["//evil.test", "https://evil.test", "javascript:alert(1)", "/app/\\evil.test"]) expect(validNotificationTarget(href)).toBe(false);
  expect(notificationLoginPath("?open=https://evil.test")).toBe("/login");
  expect(validNotificationTarget("/app/groups/g?message=m")).toBe(true);
});
