"use client";
import { useEffect, useRef } from "react";
import { Toaster } from "sonner";
import { useCommunity } from "@/stores/community";
import { api } from "@/services/api-client";
import { RealtimeService } from "@/services/realtime.service";
import { BrandLogo } from "@/components/brand-logo";
import { PwaUpdates } from "@/components/pwa/updates";
import { PreferenceEffects } from "@/components/preference-effects";
import { useCopy } from "@/lib/i18n";
import { NotificationsProvider } from "@/components/notifications/notifications-provider";
import { useNotifications } from "@/stores/notifications";
import { usePathname } from "next/navigation";
export function Providers({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  if (pathname === "/install") return <>{children}<PreferenceEffects /><PwaUpdates /><Toaster richColors /></>;
  return <SessionProviders>{children}</SessionProviders>;
}
function SessionProviders({ children }: { children: React.ReactNode }) {
  const store = useCommunity();
  const { t, error } = useCopy();
  const realtime = useRef<RealtimeService | null>(null);
  const userId = store.session?.userId;
  const groupIds = JSON.stringify(store.groups.map((g) => g.id));
  useEffect(() => {
    const unsubscribe = api.onExpired(() => useCommunity.getState().clear());
    void useCommunity.getState().restore();
    const channel =
      typeof BroadcastChannel !== "undefined" ? new BroadcastChannel("chtaw-auth") : null;
    if (channel)
      channel.onmessage = () => {
        useCommunity.getState().clear();
        void useCommunity.getState().restore();
      };
    const online = () => {
      if (useCommunity.getState().session)
        void useCommunity
          .getState()
          .catchUp()
          .catch(() => {});
      else void useCommunity.getState().restore();
    };
    const storage = (event: StorageEvent) => {
      if (event.key !== "chtaw-signed-out") return;
      useCommunity.getState().clear();
      void useCommunity.getState().restore();
    };
    window.addEventListener("storage", storage);
    window.addEventListener("online", online);
    const timer = setInterval(() => {
      if (document.visibilityState === "visible" && useCommunity.getState().session)
        void useCommunity.getState().sync();
    }, 15000);
    return () => {
      unsubscribe();
      channel?.close();
      clearInterval(timer);
      window.removeEventListener("online", online);
      window.removeEventListener("storage", storage);
    };
  }, []);
  useEffect(() => {
    if (!userId) return;
    const state = () => useCommunity.getState();
    const connection = new RealtimeService({
      message: (m) => state().receiveMessage(m),
      messageDeleted: (id) => state().removeMessage(id),
      poll: (p) => state().receivePoll(p),
      pollDeleted: (id) => { state().removePoll(id); void state().sync(); },
      group: (g) => state().receiveGroup(g),
      removed: (id) => state().removeGroup(id),
      deleted: (id) => state().removeUser(id),
      membership: () => {
        void state().sync();
      },
      reviewed: () => {
        void state().sync();
      },
      reconnected: async () => { await state().catchUp(); await useNotifications.getState().sync(); },
      notification: () => { void useNotifications.getState().sync(); },
      status: (connection) => useCommunity.setState({ connection }),
    });
    realtime.current = connection;
    connection.setGroups(state().groups.map((g) => g.id));
    connection.start();
    return () => {
      connection.stop();
      realtime.current = null;
    };
  }, [userId]);
  useEffect(() => {
    realtime.current?.setGroups(JSON.parse(groupIds) as string[]);
  }, [groupIds]);
  return (
    <>
      {store.ready ? (
        children
      ) : (
        <div className="boot">
          <BrandLogo />
          <p>Team Chtaw</p>
          <div className="skeleton" />
          <span>{t("Restauration de votre session…")}</span>
        </div>
      )}
      {store.error && (
        <div className="network-banner" role="alert">
          {error(store.error)}
          <button
            onClick={() => {
              if (store.session) void store.sync();
              else void store.restore();
            }}
          >
            {t("Réessayer")}
          </button>
        </div>
      )}
      <NotificationsProvider />
      <PreferenceEffects />
      <PwaUpdates />
      <Toaster richColors position="top-center" />
    </>
  );
}
