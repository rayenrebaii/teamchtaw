import React from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { SessionEditor } from "./session-editor";
import { SessionManagement } from "@/components/admin/session-management";
import { useCommunity } from "@/stores/community";
import { usePreferences } from "@/stores/preferences";
import { attendanceService } from "@/services/attendance.service";
import type { Poll, User } from "@/types";
import { filterActivities, defaultActivityFilters } from "@/features/session-polls";
const originalSync = useCommunity.getState().sync;
const admin: User = { id: "admin", firstName: "Admin", lastName: "Team", email: "admin@test.invalid", role: "ADMIN", status: "APPROVED", joinedAt: "2026-01-01T00:00:00Z", bio: "" };
const groups = ["a", "b", "c"].map(id => ({ id, name: `Group ${id}`, description: "", color: "#be9af5", isGeneral: false, memberIds: [admin.id] }));
const poll: Poll = { id: "shared", groupId: "a", groupIds: ["a", "b"], groups: groups.slice(0, 2), type: "SESSION", question: "Shared training", authorId: admin.id, status: "OPEN", singleChoice: true,
  options: ["one", "two"].map(id => ({ id, label: id, startsAt: "2099-01-01T10:00:00Z", capacity: 10 })),
  votes: Array.from({ length: 8 }, (_, index) => ({ userId: `student${index}`, optionIds: ["one"] })) };
beforeEach(() => { usePreferences.setState({ language: "fr" }); useCommunity.getState().clear(); useCommunity.setState({ groups, users: [admin], session: { userId: admin.id, mode: "real" }, polls: [poll], sync: vi.fn().mockResolvedValue(undefined) }); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); useCommunity.setState({ sync: originalSync }); });
it("creates one session with several selected groups and shared capacities", async () => {
  const create = vi.spyOn(attendanceService, "create").mockResolvedValue(poll);
  render(<SessionEditor close={vi.fn()} />);
  fireEvent.click(screen.getByRole("checkbox", { name: "Group a" })); fireEvent.click(screen.getByRole("checkbox", { name: "Group b" }));
  fireEvent.change(screen.getByLabelText("Titre"), { target: { value: "Shared training" } });
  fireEvent.change(screen.getByLabelText("Date et heure"), { target: { value: "2099-01-01T10:00" } });
  fireEvent.change(screen.getByLabelText("Nombre maximal de participants"), { target: { value: "10" } });
  fireEvent.submit(screen.getByLabelText("Titre").closest("form")!);
  await waitFor(() => expect(create).toHaveBeenCalledWith("a", expect.objectContaining({ groupIds: ["a", "b"], capacities: [10] })));
  expect(create).toHaveBeenCalledTimes(1);
});
it("adds a group to the existing poll without resetting votes and confirms the affected count", async () => {
  const saved = { ...poll, groupIds: ["a", "b", "c"], groups };
  const add = vi.spyOn(attendanceService, "addGroups").mockResolvedValue(saved);
  const { rerender } = render(<SessionManagement poll={poll} close={vi.fn()} />);
  fireEvent.click(screen.getByRole("checkbox", { name: "Group c" }));
  fireEvent.click(screen.getByRole("button", { name: "Ajouter les groupes sélectionnés" }));
  await waitFor(() => expect(add).toHaveBeenCalledWith("shared", ["c"]));
  expect(useCommunity.getState().polls[0]!.votes).toHaveLength(8);
  rerender(<SessionManagement poll={saved} close={vi.fn()} />);
  fireEvent.click(screen.getByRole("button", { name: "Retirer le créneau : one" }));
  expect(screen.getByText("8 étudiant(s) concerné(s).")).toBeTruthy();
});
it("merges realtime updates for secondary members once and retains the poll when another group is removed", () => {
  useCommunity.setState({ groups: [groups[1]!], polls: [] });
  useCommunity.getState().receivePoll(poll); useCommunity.getState().receivePoll(poll);
  expect(useCommunity.getState().polls).toHaveLength(1);
  useCommunity.getState().removeGroup("a"); expect(useCommunity.getState().polls).toHaveLength(1);
  useCommunity.getState().removeGroup("b"); expect(useCommunity.getState().polls).toHaveLength(0);
});
it("filters a shared activity through any of its groups", () => {
  expect(filterActivities([poll], { ...defaultActivityFilters, groupId: "b" })).toHaveLength(1);
});
