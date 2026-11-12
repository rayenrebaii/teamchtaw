"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bell } from "lucide-react";
import { useCommunity } from "@/stores/community";
import { useNotifications } from "@/stores/notifications";
import { notificationsService } from "@/services/notifications.service";
import { useCopy } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/dialog";
import { attempt } from "@/components/shared";
import { openNotification } from "@/services/notification-open";
import { validNotificationId } from "@/features/notification-navigation";
function NotificationItems({ compact = false, close }: { compact?: boolean; close?: () => void }) {
  const store = useNotifications(),
    community = useCommunity(),
    router = useRouter();
  const { t, locale, error } = useCopy();
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const current = store.owner === community.session?.userId;
  const allowed = new Set(community.groups.map((group) => group.id));
  const items = current
    ? store.items.filter((item) => allowed.has(item.groupId)).slice(0, compact ? 6 : undefined)
    : [];
  return (
    <div className="notification-center">
      <div className="row wrap between">
        {!compact && <h2>{t("Notifications")}</h2>}
        <Button
          size="sm"
          variant="secondary"
          disabled={busy || !current || !store.unreadCount}
          onClick={() => {
            setBusy(true);
            void attempt(async () => {
              await notificationsService.readAll();
              await store.sync();
            }).finally(() => setBusy(false));
          }}
        >
          {t("Tout marquer comme lu")}
        </Button>
      </div>
      {store.error && current && (
        <div role="alert">
          <p>{error(store.error)}</p>
          <Button onClick={() => void store.sync()}>{t("Réessayer")}</Button>
        </div>
      )}
      {store.loading && !items.length && <p role="status">{t("Chargement…")}</p>}
      {!store.loading && !items.length && <p className="muted">{t("Aucune notification")}</p>}
      <ul className="notification-list">
        {items.map((item) => (
          <li className={item.readAt ? "" : "notification-unread"} key={item.id}>
            <span className="eyebrow">
              {item.type === "MESSAGE"
                ? t("Messages")
                : item.type === "ABSENCE_ALERT"
                  ? t("Signalements")
                : item.type === "POLL"
                  ? t("Sondages")
                  : t("Rappels de séances")}
            </span>
            <button
              className="notification-open"
              disabled={busy}
              onClick={() => {
                const owner = community.session?.userId;
                if (!owner || pending.current) return;
                pending.current = true; setBusy(true);
                void attempt(async () => {
                  const href = await openNotification(item.id, owner);
                  if (useCommunity.getState().session?.userId !== owner) return;
                  close?.();
                  router.push(href);
                  void useNotifications.getState().sync();
                }).finally(() => { pending.current = false; setBusy(false); });
              }}
            >
              <strong>{item.title}</strong>
              <span>{item.body}</span>
            </button>
            <div className="row wrap between">
              <time dateTime={item.createdAt}>
                {new Date(item.createdAt).toLocaleString(locale)}
              </time>
              <span>{item.readAt ? t("Lue") : t("Non lue")}</span>
            </div>
            {!item.readAt && (
              <Button
                size="sm"
                variant="ghost"
                disabled={busy}
                onClick={() => {
                  void attempt(async () => {
                    await notificationsService.read(item.id);
                    await store.sync();
                  });
                }}
              >
                {t("Marquer comme lue")}
              </Button>
            )}
          </li>
        ))}
      </ul>
      {compact ? (
        <Button variant="secondary" asChild>
          <Link href="/app/notifications" onClick={close}>
            {t("Afficher toutes les notifications")}
          </Link>
        </Button>
      ) : (
        store.nextCursor && (
          <Button disabled={store.loading} onClick={() => void store.sync(true)}>
            {t("Charger davantage")}
          </Button>
        )
      )}
    </div>
  );
}
export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const store = useNotifications(),
    owner = useCommunity((state) => state.session?.userId);
  const { t } = useCopy();
  const count = store.owner === owner ? store.unreadCount : 0;
  return (
    <>
      <button
        className="icon-button notification-bell"
        aria-label={t("Notifications")}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        <Bell size={21} />
        <span className="sr-only">{t("{count} notifications non lues", { count })}</span>
        {count > 0 && (
          <b className="notification-count" aria-hidden="true">
            {count > 99 ? "99+" : count}
          </b>
        )}
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title={t("Notifications")}>
        <NotificationItems compact close={() => setOpen(false)} />
      </Modal>
    </>
  );
}
export function NotificationsPage({ openId }: { openId?: string }) {
  const router = useRouter(),
    owner = useCommunity((state) => state.session?.userId);
  const { t, error: failure } = useCopy();
  const [retry, setRetry] = useState(0);
  const [result, setResult] = useState<{ key: string; error: string }>();
  const key = `${owner}:${openId}:${retry}`;
  const error = result?.key === key ? result.error : "";
  useEffect(() => {
    if (!owner || !openId || !validNotificationId(openId)) return;
    let active = true;
    void openNotification(openId, owner).then((href) => {
      if (!active || useCommunity.getState().session?.userId !== owner) return;
      router.replace(href);
      void useNotifications.getState().sync();
    }).catch((reason: unknown) => {
      if (active && useCommunity.getState().session?.userId === owner)
        setResult({ key, error: reason instanceof Error ? reason.message : "Contenu indisponible." });
    });
    return () => { active = false; };
  }, [openId, owner, router, key]);
  return (
    <div className="account-page">
      {openId && validNotificationId(openId) && !error && <p role="status">{t("Ouverture de la notification…")}</p>}
      {error && <div role="alert"><p>{failure(error)}</p><Button onClick={() => setRetry((value) => value + 1)}>{t("Réessayer")}</Button></div>}
      <NotificationItems />
    </div>
  );
}
