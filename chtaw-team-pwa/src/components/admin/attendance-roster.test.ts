// @vitest-environment jsdom
import { act, createElement, type AnchorHTMLAttributes, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Roster } from "@/services/attendance.service";
import { AttendanceRosterPage } from "./attendance-roster";

const mocks = vi.hoisted(() => ({
  roster: vi.fn(),
  save: vi.fn(),
  community: vi.fn(),
  navigate: vi.fn(),
}));
vi.mock("@/services/attendance.service", () => ({
  attendanceService: { roster: mocks.roster, save: mocks.save },
}));
vi.mock("@/stores/community", () => ({
  useCommunity: Object.assign((selector?: (state: ReturnType<typeof mocks.community>) => unknown) => {
    const state = mocks.community();
    return selector ? selector(state) : state;
  }, { getState: () => mocks.community() }),
}));
vi.mock("next/link", async () => {
  const React = await import("react");
  return {
    default: ({
      href,
      children,
      ...props
    }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string; children: ReactNode }) =>
      React.createElement(
        "a",
        {
          ...props,
          href,
          onClick: (event: React.MouseEvent) => {
            if (!event.defaultPrevented) {
              event.preventDefault();
              mocks.navigate(href);
            }
          },
        },
        children,
      ),
  };
});

let container: HTMLDivElement;
let root: Root;
let fixture: Roster;
const user = (id: string, name: string) => ({
  id,
  firstName: name,
  lastName: "Test",
  email: `${id}@example.test`,
  role: "USER" as const,
  status: "APPROVED" as const,
  joinedAt: "2026-11-04T10:00:00Z",
  bio: "",
});
const alice = user("alice", "Alice"),
  bob = user("bob", "Bob");
function fresh(): Roster {
  return {
    id: "session",
    question: "Entraînement de la team",
    group: { id: "g", name: "G1" },
    status: "OPEN",
    mandatoryAttendance: true,
    attendanceLockedAt: null,
    participants: [alice, bob].map((u) => ({
      user: u,
      included: true,
      version: 0,
      final: "EN_ATTENTE",
    })),
    slots: ["monday", "tuesday"].map((id, i) => ({
      id,
      label: i ? "Mardi" : "Lundi",
      startsAt: `2020-01-0${i + 2}T10:00:00Z`,
      endsAt: `2020-01-0${i + 2}T12:00:00Z`,
      students: [alice, bob].map((u) => ({
        user: u,
        attendance: "NON_VERIFIE",
        version: 0,
        participantVersion: 0,
        absences: 0,
        final: "EN_ATTENTE",
        voted: u.id === "alice",
        hasVoted: u.id === "alice",
      })),
    })),
  };
}
const button = (name: string, scope: ParentNode = container) => {
  const result = [...scope.querySelectorAll<HTMLButtonElement>("button")].find(
    (b) => b.textContent?.trim() === name,
  );
  if (!result) throw Error(`Button not found: ${name}`);
  return result;
};
const row = (name: string) => {
  const result = [...container.querySelectorAll("tbody tr")].find((r) =>
    r.textContent?.includes(name),
  );
  if (!result) throw Error(`Student not found: ${name}`);
  return result;
};
async function mount(initialSlotId?: string) {
  await act(async () => {
    root.render(createElement(AttendanceRosterPage, { pollId: "session", initialSlotId }));
  });
}
async function click(element: Element) {
  await act(async () => {
    (element as HTMLElement).click();
  });
}

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  window.history.replaceState({ __NA: true }, "", "/admin/attendance/session");
  fixture = fresh();
  mocks.roster.mockReset().mockImplementation(async () => structuredClone(fixture));
  mocks.save.mockReset().mockResolvedValue(fixture);
  mocks.navigate.mockReset();
  mocks.community.mockReturnValue({
    users: [alice, bob],
    groups: [{ id: "g", memberIds: ["alice", "bob"] }],
  });
  vi.spyOn(window, "confirm").mockReturnValue(false);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("Page dédiée de pointage", () => {
  it("bloque les pointages futurs et les active exactement au début du créneau", async () => {
    vi.useFakeTimers();
    const startsAt = "2026-11-09T09:00:00Z";
    vi.setSystemTime(new Date(Date.parse(startsAt) - 1000));
    fixture.slots[0]!.startsAt = startsAt;
    fixture.slots[0]!.endsAt = "2026-11-09T10:00:00Z";
    await mount();
    expect(button("Présent", row("Alice")).disabled).toBe(true);
    expect(button("Absent", row("Alice")).disabled).toBe(true);
    await click(button("Présent", row("Alice")));
    expect(mocks.save).not.toHaveBeenCalled();
    expect(container.textContent).toContain("Le pointage est disponible uniquement à partir de l’heure de début du créneau.");
    await act(async () => { vi.advanceTimersByTime(1000); });
    expect(button("Présent", row("Alice")).disabled).toBe(false);
    await click(button("Présent", row("Alice")));
    await click(button("Enregistrer les présences"));
    expect(mocks.save).toHaveBeenCalled();
  });
  it("affiche une page sans dialogue, les statistiques et le retour à la séance sélectionnée", async () => {
    await mount();
    expect(container.querySelector('[role="dialog"]')).toBeNull();
    expect(container.querySelector("h1")?.textContent).toBe(fixture.question);
    expect(container.querySelectorAll(".roster-stats > div")).toHaveLength(4);
    expect(container.querySelectorAll("tbody tr")).toHaveLength(2);
    expect(container.querySelector(".roster-back")?.getAttribute("href")).toBe(
      "/admin/attendance?pollId=session",
    );
    await click(container.querySelector(".roster-back")!);
    expect(mocks.navigate).toHaveBeenCalledWith("/admin/attendance?pollId=session");
  });
  it("change de créneau sans perdre les modifications et garde le créneau dans l’URL", async () => {
    await mount();
    await click(button("Présent", row("Alice")));
    await click(
      [...container.querySelectorAll(".roster-slot-tabs button")].find((b) =>
        b.textContent?.includes("Mardi"),
      )!,
    );
    expect(window.location.search).toBe("?slot=tuesday");
    expect(window.confirm).not.toHaveBeenCalled();
    await click(button("Absent", row("Alice")));
    await click(button("Enregistrer les présences"));
    expect(mocks.save).toHaveBeenCalledWith("session", [
      { userId: "alice", optionId: "monday", status: "PRESENT", version: 0, participantVersion: 0 },
      { userId: "alice", optionId: "tuesday", status: "ABSENT", version: 0, participantVersion: 0 },
    ]);
  });
  it("protège le retour, les liens, l’actualisation et le bouton précédent du navigateur", async () => {
    await mount();
    await click(button("Présent", row("Alice")));
    await click(container.querySelector(".roster-back")!);
    expect(window.confirm).toHaveBeenCalled();
    expect(mocks.navigate).not.toHaveBeenCalled();
    const reload = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(reload);
    expect(reload.defaultPrevented).toBe(true);
    window.history.replaceState({}, "", "/admin/attendance");
    window.dispatchEvent(new PopStateEvent("popstate", { state: {} }));
    expect(window.location.pathname).toBe("/admin/attendance/session");
    expect(button("Enregistrer les présences").disabled).toBe(false);
  });
  it("permet une correction avec les versions existantes et retire un brouillon annulé", async () => {
    fixture.slots[0].students[0] = {
      ...fixture.slots[0].students[0],
      attendance: "ABSENT",
      final: "ABSENT",
      version: 3,
      participantVersion: 4,
    };
    await mount();
    await click(button("Présent", row("Alice")));
    await click(button("Absent", row("Alice")));
    expect(button("Enregistrer les présences").disabled).toBe(true);
    await click(button("Non vérifié", row("Alice")));
    await click(button("Enregistrer les présences"));
    expect(mocks.save).toHaveBeenCalledWith("session", [
      {
        userId: "alice",
        optionId: "monday",
        status: "NON_VERIFIE",
        version: 3,
        participantVersion: 4,
      },
    ]);
  });
  it("conserve les modifications après un échec d’enregistrement", async () => {
    mocks.save.mockRejectedValueOnce(Error("Conflit de version"));
    await mount("tuesday");
    await click(button("Présent", row("Alice")));
    await click(button("Enregistrer les présences"));
    expect(button("Enregistrer les présences").disabled).toBe(false);
    expect(container.textContent).toContain("1 modification non enregistrée");
  });
  it("actualise le bilan depuis le serveur après l’enregistrement et autorise ensuite le retour", async () => {
    mocks.save.mockImplementationOnce(async () => {
      fixture.participants![0].final = "PRESENT";
      fixture.participants![0].version = 1;
      fixture.slots[0].students[0] = {
        ...fixture.slots[0].students[0],
        final: "PRESENT",
        attendance: "PRESENT",
        version: 1,
        participantVersion: 1,
      };
      return fixture;
    });
    await mount();
    await click(button("Présent", row("Alice")));
    await click(button("Enregistrer les présences"));
    expect(
      [...container.querySelectorAll(".roster-stats strong")].map((element) => element.textContent),
    ).toEqual(["2", "1", "0", "1"]);
    await click(container.querySelector(".roster-back")!);
    expect(window.confirm).not.toHaveBeenCalled();
    expect(mocks.navigate).toHaveBeenCalledWith("/admin/attendance?pollId=session");
  });
  it("masque les présents des autres créneaux et les réaffiche pour consultation", async () => {
    fixture.slots[1].students[0].final = "PRESENT";
    await mount("tuesday");
    expect(container.querySelectorAll("tbody tr")).toHaveLength(1);
    const checkbox = container.querySelector<HTMLInputElement>('input[type="checkbox"]')!;
    await click(checkbox);
    expect(container.querySelectorAll("tbody tr")).toHaveLength(2);
  });
  it("utilise les mêmes actions accessibles pour le tableau desktop et les cartes mobile", async () => {
    await mount();
    expect(container.querySelectorAll(".roster-mark-actions")).toHaveLength(2);
    expect(row("Alice").querySelectorAll(".roster-mark-actions button")).toHaveLength(3);
    expect(row("Alice").querySelector('[data-label="Email"]')?.textContent).toBe(alice.email);
    expect(container.querySelectorAll(".roster-table-shell")).toHaveLength(1);
  });
  it("filtre immédiatement les inscriptions et la recherche par email", async () => {
    await mount();
    const select = container.querySelector<HTMLSelectElement>(".roster-filters select")!;
    await act(async () => {
      select.value = "NOT_VOTED";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(container.querySelectorAll("tbody tr")).toHaveLength(1);
    expect(row("Bob")).toBeDefined();
    await act(async () => {
      select.value = "ALL";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    const input = container.querySelector<HTMLInputElement>('input[type="search"]')!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(
        input,
        "alice@example.test",
      );
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(container.querySelectorAll("tbody tr")).toHaveLength(1);
    expect(row("Alice")).toBeDefined();
  });
  it("affiche une erreur récupérable et interdit les pointages d’une séance annulée", async () => {
    mocks.roster.mockRejectedValueOnce(Error("Chargement impossible"));
    await mount();
    expect(container.querySelector('[role="alert"]')?.textContent).toContain(
      "Chargement impossible",
    );
    fixture.status = "CANCELLED";
    await click(button("Réessayer"));
    expect(button("Présent", row("Alice")).disabled).toBe(true);
    expect(button("Absent", row("Alice")).disabled).toBe(true);
  });
});
