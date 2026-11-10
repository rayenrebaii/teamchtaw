import React from "react";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { CollaboratorsScreen, OrganizerReports } from "./collaborators";
import { api } from "@/services/api-client";
import { attendanceService } from "@/services/attendance.service";
import { useCommunity } from "@/stores/community";
import { SessionPollsScreen } from "./admin/attendance-panel";
import { usePreferences } from "@/stores/preferences";
import { destination } from "@/lib/utils";
import type { User } from "@/types";
const actor: User = { id: "collab-a", firstName: "Alice", lastName: "Test", email: "alice@test.invalid", role: "COLLABORATOR", status: "APPROVED", bio: "", joinedAt: "2026-01-01T00:00:00Z" };
beforeEach(() => {
  usePreferences.setState({ language: "fr" }); useCommunity.getState().clear();
  useCommunity.setState({ users: [actor], session: { userId: actor.id, mode: "real" }, groups: [{ id: "group", name: "G1", color: "#be9af5", isGeneral: false, description: "", memberIds: [actor.id] }] });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
it("routes approved collaborators to their personal calendar", () => { expect(destination(actor)).toBe("/collaborator"); });
it("shows session creation and hides ordinary poll creation for collaborators", () => {
  render(<SessionPollsScreen pollsOnly />);
  expect(screen.getByRole("button", { name: "Créer un sondage de séance" })).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Créer un sondage simple" })).toBeNull();
});
it("loads and filters the administrator collaborator directory", async () => {
  const request = vi.spyOn(api, "request").mockResolvedValue([{ ...actor, activatedAt: "2026-01-01", memberships: [] }]);
  render(<CollaboratorsScreen />);
  await screen.findByRole("heading", { name: "Alice Test" });
  fireEvent.change(screen.getByLabelText("Rechercher un collaborateur"), { target: { value: "Alice" } });
  expect(request).toHaveBeenCalledWith("/admin/collaborators?search=&status=");
  expect(screen.getByRole("heading", { name: "Alice Test" })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Voir les groupes" }));
  expect(screen.getByLabelText("G1").hasAttribute("checked")).toBe(false);
});
it("shows collaborator directory errors with retry", async () => {
  vi.spyOn(api, "request").mockRejectedValue(Error("Service indisponible"));
  render(<CollaboratorsScreen />);
  expect((await screen.findByRole("alert")).textContent).toContain("Service indisponible");
  expect(screen.getByRole("button", { name: "Réessayer" })).toBeTruthy();
});
it("shows only report actions, with no student suspension controls for a collaborator", async () => {
  vi.spyOn(attendanceService, "alerts").mockResolvedValue([{ id: "alert", userId: "student", organizerId: actor.id, generation: 1, groupName: "G1", pollIds: ["p1", "p2", "p3"], createdAt: "2026-01-01", readAt: null, resolvedAt: null, user: { ...actor, id: "student", firstName: "Student", role: "USER", absenceState: null } }]);
  vi.spyOn(api, "request").mockResolvedValue({ alert: { id: "alert", userId: "student", organizerId: actor.id }, total: 3, sessions: [] });
  render(<OrganizerReports />);
  fireEvent.click(await screen.findByRole("button", { name: "Examiner les séances et corrections" }));
  await screen.findByText("3 absences actuelles chez cet organisateur.");
  expect(screen.getByRole("button", { name: "Confirmer le signalement" })).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Suspendre le compte étudiant" })).toBeNull();
});

it("translates the directory and invitation dialog into English with button icons", async () => {
  usePreferences.setState({ language: "en" });
  vi.spyOn(api, "request").mockResolvedValue([{ ...actor, activatedAt: "2026-01-01", memberships: [] }]);
  render(<CollaboratorsScreen />);
  await screen.findByRole("heading", { name: "Alice Test" });
  expect(screen.getByRole("heading", { name: "Collaborator management" })).toBeTruthy();
  expect(screen.queryByRole("textbox", { name: "First name" })).toBeNull();
  for (const name of ["Invite a collaborator", "Reset password", "Ban", "Delete"]) {
    expect(screen.getByRole("button", { name }).querySelector("svg")).toBeTruthy();
  }
  fireEvent.click(screen.getByRole("button", { name: "Invite a collaborator" }));
  const dialog = screen.getByRole("dialog", { name: "Invite a collaborator" });
  expect(within(dialog).getByLabelText("First name")).toBeTruthy();
  expect(within(dialog).getByLabelText("Last name")).toBeTruthy();
  expect(within(dialog).getByRole("button", { name: "Create and invite" })).toBeTruthy();
  expect(screen.queryByText("Gestion des collaborateurs")).toBeNull();
});

it("bans only after confirmation and offers reactivation without deleting data", async () => {
  let disabledAt: string | undefined;
  const request = vi.spyOn(api, "request").mockImplementation(async (_path, init) => {
    if (init?.method === "PATCH") { disabledAt = "2026-11-10"; return { success: true }; }
    return [{ ...actor, activatedAt: "2026-01-01", disabledAt, memberships: [] }];
  });
  render(<CollaboratorsScreen />);
  fireEvent.click(await screen.findByRole("button", { name: "Bannir" }));
  expect(request.mock.calls.filter(([, init]) => init?.method)).toHaveLength(0);
  expect(screen.getByRole("dialog", { name: "Bannir ce collaborateur ?" })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Annuler" }));
  expect(request.mock.calls.filter(([, init]) => init?.method)).toHaveLength(0);
  fireEvent.click(screen.getByRole("button", { name: "Bannir" }));
  fireEvent.click(screen.getByRole("button", { name: "Confirmer le bannissement" }));
  await screen.findByRole("button", { name: "Réactiver" });
  expect(request).toHaveBeenCalledWith("/admin/collaborators/collab-a/disabled", { method: "PATCH", body: JSON.stringify({ disabled: true }) });
  expect(request.mock.calls.some(([, init]) => init?.method === "DELETE")).toBe(false);
});

it("confirms permanent deletion explicitly and refreshes the directory", async () => {
  let removed = false;
  const request = vi.spyOn(api, "request").mockImplementation(async (_path, init) => {
    if (init?.method === "DELETE") { removed = true; return undefined; }
    return removed ? [] : [{ ...actor, activatedAt: "2026-01-01", memberships: [] }];
  });
  render(<CollaboratorsScreen />);
  fireEvent.click(await screen.findByRole("button", { name: "Supprimer" }));
  expect(request.mock.calls.filter(([, init]) => init?.method)).toHaveLength(0);
  expect(screen.getByText(/présences associées, seront supprimés définitivement/)).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Supprimer définitivement" }));
  await screen.findByRole("heading", { name: "Aucun collaborateur trouvé." });
  expect(request).toHaveBeenCalledWith("/users/collab-a", { method: "DELETE" });
  expect(screen.queryByRole("dialog")).toBeNull();
});

it("keeps the confirmation and collaborator when deletion fails", async () => {
  vi.spyOn(api, "request").mockImplementation(async (_path, init) => {
    if (init?.method === "DELETE") throw Error("Suppression refusée");
    return [{ ...actor, activatedAt: "2026-01-01", memberships: [] }];
  });
  render(<CollaboratorsScreen />);
  fireEvent.click(await screen.findByRole("button", { name: "Supprimer" }));
  fireEvent.click(screen.getByRole("button", { name: "Supprimer définitivement" }));
  expect((await screen.findByRole("alert")).textContent).toBe("Suppression refusée");
  expect(screen.getByRole("dialog")).toBeTruthy();
  expect(screen.getByRole("heading", { name: "Alice Test", hidden: true })).toBeTruthy();
});

it("translates organizer reports and their empty state into English", async () => {
  usePreferences.setState({ language: "en" });
  vi.spyOn(attendanceService, "alerts").mockResolvedValue([]);
  render(<OrganizerReports />);
  expect(screen.getByRole("heading", { name: "Reports by organizer" })).toBeTruthy();
  expect(await screen.findByText("No reports.")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Refresh" }).querySelector("svg")).toBeTruthy();
});

const directory = [
  { ...actor, activatedAt: "2026-03-01", joinedAt: "2026-03-01T12:00:00Z", memberships: [{ groupId: "group" }] },
  { ...actor, id: "invited", firstName: "Bruno", activatedAt: null, joinedAt: "2026-01-01T12:00:00Z", memberships: [] },
  { ...actor, id: "banned", firstName: "Charlie", activatedAt: "2026-01-01", disabledAt: "2026-02-02", joinedAt: "2026-02-01T12:00:00Z", memberships: [{ groupId: "group" }] },
];

it("keeps deduplicated status totals stable when tabs and search filter the table", async () => {
  vi.spyOn(api, "request").mockResolvedValue([...directory, directory[0]]);
  render(<CollaboratorsScreen />);
  await screen.findByRole("heading", { name: "Alice Test" });
  const count = (label: string) => screen.getByText(label).closest(".stat-card")?.querySelector("strong")?.textContent;
  expect(count("Total des collaborateurs")).toBe("3");
  expect(count("Invitations en attente")).toBe("1");
  expect(count("Collaborateurs actifs")).toBe("1");
  expect(count("Collaborateurs bannis")).toBe("1");
  fireEvent.click(screen.getByRole("tab", { name: /^Invités/ }));
  expect(screen.getByRole("heading", { name: "Bruno Test" })).toBeTruthy();
  expect(screen.queryByRole("heading", { name: "Alice Test" })).toBeNull();
  fireEvent.click(screen.getByRole("tab", { name: /^Tous les collaborateurs/ }));
  fireEvent.change(screen.getByRole("searchbox"), { target: { value: "charlie" } });
  expect(screen.getByRole("heading", { name: "Charlie Test" })).toBeTruthy();
  expect(count("Total des collaborateurs")).toBe("3");
  expect(count("Collaborateurs bannis")).toBe("1");
});

it("sorts by joined date and filters by actual collaborator group grants", async () => {
  vi.spyOn(api, "request").mockResolvedValue(directory);
  render(<CollaboratorsScreen />);
  await screen.findByRole("heading", { name: "Alice Test" });
  fireEvent.change(screen.getByLabelText("Trier par date"), { target: { value: "oldest" } });
  expect(screen.getAllByRole("heading", { level: 2 }).map((heading) => heading.textContent)).toEqual(["Bruno Test", "Charlie Test", "Alice Test"]);
  fireEvent.change(screen.getByLabelText("Groupe"), { target: { value: "group" } });
  expect(screen.queryByRole("heading", { name: "Bruno Test" })).toBeNull();
  expect(screen.getAllByRole("heading", { level: 2 })).toHaveLength(2);
});

it("validates and applies joined-date bounds, then resets all filters", async () => {
  vi.spyOn(api, "request").mockResolvedValue(directory);
  render(<CollaboratorsScreen />);
  await screen.findByRole("heading", { name: "Alice Test" });
  fireEvent.click(screen.getByRole("button", { name: "Filtres avancés" }));
  fireEvent.change(screen.getByLabelText("Date de début"), { target: { value: "2026-02-01" } });
  fireEvent.change(screen.getByLabelText("Date de fin"), { target: { value: "2026-01-01" } });
  expect((screen.getByRole("button", { name: "Appliquer la période" }) as HTMLButtonElement).disabled).toBe(true);
  expect(screen.getByRole("alert")).toBeTruthy();
  fireEvent.change(screen.getByLabelText("Date de fin"), { target: { value: "2026-02-28" } });
  fireEvent.click(screen.getByRole("button", { name: "Appliquer la période" }));
  expect(screen.getAllByRole("heading", { level: 2 }).map((heading) => heading.textContent)).toEqual(["Charlie Test"]);
  fireEvent.click(screen.getByRole("button", { name: "Réinitialiser" }));
  expect(screen.getAllByRole("heading", { level: 2 })).toHaveLength(3);
});

it("updates group grants from the table's group dialog", async () => {
  let memberships: { groupId: string }[] = [];
  const request = vi.spyOn(api, "request").mockImplementation(async (_path, init) => {
    if (init?.method === "PUT") { memberships = [{ groupId: "group" }]; return { success: true }; }
    return [{ ...actor, activatedAt: "2026-01-01", memberships }];
  });
  render(<CollaboratorsScreen />);
  fireEvent.click(await screen.findByRole("button", { name: "Voir les groupes" }));
  fireEvent.click(screen.getByRole("checkbox", { name: "G1" }));
  await waitFor(() => expect((screen.getByRole("checkbox", { name: "G1" }) as HTMLInputElement).checked).toBe(true));
  expect(request).toHaveBeenCalledWith("/admin/collaborators/collab-a/groups/group", { method: "PUT", body: JSON.stringify({ granted: true }) });
});
