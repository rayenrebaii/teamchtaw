"use client";
import { useEffect } from "react";
import { useCommunity } from "@/stores/community";
import { useNotifications } from "@/stores/notifications";
import { clearDeviceBinding, deviceBinding } from "@/services/notifications.service";
export function NotificationsProvider() {
  const user = useCommunity((state) =>
    state.users.find((member) => member.id === state.session?.userId),
  );
  const blockedOwner = user && user.status !== "APPROVED" ? user.id : null;
  const owner = user?.status === "APPROVED" ? user.id : null;
  const groups = useCommunity((state) => state.groups);
  const groupKey = groups
    .map((group) => group.id)
    .sort()
    .join(",");
  useEffect(() => {
    useNotifications.getState().reset(owner);
    if (!owner) {
      if (blockedOwner) void clearDeviceBinding();
      return;
    }
    void deviceBinding()
      .then((binding) => {
        if (binding && binding.userId !== owner) void clearDeviceBinding();
      })
      .catch(() => undefined);
    const sync = () => {
      void useNotifications.getState().sync();
    };
    sync();
    const timer = setInterval(sync, 15000);
    window.addEventListener("focus", sync);
    window.addEventListener("online", sync);
    const message = (event: MessageEvent) => {
      if (event.data?.type === "NOTIFICATION_CHANGED") sync();
    };
    navigator.serviceWorker?.addEventListener("message", message);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", sync);
      window.removeEventListener("online", sync);
      navigator.serviceWorker?.removeEventListener("message", message);
      useNotifications.getState().reset();
    };
  }, [owner, blockedOwner]);
  useEffect(() => {
    const allowed = new Set(groupKey.split(","));
    useNotifications.setState((state) => ({
      items: state.items.filter((item) => allowed.has(item.groupId)),
    }));
    if (owner) void useNotifications.getState().sync();
  }, [groupKey, owner]);
  return null;
}
