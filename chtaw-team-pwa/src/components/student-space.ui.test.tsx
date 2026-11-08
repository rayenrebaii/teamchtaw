import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { Shell } from "./shell";
import { ProfileScreen, SettingsScreen } from "./account-screen";
import { ChatScreen } from "./chat/chat-screen";
import { StudentAttendance } from "./student-attendance";
import { PreferenceEffects } from "./preference-effects";
import { InstallPWAButton } from "./pwa/InstallPWAButton";
import { attendanceService, type PersonalAttendancePage } from "@/services/attendance.service";
import { useCommunity } from "@/stores/community";
import { usePreferences, readPreferences } from "@/stores/preferences";
import type { User } from "@/types";
vi.mock("./notifications/notification-settings", () => ({ NotificationSettings: () => null }));
const navigation = vi.hoisted(() => ({ path: "/app/attendance", replace: vi.fn() }));
vi.mock("next/navigation", () => ({
  usePathname: () => navigation.path,
  useRouter: () => ({ replace: navigation.replace, push: vi.fn() }),
}));
const user: User = {
  id: "student",
  firstName: "Nadia",
  lastName: "Team",
  email: "nadia@test.invalid",
  role: "USER",
  status: "APPROVED",
  joinedAt: "2026-01-01T10:00:00Z",
  bio: "Ma présentation",
};
function response(upcoming: boolean, page = 1): PersonalAttendancePage {
  return {
    user,
    stats: { completed: 4, present: 3, absent: 1, upcoming: 1 },
    groups: [{ id: "group", name: "Mon Groupe FR" }],
    page,
    limit: 20,
    total: 1,
    timeZone: "Africa/Tunis",
    incompleteSchedules: false,
    items: [
      {
        id: upcoming ? "future" : "absent",
        question: upcoming ? "Séance future personnelle" : "Absence officielle",
        groupName: "Mon Groupe FR",
        groupId: "group",
        description: "",
        status: "OPEN",
        createdAt: "2026-01-01T10:00:00Z",
        final: upcoming ? "EN_ATTENTE" : "ABSENT",
        mandatoryAttendance: true,
        slots: [
          {
            optionId: "slot",
            label: "Créneau réel",
            startsAt: upcoming ? "2099-01-01T14:00:00Z" : "2020-01-01T10:00:00Z",
            endsAt: upcoming ? "2099-01-01T15:00:00Z" : "2020-01-01T11:00:00Z",
          },
        ],
        startsAt: null,
        endsAt: null,
        completed: !upcoming,
        scheduleComplete: true,
        attendanceStatus: upcoming ? "UPCOMING" : "ABSENT",
        selections: [],
      },
    ],
  };
}
beforeEach(() => {
  localStorage.clear();
  Object.defineProperty(window, "visualViewport", { configurable: true, value: undefined });
  usePreferences.setState({ language: "fr", theme: "light" });
  useCommunity.getState().clear();
  useCommunity.setState({
    ready: true,
    session: { userId: user.id, mode: "real" },
    users: [user],
    groups: [
      {
        id: "group",
        name: "Mon Groupe FR",
        description: "",
        color: "#aabbcc",
        isGeneral: false,
        memberIds: [user.id],
      },
    ],
  });
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: () => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }),
  });
  Object.defineProperty(Element.prototype, "scrollIntoView", {
    configurable: true,
    value: vi.fn(),
  });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
describe("Espace étudiant simplifié", () => {
  it.each([320, 375, 390, 430, 768, 1440])(
    "conserve exactement quatre destinations et une section active à %s px",
    (width) => {
      Object.defineProperty(window, "innerWidth", { configurable: true, value: width });
      const result = render(
        <Shell>
          <div>Contenu</div>
        </Shell>,
      );
      const nav = within(screen.getByRole("navigation", { name: "VOTRE ESPACE" }));
      expect(nav.getAllByRole("link").map((link) => link.getAttribute("href"))).toEqual([
        "/app",
        "/app/attendance",
        "/app/profile",
        "/app/settings",
      ]);
      expect(nav.getByRole("link", { name: "Présences" }).getAttribute("aria-current")).toBe(
        "page",
      );
      expect(result.container.querySelector(".student-workspace")?.getAttribute("style")).toContain(
        "--app-height",
      );
    },
  );
  it("affiche seulement les KPI, prochaines séances et absences, sans filtres ni onglets", async () => {
    const mine = vi
      .spyOn(attendanceService, "mine")
      .mockImplementation(async (filters) => response(filters.status === "UPCOMING"));
    render(<StudentAttendance />);
    expect(await screen.findByText("Séance future personnelle")).toBeTruthy();
    expect(screen.getByText("Absence officielle")).toBeTruthy();
    expect(screen.getAllByText("Mon Groupe FR")).toHaveLength(2);
    expect(screen.queryByRole("tablist")).toBeNull();
    expect(screen.queryByRole("combobox")).toBeNull();
    expect(screen.queryByLabelText("Date de début")).toBeNull();
    expect(mine).toHaveBeenCalledWith(
      expect.objectContaining({ status: "UPCOMING", order: "asc" }),
    );
    expect(mine).toHaveBeenCalledWith(expect.objectContaining({ status: "ABSENT", order: "desc" }));
  });
  it("gère les erreurs réseau puis recharge les données réelles", async () => {
    const mine = vi
      .spyOn(attendanceService, "mine")
      .mockRejectedValue(
        Error("Connexion au serveur impossible. Vérifiez votre réseau et réessayez."),
      );
    render(<StudentAttendance />);
    expect(await screen.findByRole("alert")).toBeTruthy();
    mine.mockImplementation(async (filters) => response(filters.status === "UPCOMING"));
    fireEvent.click(screen.getByRole("button", { name: "Réessayer" }));
    expect(await screen.findByText("Absence officielle")).toBeTruthy();
  });
  it("n’affiche pas les données d’une réponse appartenant à un autre utilisateur", async () => {
    vi.spyOn(attendanceService, "mine").mockResolvedValue({
      ...response(true),
      user: { ...user, id: "other" },
    });
    render(<StudentAttendance />);
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.queryByText("Séance future personnelle")).toBeNull();
  });
  it("traduit la page en anglais sans traduire le contenu des séances", async () => {
    usePreferences.getState().setLanguage("en");
    vi.spyOn(attendanceService, "mine").mockImplementation(async (filters) =>
      response(filters.status === "UPCOMING"),
    );
    render(<StudentAttendance />);
    expect(screen.getByRole("heading", { name: "My attendance" })).toBeTruthy();
    expect(await screen.findByText("Séance future personnelle")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Your absences" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Mes présences" })).toBeNull();
  });
  it("préserve la consultation et la modification autorisée du profil", () => {
    render(<ProfileScreen />);
    expect(screen.getByText(user.email, { selector: "dd" })).toBeTruthy();
    expect(screen.getByText("Mon Groupe FR")).toBeTruthy();
    expect(screen.getByLabelText("Prénom")).toHaveProperty("value", "Nadia");
    expect(screen.queryByRole("combobox")).toBeNull();
    expect(
      screen.getByRole("link", { name: "Mon historique de présence" }).getAttribute("href"),
    ).toBe("/app/attendance");
  });
  it("change le thème et la langue immédiatement et les restaure à la réouverture", async () => {
    const first = render(
      <>
        <PreferenceEffects />
        <SettingsScreen />
      </>,
    );
    fireEvent.change(screen.getByLabelText("Choisir le thème"), { target: { value: "dark" } });
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(localStorage.getItem("chtaw-theme")).toBe("dark");
    fireEvent.change(screen.getByLabelText("Choisir la langue"), { target: { value: "en" } });
    expect(screen.getByRole("heading", { name: "Settings" })).toBeTruthy();
    expect(document.documentElement.lang).toBe("en");
    expect(localStorage.getItem("chtaw-language")).toBe("en");
    first.unmount();
    usePreferences.setState({ theme: "light", language: "fr" });
    render(
      <>
        <PreferenceEffects />
        <SettingsScreen />
      </>,
    );
    await waitFor(() => expect(screen.getByRole("heading", { name: "Settings" })).toBeTruthy());
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(readPreferences()).toEqual({ theme: "dark", language: "en" });
  });
  it("suit le thème système sans remplacer la préférence enregistrée", () => {
    const system = new EventTarget() as EventTarget & { matches: boolean };
    system.matches = true;
    Object.defineProperty(window, "matchMedia", { configurable: true, value: () => system });
    render(
      <>
        <PreferenceEffects />
        <SettingsScreen />
      </>,
    );
    fireEvent.change(screen.getByLabelText("Choisir le thème"), { target: { value: "system" } });
    expect(document.documentElement.dataset.theme).toBe("dark");
    system.matches = false;
    act(() => {
      system.dispatchEvent(new Event("change"));
    });
    expect(document.documentElement.dataset.theme).toBe("light");
    expect(localStorage.getItem("chtaw-theme")).toBe("system");
  });
  it("traduit les conversations mais conserve les noms et messages réels", () => {
    usePreferences.getState().setLanguage("en");
    useCommunity.setState({
      messages: [
        {
          id: "message",
          authorId: user.id,
          groupId: "group",
          kind: "text",
          text: "Message original en français",
          createdAt: "2026-01-01T10:00:00Z",
        },
      ],
    });
    vi.spyOn(useCommunity.getState(), "loadHistory").mockResolvedValue();
    render(<ChatScreen groupId="group" />);
    expect(screen.getByRole("textbox", { name: "Search groups" })).toBeTruthy();
    expect(
      screen.getByText("Message original en français", { selector: ".bubble p" }),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Send message" })).toBeTruthy();
    expect(screen.getAllByText("Mon Groupe FR").length).toBeGreaterThan(0);
  });
  it("affiche le statut installé uniquement dans un mode standalone confirmé", async () => {
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: () => ({ matches: true, addEventListener() {}, removeEventListener() {} }),
    });
    render(<InstallPWAButton showStatus />);
    expect(await screen.findByText("Application installée")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Installer l’application" })).toBeNull();
  });
  it("traduit la navigation administrateur selon la préférence anglaise", () => {
    usePreferences.getState().setLanguage("en");
    useCommunity.setState({ users: [{ ...user, role: "ADMIN" }] });
    render(
      <Shell>
        <div>Admin</div>
      </Shell>,
    );
    expect(screen.getAllByRole("link", { name: "Members" }).length).toBeGreaterThan(0);
    expect(screen.queryByRole("link", { name: "Présences" })).toBeNull();
    expect(screen.getAllByRole("link", { name: "Attendance" })[0]!.getAttribute("href")).toBe(
      "/admin/attendance",
    );
  });
});

it("garde les deux sections utiles quand aucune séance n’est disponible", async () => {
  vi.spyOn(attendanceService, "mine").mockResolvedValue({
    ...response(true),
    items: [],
    total: 0,
    stats: { completed: 0, present: 0, absent: 0, upcoming: 0 },
  });
  render(<StudentAttendance />);
  expect(await screen.findByText("Aucune séance à venir")).toBeTruthy();
  expect(screen.getByText("Aucune absence validée")).toBeTruthy();
  expect(screen.queryByRole("tablist")).toBeNull();
});
it("pagine les absences indépendamment des prochaines séances", async () => {
  const mine = vi.spyOn(attendanceService, "mine").mockImplementation(async (filters) => {
    const data = response(filters.status === "UPCOMING", Number(filters.page));
    return filters.status === "ABSENT" ? { ...data, total: 2, limit: 1 } : data;
  });
  render(<StudentAttendance />);
  await screen.findByText("Absence officielle");
  const nav = screen.getByRole("navigation", { name: "Vos absences" });
  fireEvent.click(within(nav).getByRole("button", { name: "Suivant" }));
  await waitFor(() =>
    expect(mine).toHaveBeenCalledWith(expect.objectContaining({ status: "ABSENT", page: "2" })),
  );
  expect(mine).toHaveBeenCalledWith(expect.objectContaining({ status: "UPCOMING", page: "1" }));
});
it("présente les instructions Safari sans annoncer d’installation", () => {
  render(<InstallPWAButton showStatus />);
  fireEvent.click(screen.getByRole("button", { name: "Installer l’application" }));
  expect(screen.getByRole("dialog")).toBeTruthy();
  expect(screen.getByText(/Sur iPhone ou iPad/)).toBeTruthy();
  expect(screen.queryByText("Application installée")).toBeNull();
});
it("adapte la hauteur disponible aux événements du viewport virtuel", () => {
  const viewport = Object.assign(new EventTarget(), { height: 600, offsetTop: 0 });
  Object.defineProperty(window, "visualViewport", { configurable: true, value: viewport });
  const result = render(
    <Shell>
      <div>Conversation</div>
    </Shell>,
  );
  viewport.height = 340;
  viewport.offsetTop = 20;
  act(() => {
    viewport.dispatchEvent(new Event("resize"));
  });
  const workspace = result.container.querySelector<HTMLElement>(".student-workspace")!;
  expect(workspace.style.getPropertyValue("--app-height")).toBe("340px");
  expect(workspace.style.getPropertyValue("--viewport-top")).toBe("20px");
});
