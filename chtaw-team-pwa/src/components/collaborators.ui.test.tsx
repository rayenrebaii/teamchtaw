import React from "react";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
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
  fireEvent.change(screen.getByLabelText("Rechercher"), { target: { value: "Alice" } });
  await waitFor(() => expect(request).toHaveBeenCalledWith("/admin/collaborators?search=Alice&status="));
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
