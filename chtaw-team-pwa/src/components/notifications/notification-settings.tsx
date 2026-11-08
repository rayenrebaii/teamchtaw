"use client";
import { useEffect, useState } from "react";
import { useCommunity } from "@/stores/community";
import { useCopy } from "@/lib/i18n";
import {
  notificationsService,
  pushCapability,
  activeDeviceBinding,
  enableSystemNotifications,
  disableSystemNotifications,
  type NotificationPreferences,
} from "@/services/notifications.service";
import { Button } from "@/components/ui/button";
export function NotificationSettings() {
  const user = useCommunity((state) =>
    state.users.find((member) => member.id === state.session?.userId),
  );
  const { t, error, language } = useCopy();
  const [state, setState] = useState<{
    owner: string;
    preferences: NotificationPreferences;
    config: { enabled: boolean; publicKey: string };
  }>();
  const [failure, setFailure] = useState<string>();
  const [revision, setRevision] = useState(0),
    [busy, setBusy] = useState(false),
    [device, setDevice] = useState(false);
  useEffect(() => {
    if (!user) return;
    let active = true;
    void Promise.all([
      notificationsService.preferences(),
      notificationsService.config(),
      activeDeviceBinding().catch(() => null),
    ])
      .then(([preferences, config, binding]) => {
        if (active) {
          setState({ owner: user.id, preferences, config });
          setFailure(undefined);
          setDevice(
            binding?.userId === user.id &&
              typeof Notification !== "undefined" &&
              Notification.permission === "granted",
          );
        }
      })
      .catch((reason: unknown) => {
        if (active)
          setFailure(reason instanceof Error ? reason.message : "Une erreur est survenue.");
      });
    return () => {
      active = false;
    };
  }, [user, revision]);
  if (!user) return null;
  const data = state?.owner === user.id ? state : undefined;
  const update = async (key: keyof NotificationPreferences, checked: boolean) => {
    if (!data || busy) return;
    setBusy(true);
    try {
      const preferences = await notificationsService.updatePreferences({ [key]: checked });
      setState({ ...data, preferences });
      setFailure(undefined);
    } catch (reason) {
      setFailure(reason instanceof Error ? reason.message : "Une erreur est survenue.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="panel notification-settings">
      <h2>{t("Notifications")}</h2>
      {failure && (
        <div role="alert">
          <p>{error(failure)}</p>
          <Button variant="secondary" onClick={() => setRevision((value) => value + 1)}>
            {t("Réessayer")}
          </Button>
        </div>
      )}
      {!data && !failure && <p role="status">{t("Chargement…")}</p>}
      {data && (
        <>
          {(
            [
              { key: "enabled", label: t("Activer les notifications") },
              { key: "messagesEnabled", label: t("Notifications des messages") },
              { key: "pollsEnabled", label: t("Notifications des sondages") },
              ...(user.role === "USER"
                ? [{ key: "sessionRemindersEnabled", label: t("Rappels de séances") }]
                : []),
            ] as { key: keyof NotificationPreferences; label: string }[]
          ).map(({ key, label }) => (
            <label className="setting-row" key={key}>
              <span>{label}</span>
              <input
                type="checkbox"
                checked={!!data.preferences[key]}
                disabled={busy || (key !== "enabled" && !data.preferences.enabled)}
                onChange={(event) => void update(key, event.target.checked)}
              />
            </label>
          ))}
          <p className="tiny muted">
            {t(
              "Les préférences sont enregistrées sur votre compte. L’autorisation système concerne uniquement cet appareil.",
            )}
          </p>
          {!data.config.enabled && (
            <p className="muted">{t("Les notifications système ne sont pas configurées.")}</p>
          )}
          {!pushCapability() && (
            <p className="muted">
              {t(
                "Notifications système incompatibles sur cet appareil. Sur iOS, installez d’abord la PWA sur l’écran d’accueil.",
              )}
            </p>
          )}
          {typeof Notification !== "undefined" && Notification.permission === "denied" && (
            <p role="status">
              {t("Autorisation refusée. Modifiez les réglages de votre navigateur.")}
            </p>
          )}
          {device && <p role="status">{t("Notifications système actives sur cet appareil")}</p>}
          <Button
            variant="secondary"
            disabled={busy || (!device && (!data.config.enabled || !pushCapability()))}
            onClick={() => {
              if (busy) return;
              setBusy(true);
              const operation = device
                ? disableSystemNotifications()
                : enableSystemNotifications(data.config.publicKey, language);
              void operation
                .then(() => {
                  setDevice(!device);
                  setFailure(undefined);
                })
                .catch((reason: unknown) =>
                  setFailure(reason instanceof Error ? reason.message : "Une erreur est survenue."),
                )
                .finally(() => setBusy(false));
            }}
          >
            {device
              ? t("Désactiver sur cet appareil")
              : t("Autoriser les notifications système sur cet appareil")}
          </Button>
        </>
      )}
    </section>
  );
}
