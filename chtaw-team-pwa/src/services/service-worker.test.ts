import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";
function worker() {
  const handlers: Record<string, (event: unknown) => void> = {};
  const stored = new Map<string, Response>();
  const removed: string[] = [];
  let online = true;
  let header = "public";
  let skipped = 0;
  let binding: unknown = null;
  const displayed: { title: string; options: Record<string, unknown> }[] = [];
  const opened: string[] = [];
  let closed = 0;
  const db = {
    objectStoreNames: { contains: () => true },
    close: () => {},
    transaction: () => {
      const tx = { oncomplete: () => {}, objectStore: () => ({
        get: () => { const request = { result: binding }; queueMicrotask(() => tx.oncomplete()); return request; },
        put: (value: unknown) => { binding = value; queueMicrotask(() => tx.oncomplete()); return {}; },
      }) };
      return tx;
    },
  };
  const cache = {
    put: async (key: string | Request, response: Response) => stored.set(typeof key === "string" ? key : key.url, response),
    keys: async () => [...stored.keys()].map((key) => new Request(new URL(key, "https://app.test"))),
    delete: async (request: Request) => stored.delete(new URL(request.url).pathname),
  };
  const context = {
    URL, Response,
    indexedDB: { open: () => { const request = { result: db, onsuccess: () => {} }; queueMicrotask(() => request.onsuccess()); return request; } },
    self: { location: { origin: "https://app.test" }, addEventListener: (name: string, handler: (event: unknown) => void) => { handlers[name] = handler; }, skipWaiting: () => { skipped++; }, registration: { showNotification: async (title: string, options: Record<string, unknown>) => { displayed.push({ title, options }); }, getNotifications: async () => [{ close: () => { closed++; } }] }, clients: { claim: async () => {}, matchAll: async () => [], openWindow: async (path: string) => { opened.push(path); } } },
    caches: { open: async () => cache, match: async (key: string | Request) => stored.get(typeof key === "string" ? key : key.url), keys: async () => ["chtaw-static-v4", "other-app", "chtaw-public-v6", "chtaw-public-v7", "chtaw-public-v8"], delete: async (name: string) => { removed.push(name); } },
    fetch: async () => { if (!online) throw Error("offline"); return new Response("public", { headers: { "Cache-Control": header } }); },
  };
  runInNewContext(readFileSync(new URL("../../public/sw.js", import.meta.url), "utf8"), context);
  async function run(name: string, extra: object = {}) {
    const pending: Promise<unknown>[] = [];
    let response: Promise<Response> | undefined;
    handlers[name]({ waitUntil: (promise: Promise<unknown>) => pending.push(promise), respondWith: (promise: Promise<Response>) => { response = promise; }, ...extra });
    const result = response ? await response : undefined;
    await Promise.all(pending);
    return result;
  }
  const request = (path: string, mode = "navigate", method = "GET", headers = {}) => ({ url: "https://app.test" + path, mode, method, headers: new Headers(headers) });
  return { stored, removed, run, request, displayed, opened, bind: (value: unknown) => { binding = value; }, closed: () => closed, skipped: () => skipped, offline: () => { online = false; }, noStore: () => { header = "no-store"; } };
}
describe("Cache PWA et cycle de vie", () => {
  const id = "00000000-0000-4000-8000-000000000001";
  it("displays push only for this device's current account binding", async () => {
    const sw = worker(); sw.bind({ binding: "device-a" });
    await sw.run("push", { data: { json: () => ({ id, binding: "device-a", body: "A new notification is available." }) } });
    expect(sw.displayed).toHaveLength(1);
    expect(sw.displayed[0]).toMatchObject({ title: "Team Chtaw", options: { tag: "chtaw-" + id, data: { notificationId: id, binding: "device-a" } } });
    sw.bind({ binding: "device-b" });
    await sw.run("push", { data: { json: () => ({ id, binding: "device-a" }) } });
    expect(sw.displayed).toHaveLength(1);
  });
  it("clears displayed notifications on logout and ignores later pushes", async () => {
    const sw = worker(); sw.bind({ binding: "device-a" });
    await sw.run("message", { data: { type: "UNBIND_PUSH" } });
    expect(sw.closed()).toBe(1);
    await sw.run("push", { data: { json: () => ({ id, binding: "device-a" }) } });
    expect(sw.displayed).toEqual([]);
  });
  it("opens a fixed internal route for a valid notification click", async () => {
    const sw = worker(); sw.bind({ binding: "device-a" });
    await sw.run("notificationclick", { notification: { close: () => {}, data: { binding: "device-a", notificationId: id, url: "https://evil.test" } } });
    expect(sw.opened).toEqual(["/app/notifications?open=" + id]);
  });
  it("ignores malformed pushes and clicks for another account", async () => {
    const sw = worker(); sw.bind({ binding: "device-b" });
    await sw.run("push", { data: { json: () => { throw Error("Invalid"); } } });
    await sw.run("push", { data: { json: () => ({ binding: "device-b", id: "https://evil.test" }) } });
    await sw.run("notificationclick", { notification: { close: () => {}, data: { binding: "device-a", notificationId: id } } });
    expect(sw.displayed).toEqual([]); expect(sw.opened).toEqual([]);
  });
  it("précharge les ressources publiques, sans activation forcée", async () => {
    const sw = worker(); await sw.run("install");
    expect(sw.stored.has("/offline.html")).toBe(true); expect(sw.skipped()).toBe(0);
    await sw.run("message", { data: { type: "SKIP_WAITING" } }); expect(sw.skipped()).toBe(1);
  });
  it("ne conserve jamais le HTML et retourne la page publique hors ligne", async () => {
    const sw = worker(); await sw.run("install"); sw.noStore();
    await sw.run("fetch", { request: sw.request("/app/profile") });
    expect(sw.stored.has("/app/profile")).toBe(false);
    sw.offline(); expect((await sw.run("fetch", { request: sw.request("/app/profile") }))?.status).toBe(200);
  });
  it("ne conserve pas les ressources no-store", async () => {
    const sw = worker(); sw.noStore(); await sw.run("fetch", { request: sw.request("/_next/static/test.js", "cors") });
    expect(sw.stored.size).toBe(0);
  });
  it.each(["/api/v1/auth/me", "/app?_rsc=1", "/downloads/Team-Chtaw.html"])("laisse le réseau gérer %s", async (path) => {
    const sw = worker(); expect(await sw.run("fetch", { request: sw.request(path, "cors") })).toBeUndefined();
  });
  it("nettoie les caches anciens sans toucher aux autres applications", async () => {
    const sw = worker(); await sw.run("activate"); expect(sw.removed).toEqual(["chtaw-static-v4", "chtaw-public-v6", "chtaw-public-v7"]);
    sw.stored.set("/app/profile", new Response("private"));
    await sw.run("message", { data: { type: "CLEAR_PRIVATE_CACHE" } });
    expect(sw.stored.has("/app/profile")).toBe(false);
  });
});
