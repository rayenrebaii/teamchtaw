export async function clearPrivateCaches() {
  if (typeof caches === "undefined") return;
  try {
    const names = await caches.keys();
    await Promise.all(names.filter((name) => name.startsWith("chtaw-") && name !== "chtaw-public-v7").map((name) => caches.delete(name)));
    navigator.serviceWorker?.controller?.postMessage({ type: "CLEAR_PRIVATE_CACHE" });
  } catch { console.warn("Nettoyage du cache PWA à retenter."); }
}
