"use client";
import { create } from "zustand";
import type {
  AuthSession,
  User,
  Group,
  Message,
  Poll,
  MemberSummary,
  DashboardStats,
} from "@/types";
import { api, ApiError } from "@/services/api-client";
import { markSignedOut } from "@/services/session-control";
import { clearPrivateCaches } from "@/services/pwa.service";
import { usePreferences } from "@/stores/preferences";
import { useNotifications } from "@/stores/notifications";
import { clearDeviceBinding } from "@/services/notifications.service";
import { authService } from "@/services/auth.service";
import { groupsService } from "@/services/groups.service";
import { usersService } from "@/services/users.service";
import { messagesService } from "@/services/messages.service";
import { pollsService } from "@/services/polls.service";
import { uploadsService } from "@/services/uploads.service";
export function mergeById<T extends { id: string }>(old: T[], fresh: T[]): T[] {
  const map = new Map(old.map((item) => [item.id, item]));
  for (const item of fresh) map.set(item.id, item);
  return [...map.values()];
}
export function mergeMessages(old: Message[], fresh: Message[]) {
  return mergeById(old, fresh).sort(
    (a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id),
  );
}
interface HistoryState {
  loaded: boolean;
  loading: boolean;
  nextCursor: string | null;
  error?: string;
}
interface Store {
  session: AuthSession | null;
  users: User[];
  people: MemberSummary[];
  groups: Group[];
  messages: Message[];
  polls: Poll[];
  stats: DashboardStats | null;
  history: Record<string, HistoryState>;
  syncErrors: Partial<Record<"groups" | "polls" | "users" | "stats", string>>;
  ready: boolean;
  loading: boolean;
  error: string | null;
  connection: "connecting" | "online" | "offline";
  theme: "light" | "dark";
  restore: () => Promise<void>;
  login: (email: string, password: string) => Promise<User>;
  register: (
    input: Pick<User, "email" | "firstName" | "lastName"> & { password: string },
  ) => Promise<User>;
  logout: () => Promise<void>;
  clear: () => void;
  sync: () => Promise<void>;
  loadHistory: (id: string, older?: boolean) => Promise<void>;
  catchUp: () => Promise<void>;
  review: (id: string, status: "APPROVED" | "REJECTED") => Promise<void>;
  ban: (id: string) => Promise<void>;
  removeUser: (id: string) => void;
  membership: (groupId: string, userId: string, add: boolean) => Promise<void>;
  move: (userId: string, from: string, to: string) => Promise<void>;
  saveGroup: (group: Group) => Promise<Group>;
  groupImage: (id: string, file: File) => Promise<void>;
  deleteGroup: (id: string) => Promise<void>;
  post: (groupId: string, text: string) => Promise<void>;
  photo: (
    groupId: string,
    file: File,
    caption: string,
    progress?: (n: number) => void,
  ) => Promise<void>;
  publishPoll: (poll: Poll) => Promise<void>;
  vote: (id: string, options: string[], replace?: boolean) => Promise<void>;
  profile: (values: Pick<User, "firstName" | "lastName" | "bio">) => Promise<void>;
  receiveMessage: (message: Message) => void;
  receivePoll: (poll: Poll) => void;
  removePoll: (id: string) => void;
  receiveGroup: (group: Group) => void;
  removeGroup: (id: string) => void;
  toggleTheme: () => void;
}
const empty = {
  session: null,
  users: [],
  people: [],
  groups: [],
  messages: [],
  polls: [],
  stats: null,
  history: {},
  syncErrors: {},
  connection: "offline" as const,
};
let syncFlight: Promise<void> | null = null;
let syncAgain = false;
let revision = 0;
let restoreFlight: Promise<void> | null = null;
function announce() {
  if (typeof BroadcastChannel !== "undefined") {
    const channel = new BroadcastChannel("chtaw-auth");
    channel.postMessage("changed");
    channel.close();
  }
}
export const useCommunity = create<Store>((set, get) => ({
  ...empty,
  ready: false,
  loading: false,
  error: null,
  theme: "light",
  clear: () => {
    revision++;
    api.clear();
    useNotifications.getState().reset();
    void clearDeviceBinding();
    set({ ...empty, loading: false, error: null, ready: true });
  },
  restore: () => {
    if (restoreFlight) return restoreFlight;
    restoreFlight = (async () => {
      try {
        const user = await authService.restore();
        revision++;
        set({
          ...empty,
          session: { userId: user.id, mode: "real" },
          users: [user],
          people: [user],
          error: null,
        });
        await get().sync();
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) get().clear();
        else set({ error: e instanceof Error ? e.message : "Connexion impossible." });
      } finally {
        set({ ready: true });
      }
    })().finally(() => {
      restoreFlight = null;
    });
    return restoreFlight;
  },
  login: async (email, password) => {
    const result = await authService.login(email, password);
    revision++;
    set({
      ...empty,
      session: { userId: result.user.id, mode: "real" },
      users: [result.user],
      people: [result.user],
      error: null,
      ready: true,
    });
    announce();
    await get().sync();
    return result.user;
  },
  register: async (input) => {
    await authService.register(input);
    return get().login(input.email, input.password);
  },
  logout: async () => {
    markSignedOut();
    get().clear();
    announce();
    await clearDeviceBinding();
    await clearPrivateCaches();
    try {
      await authService.logout();
    } catch {
      set({ error: "Déconnexion locale effectuée. La révocation serveur sera retentée à la reconnexion ; sur un appareil partagé, fermez aussi le navigateur." });
    }
  },
  sync: () => {
    if (syncFlight) {
      syncAgain = true;
      return syncFlight;
    }
    syncFlight = (async () => {
      do {
        syncAgain = false;
        const owner = get().session?.userId;
        if (!owner) return;
        const version = revision;
        set({ loading: true });
        try {
          const user = await authService.me();
          if (owner !== user.id) {
            get().clear();
            return;
          }
          if (user.status !== "APPROVED") {
            if (version === revision)
              set({
                ...empty,
                session: { userId: user.id, mode: "real" },
                users: [user],
                people: [user],
                error: null,
              });
            return;
          }
          const responses = await Promise.allSettled([
            groupsService.list(),
            pollsService.all(),
            user.role === "ADMIN" ? usersService.all() : Promise.resolve([user]),
            user.role === "ADMIN" ? usersService.stats() : Promise.resolve(null),
          ]);
          if (owner !== get().session?.userId) return;
          if (version !== revision) {
            syncAgain = true;
            continue;
          }
          const [groupResult, pollResult, userResult, statsResult] = responses;
          const groups = groupResult.status === "fulfilled" ? groupResult.value : get().groups;
          const polls = pollResult.status === "fulfilled" ? pollResult.value : get().polls;
          const users = userResult.status === "fulfilled" ? userResult.value : get().users;
          const stats = statsResult.status === "fulfilled" ? statsResult.value : get().stats;
          const keys = ["groups", "polls", "users", "stats"] as const;
          const labels = ["Groupes", "Sondages", "Membres", "Statistiques"];
          const syncErrors: Store["syncErrors"] = {};
          responses.forEach((response, index) => { if (response.status === "rejected") syncErrors[keys[index]!] = response.reason instanceof Error ? response.reason.message : "Actualisation impossible."; });
          const error = keys.flatMap((key, index) => syncErrors[key] ? [labels[index] + " : " + syncErrors[key]] : []).join(" · ") || null;
          const allowed = new Set(groups.map((g) => g.id));
          set((s) => ({
            users: mergeById(users, [user]),
            people: mergeById(s.people, [user]),
            groups,
            polls,
            stats,
            syncErrors,
            messages: s.messages.filter((m) => allowed.has(m.groupId)),
            history: Object.fromEntries(
              Object.entries(s.history).filter(([id]) => allowed.has(id)),
            ),
            error,
          }));
        } catch (e) {
          if (owner === get().session?.userId)
            set({ error: e instanceof Error ? e.message : "Actualisation impossible." });
        } finally {
          set({ loading: false });
        }
      } while (syncAgain);
    })().finally(() => {
      syncFlight = null;
      if (syncAgain && get().session) void get().sync();
    });
    return syncFlight;
  },
  loadHistory: async (id, older = false) => {
    const owner = get().session?.userId;
    const prior = get().history[id];
    if (!owner || prior?.loading || (older && prior?.loaded && !prior.nextCursor)) return;
    set((s) => ({
      history: {
        ...s.history,
        [id]: {
          loaded: prior?.loaded ?? false,
          nextCursor: prior?.nextCursor ?? null,
          loading: true,
        },
      },
    }));
    try {
      const [group, page] = await Promise.all([
        groupsService.get(id),
        messagesService.history(id, older ? (prior?.nextCursor ?? undefined) : undefined),
      ]);
      if (owner !== get().session?.userId || !get().groups.some((g) => g.id === id)) return;
      set((s) => ({
        groups: mergeById(s.groups, [group]),
        people: mergeById(s.people, group.members),
        messages: mergeMessages(s.messages, page.items),
        history: {
          ...s.history,
          [id]: {
            loaded: true,
            loading: false,
            nextCursor: older || !prior?.loaded ? page.nextCursor : prior.nextCursor,
          },
        },
      }));
    } catch (e) {
      if (owner !== get().session?.userId) return;
      if (e instanceof ApiError && [403, 404].includes(e.status)) {
        get().removeGroup(id);
      } else
        set((s) => ({
          history: {
            ...s.history,
            [id]: {
              loaded: prior?.loaded ?? false,
              loading: false,
              nextCursor: prior?.nextCursor ?? null,
              error: e instanceof Error ? e.message : "Historique indisponible.",
            },
          },
        }));
    } finally {
      if (get().history[id]?.loading)
        set((s) => ({ history: { ...s.history, [id]: { ...s.history[id], loading: false } } }));
    }
  },
  catchUp: async () => {
    await get().sync();
    const owner = get().session?.userId;
    for (const [id, state] of Object.entries(get().history)) {
      if (!state.loaded || state.loading || !get().groups.some((g) => g.id === id)) continue;
      const known = new Set(
        get()
          .messages.filter((m) => m.groupId === id)
          .map((m) => m.id),
      );
      let cursor: string | undefined;
      do {
        const page = await messagesService.history(id, cursor);
        if (owner !== get().session?.userId || !get().groups.some((g) => g.id === id)) return;
        set((s) => ({ messages: mergeMessages(s.messages, page.items) }));
        if (page.items.some((m) => known.has(m.id)) || !page.nextCursor) break;
        cursor = page.nextCursor;
      } while (cursor);
    }
  },
  review: async (id, status) => {
    await usersService.review(id, status);
    await get().sync();
  },
  ban: async (id) => {
    const owner = get().session?.userId;
    await usersService.ban(id);
    if (owner !== get().session?.userId) return;
    get().removeUser(id);
    await get().sync();
  },
  removeUser: (id) => {
    revision++;
    set((s) => ({
      users: s.users.filter((user) => user.id !== id),
      people: s.people.filter((user) => user.id !== id),
      groups: s.groups.map((group) => ({ ...group, memberIds: group.memberIds.filter((userId) => userId !== id) })),
      messages: s.messages.filter((message) => message.authorId !== id),
      polls: s.polls.filter((poll) => poll.authorId !== id).map((poll) => ({ ...poll, votes: poll.votes.filter((vote) => vote.userId !== id) })),
    }));
  },
  membership: async (id, userId, add) => {
    const group = await groupsService.member(id, userId, add);
    get().receiveGroup(group);
    await get().sync();
  },
  move: async (userId, from, to) => {
    await groupsService.move(userId, from, to);
    await get().sync();
  },
  saveGroup: async (group) => {
    const exists = get().groups.some((g) => g.id === group.id);
    const saved = exists
      ? await groupsService.update(group.id, {
          name: group.name,
          description: group.description,
          color: group.color,
        })
      : await groupsService.create({
          name: group.name,
          description: group.description,
          color: group.color,
        });
    get().receiveGroup(saved);
    await get().sync();
    return saved;
  },
  groupImage: async (id, file) => {
    const message = await uploadsService.photo(id, file, "Image du groupe");
    get().receiveMessage(message);
    const imageMediaId = message.photoUrl?.split("/").at(-1);
    if (imageMediaId) get().receiveGroup(await groupsService.update(id, { imageMediaId }));
  },
  deleteGroup: async (id) => {
    await groupsService.remove(id);
    get().removeGroup(id);
    await get().sync();
  },
  post: async (groupId, text) => {
    get().receiveMessage(await messagesService.send(groupId, text));
  },
  photo: async (groupId, file, caption, progress) => {
    get().receiveMessage(await uploadsService.photo(groupId, file, caption, progress));
  },
  publishPoll: async (poll) => {
    get().receivePoll(
      await pollsService.create(poll.groupId, {
        question: poll.question,
        options: poll.options.map((o) => o.label),
        singleChoice: poll.singleChoice,
        endsAt: poll.endsAt,
      }),
    );
    await get().loadHistory(poll.groupId);
  },
  vote: async (id, options, replace = false) => {
    try {
      get().receivePoll(await pollsService.vote(id, options, replace));
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) get().receivePoll(await pollsService.get(id));
      throw e;
    }
  },
  profile: async (input) => {
    const user = await usersService.profile(input);
    set((s) => ({ users: mergeById(s.users, [user]), people: mergeById(s.people, [user]) }));
  },
  receiveMessage: (message) =>
    set((s) =>
      s.groups.some((g) => g.id === message.groupId)
        ? { messages: mergeMessages(s.messages, [message]) }
        : {},
    ),
  receivePoll: (poll) => {
    if (!get().groups.some((g) => g.id === poll.groupId)) return;
    revision++;
    set((s) => ({ polls: mergeById(s.polls, [poll]) }));
  },
  removePoll: (id) => {
    revision++;
    set((s) => ({ polls: s.polls.filter((poll) => poll.id !== id), messages: s.messages.filter((message) => message.pollId !== id) }));
  },
  receiveGroup: (group) => {
    const userId = get().session?.userId;
    if (!userId || !group.memberIds.includes(userId)) return;
    revision++;
    set((s) => ({ groups: mergeById(s.groups, [group]) }));
  },
  removeGroup: (id) => {
    revision++;
    set((s) => ({
      groups: s.groups.filter((g) => g.id !== id),
      messages: s.messages.filter((m) => m.groupId !== id),
      polls: s.polls.filter((p) => p.groupId !== id),
      history: Object.fromEntries(Object.entries(s.history).filter(([key]) => key !== id)),
    }));
  },
  toggleTheme: () =>
    set((s) => {
      const theme = s.theme === "light" ? "dark" : "light";
      usePreferences.getState().setTheme(theme);
      return { theme };
    }),
}));
