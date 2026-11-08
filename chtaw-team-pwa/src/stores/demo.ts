"use client";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { seed } from "@/mocks/seed";
import * as rules from "@/features/rules";
import type { DemoData, AuthSession, Group, Message, Poll, User } from "@/types";
interface Store extends DemoData {
  session: AuthSession | null;
  theme: "light" | "dark";
  login: (email: string) => User;
  logout: () => void;
  demo: (id: string) => void;
  register: (values: Pick<User, "firstName" | "lastName" | "email">) => void;
  review: (id: string, status: "APPROVED" | "REJECTED") => void;
  membership: (groupId: string, userId: string, add: boolean) => void;
  saveGroup: (group: Group) => void;
  deleteGroup: (id: string) => void;
  post: (message: Message) => void;
  publishPoll: (poll: Poll) => void;
  vote: (id: string, options: string[]) => void;
  profile: (values: Pick<User, "firstName" | "lastName" | "bio">) => void;
  toggleTheme: () => void;
  reset: () => void;
}
const actor = (s: Store) => s.users.find((u) => u.id === s.session?.userId);
export const useDemo = create<Store>()(
  persist(
    (set, get) => ({
      ...seed(),
      session: null,
      theme: "light",
      login: (email) => {
        const user = get().users.find((u) => u.email.toLowerCase() === email.toLowerCase().trim());
        if (!user)
          throw Error(
            "Compte de démonstration introuvable. Créez un compte ou utilisez un profil démo.",
          );
        sessionStorage.setItem("chtaw-demo-user", user.id);
        set({ session: { userId: user.id, mode: "demo" } });
        return user;
      },
      logout: () => {
        sessionStorage.removeItem("chtaw-demo-user");
        set({ session: null });
      },
      demo: (id) => {
        sessionStorage.setItem("chtaw-demo-user", id);
        set({ session: { userId: id, mode: "demo" } });
      },
      register: (values) => {
        const s = get();
        if (s.users.some((u) => u.email.toLowerCase() === values.email.toLowerCase().trim()))
          throw Error("Cet email possède déjà un compte.");
        const user: User = {
          ...values,
          email: values.email.toLowerCase().trim(),
          id: crypto.randomUUID(),
          role: "USER",
          status: "PENDING",
          bio: "",
          joinedAt: new Date().toISOString(),
        };
        sessionStorage.setItem("chtaw-demo-user", user.id);
        set({ users: [...s.users, user], session: { userId: user.id, mode: "demo" } });
      },
      review: (id, status) => set((s) => rules.review(s, actor(s), id, status)),
      membership: (g, u, add) => set((s) => rules.membership(s, actor(s), g, u, add)),
      saveGroup: (group) =>
        set((s) => {
          rules.admin(actor(s));
          if (!group.name.trim()) throw Error("Le nom du groupe est obligatoire.");
          const old = s.groups.find((g) => g.id === group.id);
          const approvedIds = new Set(
            s.users.filter((u) => u.status === "APPROVED").map((u) => u.id),
          );
          const saved = {
            ...group,
            isGeneral: old?.isGeneral ?? false,
            memberIds: old?.isGeneral
              ? [...approvedIds]
              : [
                  ...new Set([
                    ...group.memberIds.filter((id) => approvedIds.has(id)),
                    actor(s)!.id,
                  ]),
                ],
          };
          return {
            groups: old
              ? s.groups.map((g) => (g.id === group.id ? saved : g))
              : [...s.groups, saved],
          };
        }),
      deleteGroup: (id) =>
        set((s) => {
          rules.admin(actor(s));
          if (s.groups.find((g) => g.id === id)?.isGeneral)
            throw Error("Le groupe général ne peut pas être supprimé.");
          return {
            groups: s.groups.filter((g) => g.id !== id),
            messages: s.messages.filter((m) => m.groupId !== id),
            polls: s.polls.filter((p) => p.groupId !== id),
          };
        }),
      post: (message) => set((s) => rules.post(s, actor(s), message)),
      publishPoll: (poll) =>
        set((s) => {
          const next = rules.publishPoll(s, actor(s), poll);
          return rules.post(next, actor(s), {
            id: crypto.randomUUID(),
            groupId: poll.groupId,
            authorId: actor(s)!.id,
            kind: "poll",
            text: "",
            pollId: poll.id,
            createdAt: new Date().toISOString(),
          });
        }),
      vote: (id, options) => set((s) => rules.vote(s, actor(s), id, options)),
      profile: (values) =>
        set((s) => {
          if (!actor(s)) throw Error("Connectez-vous.");
          return {
            users: s.users.map((u) => (u.id === s.session?.userId ? { ...u, ...values } : u)),
          };
        }),
      toggleTheme: () => set((s) => ({ theme: s.theme === "light" ? "dark" : "light" })),
      reset: () => {
        sessionStorage.removeItem("chtaw-demo-user");
        set({ ...seed(), session: null });
      },
    }),
    {
      name: "chtaw-fictional-demo-v1",
      storage: createJSONStorage(() => localStorage),
      skipHydration: true,
      partialize: (s) => ({
        users: s.users,
        groups: s.groups,
        messages: s.messages,
        polls: s.polls,
        theme: s.theme,
      }),
    },
  ),
);
