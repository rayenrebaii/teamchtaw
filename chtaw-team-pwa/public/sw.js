const CACHE = "chtaw-public-v8";
const CORE = ["/branding/chtaw-logo.png", "/offline.html", "/manifest.webmanifest", "/icons/icon-192.png", "/icons/icon-512.png", "/icons/maskable-512.png", "/icons/apple-touch-icon.png", "/images/team.svg"];
const publicPath = (path) => CORE.includes(path) || path.startsWith("/_next/static/") || path.startsWith("/icons/");
const cacheable = (response) => response.ok && !/(?:no-store|private)/i.test(response.headers.get("Cache-Control") || "");
self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then(async (cache) => {
    await Promise.all(CORE.map(async (path) => {
      const response = await fetch(path, { cache: "no-store" });
      if (!cacheable(response)) throw new Error("Public offline resource unavailable");
      await cache.put(path, response);
    }));
  }));
});
self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((names) => Promise.all(names.filter((name) => name.startsWith("chtaw-") && name !== CACHE).map((name) => caches.delete(name)))).then(() => self.clients.claim()));
});
self.addEventListener("message", (event) => {
  if (event.data?.type === "UNBIND_PUSH") event.waitUntil(pushBinding(null).then(() => self.registration.getNotifications()).then((items) => items.forEach((item) => item.close())).catch(() => undefined));
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
  if (event.data?.type === "CLEAR_PRIVATE_CACHE") {
    event.waitUntil(caches.keys().then(async (names) => {
      await Promise.all(names.filter((name) => name.startsWith("chtaw-") && name !== CACHE).map((name) => caches.delete(name)));
      const cache = await caches.open(CACHE);
      await Promise.all((await cache.keys()).filter((request) => !publicPath(new URL(request.url).pathname)).map((request) => cache.delete(request)));
    }));
  }
});
self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin || url.pathname.startsWith("/api/") || url.pathname.startsWith("/downloads/") || request.headers.get("Authorization") || request.headers.get("RSC") === "1" || url.searchParams.has("_rsc")) return;
  if (url.pathname === "/manifest.webmanifest") {
    event.respondWith(fetch(request, { cache: "no-store" }).catch(() => caches.match(request)));
    return;
  }
  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(async () => (await caches.match("/offline.html")) || new Response("Connexion requise.", { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } })));
    return;
  }
  if (!publicPath(url.pathname)) return;
  event.respondWith(caches.match(request).then((cached) => cached || fetch(request).then((response) => {
    if (cacheable(response)) {
      const copy = response.clone();
      event.waitUntil(caches.open(CACHE).then((cache) => cache.put(request, copy)));
    }
    return response;
  })));
});


function pushBinding(value) {
  return new Promise((resolve, reject) => {
    const opening = indexedDB.open("chtaw-push-device", 1);
    opening.onupgradeneeded = () => { if (!opening.result.objectStoreNames.contains("state")) opening.result.createObjectStore("state"); };
    opening.onerror = () => reject(new Error("Push binding unavailable"));
    opening.onsuccess = () => {
      const db = opening.result;
      const tx = db.transaction("state", value === undefined ? "readonly" : "readwrite");
      const request = value === undefined ? tx.objectStore("state").get("binding") : tx.objectStore("state").put(value, "binding");
      tx.oncomplete = () => { db.close(); resolve(value === undefined ? request.result : value); };
      tx.onerror = () => { db.close(); reject(new Error("Push binding unavailable")); };
    };
  });
}
self.addEventListener("push", (event) => {
  event.waitUntil((async () => {
    let payload;
    try { payload = event.data?.json(); } catch { return; }
    if (!payload || typeof payload.binding !== "string" || !/^[a-f0-9-]{36}$/i.test(payload.id || "")) return;
    const binding = await pushBinding().catch(() => null);
    if (!binding || binding.binding !== payload.binding) return;
    await self.registration.showNotification("Team Chtaw", {
      body: typeof payload.body === "string" ? payload.body.slice(0, 200) : "Une nouvelle notification est disponible.",
      icon: "/icons/icon-192.png", badge: "/icons/icon-192.png", tag: "chtaw-" + payload.id,
      data: { notificationId: payload.id, binding: payload.binding },
    });
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    windows.forEach((client) => client.postMessage({ type: "NOTIFICATION_CHANGED" }));
  })());
});
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil((async () => {
    const binding = await pushBinding().catch(() => null);
    if (!binding || event.notification.data?.binding !== binding.binding) return;
    const id = event.notification.data?.notificationId;
    if (!/^[a-f0-9-]{36}$/i.test(id || "")) return;
    const target = "/app/notifications?open=" + encodeURIComponent(id);
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const client = windows.find((item) => new URL(item.url).origin === self.location.origin);
    if (client) { await client.navigate(target); await client.focus(); }
    else await self.clients.openWindow(target);
  })());
});
