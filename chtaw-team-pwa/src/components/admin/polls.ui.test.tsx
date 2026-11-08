import React from "react";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within, waitFor } from "@testing-library/react";
import { AdminScreen } from "./admin-screen";
import { useCommunity } from "@/stores/community";
import { usePreferences } from "@/stores/preferences";
import type { User, Poll } from "@/types";
import { attendanceService } from "@/services/attendance.service";
const actions = { sync: useCommunity.getState().sync, publishPoll: useCommunity.getState().publishPoll };
const admin: User = { id: "admin", firstName: "Admin", lastName: "Team", email: "admin@test.invalid", role: "ADMIN", status: "APPROVED", joinedAt: "2026-01-01T00:00:00Z", bio: "" };
const voter: User = { ...admin, id: "voter", firstName: "Nadia", role: "USER", email: "nadia@test.invalid" };
const nonVoter: User = { ...voter, id: "no-vote", firstName: "Amine", email: "amine@test.invalid" };
const poll: Poll = { id: "poll", groupId: "group", authorId: admin.id, question: "Quel créneau ?", type: "SESSION", status: "OPEN", singleChoice: false,
  options: [{ id: "a", label: "Choix A" }, { id: "b", label: "Choix B" }, { id: "c", label: "Choix C" }], votes: [{ userId: voter.id, optionIds: ["a", "b"] }, { userId: nonVoter.id, optionIds: [] }] };
beforeEach(() => {
  useCommunity.getState().clear();
  usePreferences.setState({ language: "fr" });
  useCommunity.setState({ ...actions, session: { userId: admin.id, mode: "real" }, users: [admin, voter, nonVoter, { ...nonVoter, id: "other", firstName: "Other" }],
    groups: [{ id: "group", name: "G1", description: "", isGeneral: false, color: "#be9af5", memberIds: [admin.id, voter.id, nonVoter.id] }], polls: [poll],
    sync: vi.fn().mockResolvedValue(undefined), publishPoll: vi.fn().mockResolvedValue(undefined) });
});
afterEach(() => { cleanup(); useCommunity.setState(actions); vi.restoreAllMocks(); });
it("keeps both poll types and their results without attendance controls", () => {
  render(<AdminScreen page="polls" />);
  expect(screen.getByRole("heading", { name: "Sondages", level: 1 })).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Créer une séance" })).toBeNull();
  expect(screen.getByRole("button", { name: "Créer un sondage de séance" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Créer un sondage simple" })).toBeTruthy();
  expect(screen.getByRole("tab", { name: /Sondages de séance/ })).toBeTruthy();
  expect(screen.getByRole("tab", { name: /Sondages simples/ })).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Présences et alertes" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Voir les résultats : Quel créneau ?" }));
  const dialog = within(screen.getByRole("dialog", { name: "Résultats du sondage" }));
  for (const choice of ["Choix A", "Choix B"]) expect(within(dialog.getByRole("region", { name: choice })).getByText(voter.email)).toBeTruthy();
  expect(within(dialog.getByRole("region", { name: "Choix C" })).getByText("Aucun vote pour ce choix.")).toBeTruthy();
  const missing = within(dialog.getByRole("region", { name: "Membres sans vote" }));
  expect(missing.getByText(nonVoter.email)).toBeTruthy();
  expect(missing.queryByText(admin.email)).toBeNull();
  expect(missing.queryByText(voter.email)).toBeNull();
  expect(dialog.queryByText("Other Team")).toBeNull();
  expect(dialog.queryByText(/présence|absence/i)).toBeNull();
});
it("keeps ordinary poll publishing with group selection and choices", async () => {
  render(<AdminScreen page="polls" />);
  fireEvent.click(screen.getByRole("button", { name: "Créer un sondage simple" }));
  const dialog = within(screen.getByRole("dialog", { name: "Créer un sondage" }));
  fireEvent.change(dialog.getByRole("combobox"), { target: { value: "group" } });
  fireEvent.change(dialog.getByLabelText("Votre question"), { target: { value: "Votre préférence ?" } });
  const choices = dialog.getAllByRole("textbox");
  fireEvent.change(choices[1]!, { target: { value: "Choix 1" } });
  fireEvent.change(choices[2]!, { target: { value: "Choix 2" } });
  fireEvent.click(dialog.getByRole("button", { name: "Publier le sondage" }));
  await waitFor(() => expect(useCommunity.getState().publishPoll).toHaveBeenCalledWith(expect.objectContaining({ groupId: "group", question: "Votre préférence ?", options: [{ id: "0", label: "Choix 1" }, { id: "1", label: "Choix 2" }] })));
});
it("preserves session poll publishing with its time slots and existing API behavior", async () => {
  const create = vi.spyOn(attendanceService, "create").mockResolvedValue(poll);
  render(<AdminScreen page="polls" />);
  fireEvent.click(screen.getByRole("button", { name: "Créer un sondage de séance" }));
  const dialog = within(screen.getByRole("dialog", { name: "Créer un sondage de séance" }));
  expect(dialog.queryByText(/présence|absence|pointage/i)).toBeNull();
  fireEvent.change(dialog.getByLabelText("Titre"), { target: { value: "Choisissez un créneau" } });
  fireEvent.change(dialog.getByLabelText("Groupe"), { target: { value: "group" } });
  fireEvent.change(dialog.getByLabelText("Date limite de vote"), { target: { value: "2099-01-01T10:00" } });
  fireEvent.change(dialog.getByLabelText("Date et heure"), { target: { value: "2099-01-02T10:00" } });
  fireEvent.change(dialog.getByLabelText("Fin du créneau"), { target: { value: "2099-01-02T11:00" } });
  fireEvent.click(dialog.getByRole("button", { name: "Publier le sondage de séance" }));
  await waitFor(() => expect(create).toHaveBeenCalledWith("group", expect.objectContaining({ question: "Choisissez un créneau", type: "SESSION", singleChoice: false, mandatoryAttendance: true, options: ["Horaire 1"] })));
});
it("shows an explicit warning instead of claiming everyone has voted when group loading fails", () => {
  useCommunity.setState({ syncErrors: { groups: "Indisponible" } });
  render(<AdminScreen page="polls" />);
  fireEvent.click(screen.getByRole("button", { name: "Voir les résultats : Quel créneau ?" }));
  const dialog = within(screen.getByRole("dialog"));
  expect(dialog.getByRole("alert")).toBeTruthy();
  expect(dialog.queryByText("Tous les membres du groupe ont voté.")).toBeNull();
});
