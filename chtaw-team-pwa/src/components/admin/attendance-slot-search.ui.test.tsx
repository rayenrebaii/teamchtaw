import React from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { AttendanceSlotSearch } from "./attendance-slot-search";
import { attendanceService, type AttendanceSession } from "@/services/attendance.service";
import { useCommunity } from "@/stores/community";
import { usePreferences } from "@/stores/preferences";
import type { User } from "@/types";

const user: User = { id: "coach", firstName: "Coach", lastName: "Test", email: "coach@example.invalid", role: "COLLABORATOR", status: "APPROVED", joinedAt: "2026-01-01", bio: "" };
const session: AttendanceSession = { id: "session", question: "Maths", group: { id: "g1", name: "Groupe 1" }, groups: [{ id: "g1", name: "Groupe 1" }, { id: "g2", name: "Groupe 2" }], status: "OPEN", phase: "UPCOMING", mandatoryAttendance: false, lastEnd: null, concerned: 2, present: 0, toVerify: 0,
  options: [{ id: "a", label: "Horaire A", startsAt: "2101-01-01T23:30:00Z" }, { id: "b", label: "Horaire B", startsAt: "2101-01-03T10:00:00Z" }] };
beforeEach(() => {
  usePreferences.setState({ language: "fr" });
  useCommunity.getState().clear();
  useCommunity.setState({ users: [user], session: { userId: user.id, mode: "real" }, groups: [{ id: "g1", name: "Groupe 1", description: "", color: "#000000", isGeneral: false, memberIds: [] }] });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

it("filtre par date de Tunis et groupe puis ouvre le créneau choisi", async () => {
  const get = vi.spyOn(attendanceService, "sessions").mockResolvedValue({ items: [session], total: 1 });
  render(<AttendanceSlotSearch />);
  expect(await screen.findByText("Horaire A")).toBeTruthy();
  expect(screen.getAllByText("Groupe 1 · Groupe 2")).toHaveLength(2);
  fireEvent.change(screen.getByLabelText("Date de séance"), { target: { value: "2101-01-02" } });
  fireEvent.change(screen.getByLabelText("Groupe"), { target: { value: "g1" } });
  await waitFor(() => expect(get).toHaveBeenLastCalledWith({ page: "1", groupId: "g1", from: "2101-01-02", to: "2101-01-02" }));
  expect(screen.getByText("Horaire A")).toBeTruthy();
  expect(screen.queryByText("Horaire B")).toBeNull();
  expect(screen.getByRole("link", { name: "Ouvrir la liste" }).getAttribute("href")).toBe("/collaborator/attendance/session?slot=a");
});
