import React from "react";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NotificationsPage, NotificationBell } from "./notification-center";
import { notificationsService, type AppNotification } from "@/services/notifications.service";
import { useNotifications } from "@/stores/notifications";
import { useCommunity } from "@/stores/community";
import { usePreferences } from "@/stores/preferences";
import type { User } from "@/types";
const navigation = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => navigation }));
const user: User = { id: "client", firstName: "Client", lastName: "Team", email: "client@test.invalid", role: "USER", status: "APPROVED", joinedAt: "2026-01-01T00:00:00Z", bio: "" };
const row: AppNotification = { id: "00000000-0000-4000-8000-000000000001", type: "MESSAGE", groupId: "group", groupName: "G1", entityId: "message", title: "Nadia Team · G1", body: "Bonjour la team !", readAt: null, optionId: null, createdAt: "2026-11-12T10:00:00Z" };
beforeEach(() => {
  vi.clearAllMocks(); useCommunity.getState().clear();
  useCommunity.setState({ session: { userId: user.id, mode: "real" }, users: [user], groups: [{ id: "group", name: "G1", isGeneral: false, description: "", color: "#be9af5", memberIds: [user.id] }] });
  usePreferences.setState({ language: "fr" });
  useNotifications.getState().reset(user.id); useNotifications.setState({ items: [row], unreadCount: 1 });
  vi.spyOn(notificationsService, "list").mockResolvedValue({ items: [], unreadCount: 0, nextCursor: null });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
it("shows the sender and actual content and consumes a click once before opening its exact message", async () => {
  let finish!: (value: { href: string; unreadCount: number }) => void;
  const open = vi.spyOn(notificationsService, "open").mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
  render(<NotificationsPage />);
  expect(screen.getByText(row.body)).toBeTruthy();
  const button = screen.getByRole("button", { name: /Nadia Team/ });
  fireEvent.click(button); fireEvent.click(button);
  expect(open).toHaveBeenCalledTimes(1);
  finish({ href: "/app/groups/group?message=message", unreadCount: 0 });
  await waitFor(() => expect(navigation.push).toHaveBeenCalledWith("/app/groups/group?message=message"));
  expect(useNotifications.getState()).toMatchObject({ items: [], unreadCount: 0 });
});
it("keeps the actual poll title and source visible in English instead of replacing them with a generic body", () => {
  usePreferences.setState({ language: "en" });
  useNotifications.setState({ items: [{ ...row, type: "POLL", body: "Session poll : Training Tuesday" }] });
  render(<NotificationsPage />);
  expect(screen.getByText("Nadia Team · G1")).toBeTruthy();
  expect(screen.getByText("Session poll : Training Tuesday")).toBeTruthy();
});
it("keeps the notification and allows retry when opening fails", async () => {
  vi.spyOn(notificationsService, "open").mockRejectedValue(Error("Offline"));
  render(<NotificationsPage />);
  fireEvent.click(screen.getByRole("button", { name: /Nadia Team/ }));
  await waitFor(() => expect(screen.getByRole("button", { name: /Nadia Team/ }).hasAttribute("disabled")).toBe(false));
  expect(useNotifications.getState().items).toHaveLength(1); expect(navigation.push).not.toHaveBeenCalled();
});
it("resolves a system click once under Strict Mode and replaces the intermediate page with the source poll", async () => {
  const open = vi.spyOn(notificationsService, "open").mockResolvedValue({ href: "/app/groups/group?poll=poll", unreadCount: 0 });
  render(<React.StrictMode><NotificationsPage openId={row.id} /></React.StrictMode>);
  await waitFor(() => expect(navigation.replace).toHaveBeenCalledWith("/app/groups/group?poll=poll"));
  expect(open).toHaveBeenCalledTimes(1);
});
it("does not navigate or change the next account's notifications after an account switch", async () => {
  let finish!: (value: { href: string; unreadCount: number }) => void;
  vi.spyOn(notificationsService, "open").mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
  render(<NotificationsPage openId={row.id} />);
  await act(async () => {
    useCommunity.getState().clear(); useNotifications.getState().reset("other"); useNotifications.setState({ unreadCount: 5 });
    finish({ href: "/app/groups/group?message=message", unreadCount: 0 });
  });
  expect(navigation.replace).not.toHaveBeenCalled(); expect(useNotifications.getState().unreadCount).toBe(5);
});
it("shows a recoverable error for a failed system click and keeps the notification", async () => {
  vi.spyOn(notificationsService, "open").mockRejectedValue(Error("Contenu indisponible."));
  render(<NotificationsPage openId={row.id} />);
  expect(await screen.findByRole("alert")).toHaveProperty("textContent", expect.stringContaining("Contenu indisponible."));
  expect(screen.getByRole("button", { name: "Réessayer" })).toBeTruthy();
  expect(useNotifications.getState().items).toHaveLength(1);
});
it("uses one heading in the compact notification dialog", () => {
  render(<NotificationBell />);
  fireEvent.click(screen.getByRole("button", { name: /Notifications/ }));
  expect(screen.getAllByRole("heading", { name: "Notifications" })).toHaveLength(1);
});
