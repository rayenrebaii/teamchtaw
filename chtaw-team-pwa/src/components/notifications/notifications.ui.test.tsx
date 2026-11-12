import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { NotificationSettings } from "./notification-settings";
import { NotificationsPage } from "./notification-center";
import { NotificationsProvider } from "./notifications-provider";
import { Shell } from "../shell";
import * as notificationApi from "@/services/notifications.service";
import { notificationsService, type AppNotification } from "@/services/notifications.service";
import { useCommunity } from "@/stores/community";
import { useNotifications } from "@/stores/notifications";
import { usePreferences } from "@/stores/preferences";
import type { User } from "@/types";
const navigation = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));
vi.mock("next/navigation", () => ({
  usePathname: () => "/app/settings",
  useRouter: () => navigation,
}));
const user: User = {
  id: "student",
  firstName: "Mohamed",
  lastName: "Rami",
  email: "m@test.invalid",
  role: "USER",
  status: "APPROVED",
  joinedAt: "2026-01-01T10:00:00Z",
  bio: "",
};
const row: AppNotification = {
  id: "00000000-0000-4000-8000-000000000001",
  groupId: "g",
  groupName: "My Group",
  title: "Nouveau message dans My Group",
  body: "Un nouveau message a été publié.",
  type: "MESSAGE",
  entityId: "message",
  optionId: null,
  createdAt: "2026-11-05T10:00:00Z",
  readAt: null,
};
const preferences = {
  enabled: true,
  messagesEnabled: true,
  pollsEnabled: true,
  sessionRemindersEnabled: true,
};
beforeEach(() => {
  useCommunity.getState().clear();
  useCommunity.setState({
    ready: true,
    session: { userId: user.id, mode: "real" },
    users: [user],
    groups: [
      {
        id: "g",
        name: "My Group",
        description: "",
        color: "#aabbcc",
        isGeneral: false,
        memberIds: [user.id],
      },
    ],
  });
  usePreferences.setState({ language: "fr", theme: "light" });
  useNotifications.getState().reset(user.id);
  vi.spyOn(notificationsService, "preferences").mockResolvedValue(preferences);
  vi.spyOn(notificationsService, "config").mockResolvedValue({ enabled: false, publicKey: "" });
  vi.spyOn(notificationsService, "list").mockResolvedValue({
    items: [],
    unreadCount: 0,
    nextCursor: null,
  });
  vi.spyOn(notificationApi, "deviceBinding").mockResolvedValue(null);
  vi.spyOn(notificationApi, "clearDeviceBinding").mockResolvedValue(undefined);
  vi.spyOn(notificationApi, "pushCapability").mockReturnValue(false);
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: () => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }),
  });
  vi.clearAllMocks();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  Reflect.deleteProperty(navigator, "serviceWorker");
});
describe("Notification settings for both roles", () => {
  it("shows both student reminders and persists a category change", async () => {
    const update = vi
      .spyOn(notificationsService, "updatePreferences")
      .mockResolvedValue({ ...preferences, messagesEnabled: false });
    render(<NotificationSettings />);
    expect(await screen.findByLabelText("Rappels de séances")).toBeTruthy();
    fireEvent.click(screen.getByLabelText("Notifications des messages"));
    await waitFor(() => expect(update).toHaveBeenCalledWith({ messagesEnabled: false }));
    await waitFor(() =>
      expect(
        (screen.getByLabelText("Notifications des messages") as HTMLInputElement).checked,
      ).toBe(false),
    );
  });
  it("hides student reminders for admins", async () => {
    useCommunity.setState({ users: [{ ...user, role: "ADMIN" }] });
    render(<NotificationSettings />);
    await screen.findByLabelText("Notifications des messages");
    expect(screen.queryByLabelText("Rappels de séances")).toBeNull();
    expect(screen.getAllByRole("checkbox")).toHaveLength(3);
  });
  it("disables category controls when the master preference is disabled", async () => {
    vi.mocked(notificationsService.preferences).mockResolvedValue({
      ...preferences,
      enabled: false,
    });
    render(<NotificationSettings />);
    await screen.findByLabelText("Notifications des messages");
    expect((screen.getByLabelText("Rappels de séances") as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByLabelText("Activer les notifications") as HTMLInputElement).disabled).toBe(
      false,
    );
  });
  it("reports missing push configuration and incompatible browsers", async () => {
    render(<NotificationSettings />);
    expect(
      await screen.findByText("Les notifications système ne sont pas configurées."),
    ).toBeTruthy();
    expect(screen.getByText(/Notifications système incompatibles/)).toBeTruthy();
    expect(
      (
        screen.getByRole("button", {
          name: "Autoriser les notifications système sur cet appareil",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
  });
  it("requests permission only after explicit action and handles denial", async () => {
    const requestPermission = vi.fn().mockResolvedValue("denied");
    vi.stubGlobal("Notification", { permission: "default", requestPermission });
    vi.stubEnv("NODE_ENV", "production");
    vi.stubGlobal("isSecureContext", true);
    vi.stubGlobal("PushManager", class {});
    vi.stubGlobal("indexedDB", {});
    Object.defineProperty(navigator, "serviceWorker", { configurable: true, value: {} });
    vi.mocked(notificationApi.pushCapability).mockReturnValue(true);
    vi.mocked(notificationsService.config).mockResolvedValue({
      enabled: true,
      publicKey: "test-public",
    });
    render(<NotificationSettings />);
    const button = await screen.findByRole("button", {
      name: "Autoriser les notifications système sur cet appareil",
    });
    expect(requestPermission).not.toHaveBeenCalled();
    fireEvent.click(button);
    await waitFor(() => expect(requestPermission).toHaveBeenCalledTimes(1));
    expect(await screen.findByRole("alert")).toHaveProperty(
      "textContent",
      expect.stringContaining("Autorisation refusée"),
    );
  });
});
describe("Notification center and compact header", () => {
  it.each(["USER", "COLLABORATOR"] as const)("keeps personal links exclusively in the top menu for %s", (role) => {
    useCommunity.setState({ users: [{ ...user, role }] });
    const { container } = render(<Shell><p>Page content</p></Shell>);
    const personalLinks = Array.from(container.querySelectorAll('a[href="/app/profile"], a[href="/app/settings"]'));
    expect(personalLinks).toHaveLength(2);
    expect(personalLinks.every((link) => !!link.closest(".workspace-topbar .user-menu"))).toBe(true);
    if (role === "COLLABORATOR") {
      fireEvent.click(screen.getByRole("button", { name: "Plus" }));
      const more = screen.getByRole("dialog");
      expect(within(more).queryByRole("link", { name: "Mon profil" })).toBeNull();
      expect(within(more).queryByRole("link", { name: "Paramètres" })).toBeNull();
    }
  });
  it.each(["fr", "en"] as const)("keeps admin navigation ordered and personal actions only in the header (%s)", (language) => {
    usePreferences.setState({ language });
    useCommunity.setState({ users: [{ ...user, role: "ADMIN" }], theme: "light" });
    const { container } = render(<Shell admin><p>Page content</p></Shell>);
    const rail = container.querySelector(".rail") as HTMLElement;
    expect(Array.from(rail.querySelectorAll("nav a")).map((link) => link.getAttribute("href"))).toEqual([
      "/app", "/admin/users", "/admin/collaborators", "/admin/calendar", "/admin/polls", "/admin/attendance", "/admin/groups",
    ]);
    expect(rail.querySelector('a[href="/app/profile"]')).toBeNull();
    expect(rail.querySelector('a[href="/app/settings"]')).toBeNull();
    expect(rail.querySelector(".rail-bottom")).toBeNull();
    const header = container.querySelector(".workspace-topbar") as HTMLElement;
    fireEvent.click(header.querySelector("summary")!);
    expect(within(header).getByRole("link", { name: language === "fr" ? "Mon profil" : "My profile" })).toBeTruthy();
    expect(within(header).getByRole("link", { name: language === "fr" ? "Paramètres" : "Settings" })).toBeTruthy();
    fireEvent.click(within(header).getByRole("button", { name: language === "fr" ? "Mode sombre" : "Dark mode" }));
    expect(usePreferences.getState().theme).toBe("dark");
    expect(header.querySelector("details")?.hasAttribute("open")).toBe(false);
  });
  it.each(["USER", "ADMIN", "COLLABORATOR"] as const)(
    "keeps logo, bell and initials-only avatar for %s",
    (role) => {
      useCommunity.setState({ users: [{ ...user, role }] });
      const { container } = render(
        <Shell admin={role === "ADMIN"}>
          <p>Page content</p>
        </Shell>,
      );
      const header = container.querySelector(".workspace-topbar")!;
      expect(header.querySelector(".brand-logo")?.getAttribute("src")).toBe(
        "/branding/chtaw-logo.png",
      );
      expect(
        within(header as HTMLElement).getByRole("button", { name: /Notifications/ }),
      ).toBeTruthy();
      const trigger = header.querySelector("summary")!;
      expect(trigger.textContent).toBe("mr");
      expect(trigger.getAttribute("aria-label")).toContain("Mohamed");
      expect(trigger.children).toHaveLength(1);
      fireEvent.click(trigger);
      const menu = header.querySelector(".user-menu nav")!;
      expect(
        within(menu as HTMLElement)
          .getByRole("link", { name: "Mon profil" })
          .getAttribute("href"),
      ).toBe("/app/profile");
      expect(
        within(menu as HTMLElement)
          .getByRole("link", { name: "Paramètres" })
          .getAttribute("href"),
      ).toBe("/app/settings");
      expect(within(menu as HTMLElement).getByRole("button", { name: "Déconnexion" })).toBeTruthy();
    },
  );
  it("updates initials dynamically when the connected user's profile changes", () => {
    useCommunity.setState({ users: [{ ...user, firstName: " Nadia ", lastName: " Team " }] });
    const { container } = render(
      <Shell>
        <p>Page content</p>
      </Shell>,
    );
    expect(container.querySelector(".workspace-topbar summary")?.textContent).toBe("nt");
  });
  it("opens the server-authorized conversation and removes the notification", async () => {
    useNotifications.setState({ items: [row], unreadCount: 1 });
    const target = vi
      .spyOn(notificationsService, "open")
      .mockResolvedValue({ href: "/app/groups/g?message=message", unreadCount: 0 });
    render(<NotificationsPage />);
    fireEvent.click(screen.getByRole("button", { name: /Nouveau message dans/ }));
    await waitFor(() =>
      expect(navigation.push).toHaveBeenCalledWith("/app/groups/g?message=message"),
    );
    expect(target).toHaveBeenCalledWith(row.id);
    expect(useNotifications.getState().items).toEqual([]);
  });
  it("marks all read and refreshes the unread count", async () => {
    useNotifications.setState({ items: [row], unreadCount: 1 });
    const read = vi.spyOn(notificationsService, "readAll").mockResolvedValue({ unreadCount: 0 });
    render(<NotificationsPage />);
    fireEvent.click(screen.getByRole("button", { name: "Tout marquer comme lu" }));
    await waitFor(() => expect(read).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(useNotifications.getState().unreadCount).toBe(0));
  });
  it("never renders another owner's history or a removed group's content", () => {
    useNotifications.setState({ owner: "another-account", items: [row], unreadCount: 5 });
    const { rerender } = render(<NotificationsPage />);
    expect(screen.queryByText(row.title)).toBeNull();
    useNotifications.setState({ owner: user.id, items: [{ ...row, groupId: "private-foreign" }] });
    rerender(<NotificationsPage />);
    expect(screen.queryByText(row.title)).toBeNull();
  });
  it("resolves a push click through the authenticated opening endpoint", async () => {
    vi.spyOn(notificationsService, "open").mockResolvedValue({ href: "/app/sessions/session", unreadCount: 0 });
    render(<NotificationsPage openId={row.id} />);
    await waitFor(() => expect(navigation.replace).toHaveBeenCalledWith("/app/sessions/session"));
  });
  it("preserves a device binding while the session is being restored", () => {
    useCommunity.setState({ ready: false, session: null, users: [] });
    render(<NotificationsProvider />);
    expect(notificationApi.clearDeviceBinding).not.toHaveBeenCalled();
  });
});
