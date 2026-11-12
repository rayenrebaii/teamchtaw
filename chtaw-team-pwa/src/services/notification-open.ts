import { notificationsService } from "./notifications.service";
import { useCommunity } from "@/stores/community";
import { useNotifications } from "@/stores/notifications";
import { validNotificationTarget } from "@/features/notification-navigation";
const flights = new Map<string, Promise<string>>();
export function openNotification(id: string, owner: string): Promise<string> {
  const key = `${owner}:${id}`;
  const existing = flights.get(key);
  if (existing) return existing;
  const opening = (async () => {
    if (useCommunity.getState().session?.userId !== owner) throw Error("La session a changé.");
    const result = await notificationsService.open(id);
    if (useCommunity.getState().session?.userId !== owner) throw Error("La session a changé.");
    if (!validNotificationTarget(result.href)) throw Error("Contenu indisponible.");
    if (useNotifications.getState().owner === owner) useNotifications.getState().consumed(id, result.unreadCount);
    if (typeof navigator !== "undefined" && "serviceWorker" in navigator && typeof navigator.serviceWorker.getRegistration === "function")
      void navigator.serviceWorker.getRegistration().then((registration) => registration?.getNotifications({ tag: "chtaw-" + id })).then((items) => items?.forEach((item) => item.close())).catch(() => undefined);
    return result.href;
  })().finally(() => flights.delete(key));
  flights.set(key, opening);
  return opening;
}
