import React from "react";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { AdminScreen } from "./admin-screen";
import { attendanceService } from "@/services/attendance.service";
import { useCommunity } from "@/stores/community";
import { usePreferences } from "@/stores/preferences";
import type { User, Poll } from "@/types";
const sync = useCommunity.getState().sync;
const admin: User = { id: "admin", firstName: "Admin", lastName: "Team", email: "admin@test.invalid", role: "ADMIN", status: "APPROVED", joinedAt: "2026-01-01T00:00:00Z", bio: "" };
const poll: Poll = { id: "poll", groupId: "group", authorId: admin.id, question: "Séance test", type: "SESSION", singleChoice: false, status: "OPEN", votes: [],
  options: [{ id: "one", label: "Horaire 1", startsAt: "2099-01-01T10:00:00Z" }, { id: "two", label: "Horaire 2", startsAt: "2099-01-02T10:00:00Z" }] };
beforeEach(() => {
  usePreferences.setState({ language: "fr" });
  useCommunity.getState().clear();
  useCommunity.setState({ users: [admin], session: { userId: admin.id, mode: "real" }, groups: [{ id: "group", name: "G1", color: "#be9af5", isGeneral: false, description: "", memberIds: [admin.id] }], polls: [poll], sync: vi.fn().mockResolvedValue(undefined) });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); useCommunity.setState({ sync }); });
it("confirms slot removal, retains the remaining slot and prevents deleting the final slot alone", async () => {
  const remove = vi.spyOn(attendanceService, "removeSlot").mockResolvedValue({ ...poll, options: [poll.options[1]!] });
  render(<AdminScreen page="polls" />);
  fireEvent.click(screen.getByRole("button", { name: "Gérer la séance : Séance test" }));
  fireEvent.click(screen.getByRole("button", { name: "Retirer le créneau : Horaire 1" }));
  expect(remove).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Annuler" }));
  expect(remove).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Retirer le créneau : Horaire 1" }));
  fireEvent.click(screen.getByRole("button", { name: "Confirmer la suppression" }));
  await waitFor(() => expect(screen.queryByRole("button", { name: "Retirer le créneau : Horaire 1" })).toBeNull());
  expect(remove).toHaveBeenCalledWith(poll.id, "one");
  expect(screen.getByRole("button", { name: "Retirer le créneau : Horaire 2" }).hasAttribute("disabled")).toBe(true);
});
it("confirms complete deletion and removes the session from the page and calendar data", async () => {
  const remove = vi.spyOn(attendanceService, "remove").mockResolvedValue(undefined);
  render(<AdminScreen page="polls" />);
  fireEvent.click(screen.getByRole("button", { name: "Gérer la séance : Séance test" }));
  fireEvent.click(screen.getByRole("button", { name: "Supprimer la séance" }));
  expect(remove).not.toHaveBeenCalled();
  expect(screen.getByText(/Cette action est irréversible/)).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Confirmer la suppression" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(remove).toHaveBeenCalledWith(poll.id);
  expect(useCommunity.getState().polls).toHaveLength(0);
});
it("keeps the session and reports a deletion failure", async () => {
  vi.spyOn(attendanceService, "remove").mockRejectedValue(Error("Connection failed"));
  render(<AdminScreen page="polls" />);
  fireEvent.click(screen.getByRole("button", { name: "Gérer la séance : Séance test" }));
  fireEvent.click(screen.getByRole("button", { name: "Supprimer la séance" }));
  fireEvent.click(screen.getByRole("button", { name: "Confirmer la suppression" }));
  expect(await screen.findByRole("alert")).toBeTruthy();
  expect(useCommunity.getState().polls).toHaveLength(1);
});
