import { isIP } from "node:net";
export const defaultPreferences = {
  enabled: true,
  messagesEnabled: true,
  pollsEnabled: true,
  sessionRemindersEnabled: true,
};
export function permits(preference: typeof defaultPreferences | null, type: string) {
  const value = preference ?? defaultPreferences;
  return (
    value.enabled &&
    (type === "MESSAGE"
      ? value.messagesEnabled
      : type === "POLL"
        ? value.pollsEnabled
        : value.sessionRemindersEnabled)
  );
}
export function validPushEndpoint(endpoint: string, extraOrigins: string[] = []) {
  try {
    const url = new URL(endpoint);
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.hash ||
      (url.port && url.port !== "443") ||
      isIP(url.hostname) ||
      url.hostname === "localhost"
    )
      return false;
    return (
      extraOrigins.includes(url.origin) ||
      ["fcm.googleapis.com", "updates.push.services.mozilla.com", "web.push.apple.com"].includes(
        url.hostname,
      ) ||
      url.hostname.endsWith(".notify.windows.com") ||
      url.hostname.endsWith(".push.services.mozilla.com")
    );
  } catch {
    return false;
  }
}
export function reminderPlan(startsAt: Date, changedAt: Date, createdAt: Date, now: Date) {
  return [
    { type: "SESSION_24H", offset: 86400000 },
    { type: "SESSION_1H", offset: 3600000 },
  ].map(({ type, offset }) => {
    const scheduledFor = new Date(startsAt.getTime() - offset);
    return {
      type,
      scheduledFor,
      status:
        scheduledFor < now || createdAt > scheduledFor || changedAt > scheduledFor
          ? "SKIPPED"
          : "PENDING",
    };
  });
}
