import { api } from "./api-client";
export interface AppNotification {
  id: string;
  groupId: string;
  groupName: string;
  type: "MESSAGE" | "POLL" | "SESSION_24H" | "SESSION_1H" | "ABSENCE_ALERT";
  title: string;
  body: string;
  entityId: string;
  optionId: string | null;
  createdAt: string;
  readAt: string | null;
}
export interface NotificationPreferences {
  enabled: boolean;
  messagesEnabled: boolean;
  pollsEnabled: boolean;
  sessionRemindersEnabled?: boolean;
}
export const notificationsService = {
  list: (cursor?: string, language = "fr") =>
    api.request<{ items: AppNotification[]; nextCursor: string | null; unreadCount: number }>(
      "/notifications?limit=20&language=" + encodeURIComponent(language) + (cursor ? "&cursor=" + encodeURIComponent(cursor) : ""),
    ),
  read: (id: string) =>
    api.request<{ unreadCount: number }>(`/notifications/${encodeURIComponent(id)}/read`, {
      method: "PATCH",
    }),
  readAll: () =>
    api.request<{ unreadCount: number }>("/notifications/read-all", { method: "PATCH" }),
  target: (id: string) =>
    api.request<{ href: string }>(`/notifications/${encodeURIComponent(id)}/target`),
  open: (id: string) =>
    api.request<{ href: string; unreadCount: number }>(`/notifications/${encodeURIComponent(id)}/open`, { method: "POST" }),
  preferences: () => api.request<NotificationPreferences>("/notifications/preferences"),
  updatePreferences: (values: Partial<NotificationPreferences>) =>
    api.request<NotificationPreferences>("/notifications/preferences", {
      method: "PATCH",
      body: JSON.stringify(values),
    }),
  config: () => api.request<{ enabled: boolean; publicKey: string }>("/notifications/push-config"),
  subscriptions: () =>
    api.request<{ id: string; binding: string }[]>("/notifications/subscriptions"),
  subscribe: (data: {
    endpoint: string;
    keys: { p256dh: string; auth: string };
    language: string;
  }) =>
    api.request<{ id: string; binding: string; userId: string }>("/notifications/subscriptions", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  unsubscribe: (id: string) =>
    api.request<void>("/notifications/subscriptions/" + encodeURIComponent(id), {
      method: "DELETE",
    }),
};
interface DeviceBinding {
  userId: string;
  binding: string;
  id: string;
}
let generation = 0;
export async function deviceBinding(value?: DeviceBinding | null): Promise<DeviceBinding | null> {
  if (typeof indexedDB === "undefined") return null;
  return new Promise((resolve, reject) => {
    const opening = indexedDB.open("chtaw-push-device", 1);
    opening.onupgradeneeded = () => {
      if (!opening.result.objectStoreNames.contains("state"))
        opening.result.createObjectStore("state");
    };
    opening.onerror = () => reject(Error("Stockage des notifications indisponible."));
    opening.onsuccess = () => {
      const db = opening.result;
      const tx = db.transaction("state", value === undefined ? "readonly" : "readwrite");
      const store = tx.objectStore("state");
      const request = value === undefined ? store.get("binding") : store.put(value, "binding");
      tx.oncomplete = () => {
        db.close();
        resolve(value === undefined ? ((request.result ?? null) as DeviceBinding | null) : value);
      };
      tx.onerror = () => {
        db.close();
        reject(Error("Stockage des notifications indisponible."));
      };
    };
  });
}
export async function clearDeviceBinding() {
  generation++;
  await deviceBinding(null).catch(() => null);
  if (typeof navigator !== "undefined" && "serviceWorker" in navigator) {
    navigator.serviceWorker.controller?.postMessage({ type: "UNBIND_PUSH" });
    const registration = await navigator.serviceWorker.getRegistration().catch(() => undefined);
    const displayed = await registration?.getNotifications().catch(() => []);
    displayed?.forEach((notification) => notification.close());
  }
}
export async function activeDeviceBinding() {
  const binding = await deviceBinding();
  if (
    !binding ||
    typeof Notification === "undefined" ||
    Notification.permission !== "granted" ||
    typeof navigator === "undefined" ||
    !("serviceWorker" in navigator)
  )
    return null;
  const registration = await navigator.serviceWorker.getRegistration();
  if (!registration?.active || !(await registration.pushManager.getSubscription())) return null;
  const owned = await notificationsService.subscriptions();
  return owned.some(
    (subscription) => subscription.id === binding.id && subscription.binding === binding.binding,
  )
    ? binding
    : null;
}
export function pushCapability() {
  return (
    typeof window !== "undefined" &&
    window.isSecureContext &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window &&
    typeof indexedDB !== "undefined"
  );
}
export function vapidBytes(key: string) {
  const value = atob(
    key.replaceAll("-", "+").replaceAll("_", "/") + "=".repeat((4 - (key.length % 4)) % 4),
  );
  return Uint8Array.from(value, (character) => character.charCodeAt(0));
}
export async function enableSystemNotifications(publicKey: string, language: string) {
  if (!pushCapability())
    throw Error(
      "Notifications système incompatibles sur cet appareil. Sur iOS, installez d’abord la PWA sur l’écran d’accueil.",
    );
  if (!publicKey) throw Error("Les notifications système ne sont pas configurées.");
  if (process.env.NODE_ENV !== "production")
    throw Error("Les notifications système nécessitent la version de production de la PWA.");
  const epoch = generation;
  const permission =
    Notification.permission === "default"
      ? await Notification.requestPermission()
      : Notification.permission;
  if (permission !== "granted")
    throw Error("Autorisation refusée. Modifiez les réglages de votre navigateur.");
  const registration = await navigator.serviceWorker.getRegistration();
  if (!registration?.active || !registration.pushManager)
    throw Error("Mettez à jour la PWA avant d’activer les notifications système.");
  const subscription =
    (await registration.pushManager.getSubscription()) ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: vapidBytes(publicKey),
    }));
  const json = subscription.toJSON();
  if (!json.endpoint || !json.keys?.p256dh || !json.keys.auth)
    throw Error("Abonnement Push invalide.");
  const binding = await notificationsService.subscribe({
    endpoint: json.endpoint,
    keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
    language,
  });
  if (epoch !== generation) throw Error("La session a changé.");
  await deviceBinding(binding);
  if (epoch !== generation) {
    await clearDeviceBinding();
    throw Error("La session a changé.");
  }
  return binding;
}
export async function disableSystemNotifications() {
  const previous = await deviceBinding().catch(() => null);
  await clearDeviceBinding();
  if (typeof navigator !== "undefined" && "serviceWorker" in navigator) {
    const registration = await navigator.serviceWorker.getRegistration();
    const subscription = await registration?.pushManager.getSubscription();
    await subscription?.unsubscribe();
  }
  if (previous) await notificationsService.unsubscribe(previous.id);
}
