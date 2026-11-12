"use client";
import { create } from "zustand";
import { notificationsService, type AppNotification } from "@/services/notifications.service";
import { usePreferences } from "./preferences";
let epoch = 0;
let requestVersion = 0;
export const useNotifications = create<{
  owner: string | null;
  items: AppNotification[];
  unreadCount: number;
  nextCursor: string | null;
  loading: boolean;
  error: string | null;
  reset: (owner?: string | null) => void;
  consumed: (id: string, unreadCount: number) => void;
  sync: (more?: boolean) => Promise<void>;
}>((set, get) => ({
  owner: null,
  items: [],
  unreadCount: 0,
  nextCursor: null,
  loading: false,
  error: null,
  reset: (owner = null) => {
    epoch++;
    set({ owner, items: [], unreadCount: 0, nextCursor: null, loading: false, error: null });
  },
  consumed: (id, unreadCount) => {
    requestVersion++;
    set((state) => ({ items: state.items.filter((item) => item.id !== id), unreadCount, nextCursor: null, loading: false }));
  },
  sync: async (more = false) => {
    const owner = get().owner,
      version = epoch,
      request = ++requestVersion;
    if (!owner) return;
    set({ loading: true });
    try {
      const page = await notificationsService.list(
        more ? (get().nextCursor ?? undefined) : undefined,
        usePreferences.getState().language,
      );
      if (version !== epoch || request !== requestVersion || owner !== get().owner) return;
      set((state) => ({
        items: more
          ? [...new Map([...state.items, ...page.items].map((item) => [item.id, item])).values()]
          : page.items,
        unreadCount: page.unreadCount,
        nextCursor: page.nextCursor,
        error: null,
      }));
    } catch (reason) {
      if (version === epoch && request === requestVersion)
        set({ error: reason instanceof Error ? reason.message : "Une erreur est survenue." });
    } finally {
      if (version === epoch && request === requestVersion) set({ loading: false });
    }
  },
}));
