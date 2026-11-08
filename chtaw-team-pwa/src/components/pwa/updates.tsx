"use client";
import { useEffect, useState } from "react";
import { useCopy } from "@/lib/i18n";
export function PwaUpdates() {
  const { t } = useCopy();
  const [registration, setRegistration] = useState<ServiceWorkerRegistration | null>(null);
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!("serviceWorker" in navigator) || process.env.NODE_ENV !== "production") return;
    let active = true;
    let cleanup = () => {};
    void navigator.serviceWorker.register("/sw.js").then((value) => {
      if (!active) return;
      setRegistration(value);
      setError(false);
      const check = () => {
        if (active && value.waiting && navigator.serviceWorker.controller) setWaiting(value.waiting);
      };
      const update = () => {
        check();
        const installing = value.installing;
        installing?.addEventListener("statechange", check);
      };
      check();
      value.addEventListener("updatefound", update);
      const timer = setInterval(() => { void value.update().catch(() => { if (active) setError(true); }); }, 3600000);
      cleanup = () => { clearInterval(timer); value.removeEventListener("updatefound", update); };
    }).catch(() => { if (active) setError(true); });
    return () => { active = false; cleanup(); };
  }, [attempt]);
  const apply = () => {
    if (!waiting || !window.confirm(t("Enregistrez vos modifications avant de recharger l’application. Installer la mise à jour maintenant ?"))) return;
    navigator.serviceWorker.addEventListener("controllerchange", () => window.location.reload(), { once: true });
    waiting.postMessage({ type: "SKIP_WAITING" });
    setWaiting(null);
  };
  if (waiting) return <div className="pwa-notice" role="status">{t("Une mise à jour est disponible.")}<button onClick={apply}>{t("Mettre à jour")}</button><button onClick={() => setWaiting(null)}>{t("Plus tard")}</button></div>;
  if (error) return <div className="pwa-notice" role="status">{t("La protection hors ligne n’a pas pu être actualisée.")}<button onClick={() => { if (registration) void registration.update().then(() => setError(false)).catch(() => setError(true)); else setAttempt((value) => value + 1); }}>{t("Réessayer")}</button></div>;
  return null;
}
