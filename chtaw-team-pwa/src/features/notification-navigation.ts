import { destination } from "@/lib/utils";
export const validNotificationId = (id: string) => /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(id);
export function notificationLoginPath(search: string) {
  const id = new URLSearchParams(search).get("open");
  return id && validNotificationId(id) ? `/login?notification=${encodeURIComponent(id)}` : "/login";
}
export function notificationLoginDestination(user: { status: string; role: string; emailVerified?: boolean }, search: string) {
  const normal = destination(user);
  const id = new URLSearchParams(search).get("notification");
  return ["/app", "/admin", "/collaborator"].includes(normal) && id && validNotificationId(id) ? `/app/notifications?open=${encodeURIComponent(id)}` : normal;
}
export function validNotificationTarget(href: string) {
  return /^\/(app|admin|collaborator)\//.test(href) && !href.includes("\\") && !href.startsWith("//");
}
