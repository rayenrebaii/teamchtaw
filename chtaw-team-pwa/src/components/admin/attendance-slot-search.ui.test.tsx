import React from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { AttendanceSlotSearch } from "./attendance-slot-search";
import { attendanceService, type AttendanceSession, type Roster } from "@/services/attendance.service";
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

it("selects individual time slots, selects the page and clears selection on filter changes", async () => {
  vi.spyOn(attendanceService, "sessions").mockResolvedValue({ items: [session], total: 1 });
  render(<AttendanceSlotSearch />);
  const first = await screen.findByRole("checkbox", { name: "Sélectionner Maths · Horaire A" });
  fireEvent.click(first);
  expect(screen.getByRole("checkbox", { name: "Sélectionner Maths · Horaire B" })).toHaveProperty("checked", false);
  expect(screen.getByRole("checkbox", { name: "Sélectionner les horaires de cette page" })).toHaveProperty("indeterminate", true);
  fireEvent.click(screen.getByRole("checkbox", { name: "Sélectionner les horaires de cette page" }));
  expect(screen.getByText("2 sélectionné(s)")).toBeTruthy();
  fireEvent.change(screen.getByLabelText("Groupe"), { target: { value: "g1" } });
  await waitFor(() => expect(screen.getByText("0 sélectionné(s)")).toBeTruthy());
  expect(screen.getByRole("checkbox", { name: "Sélectionner Maths · Horaire A" })).toHaveProperty("checked", false);
});

it("exports only selected slots and fetches their shared roster once without changing attendance", async () => {
  vi.spyOn(attendanceService, "sessions").mockResolvedValue({ items: [session], total: 1 });
  const roster: Roster = { id: session.id, question: session.question, group: session.group, status: "CLOSED", attendanceLockedAt: null,
    slots: session.options.map(option => ({ id: option.id, label: option.label, startsAt: option.startsAt!, students: [{ user, attendance: "PRESENT", version: 1, absences: 0, final: "PRESENT" }] })) };
  const get = vi.spyOn(attendanceService, "roster").mockResolvedValue(roster);
  const save = vi.spyOn(attendanceService, "save");
  const create = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:attendance-test");
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
  render(<AttendanceSlotSearch />);
  fireEvent.click(await screen.findByRole("checkbox", { name: "Sélectionner Maths · Horaire B" }));
  fireEvent.click(screen.getByRole("button", { name: "Exporter les listes sélectionnées (1)" }));
  await screen.findByText("Export téléchargé.");
  expect(get).toHaveBeenCalledExactlyOnceWith("session");
  expect(save).not.toHaveBeenCalled();
  const file = create.mock.calls[0][0] as Blob;
  const content = await new Promise<string>(resolve => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.readAsText(file); });
  expect(content).toContain("Horaire B");
  expect(content).not.toContain("Horaire A");
  expect(content).toContain(user.email);
});

it("keeps selection and does not download an incomplete export when a roster fails", async () => {
  vi.spyOn(attendanceService, "sessions").mockResolvedValue({ items: [session], total: 1 });
  vi.spyOn(attendanceService, "roster").mockRejectedValue(Error("Export impossible. Veuillez réessayer."));
  const create = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:unused");
  render(<AttendanceSlotSearch />);
  fireEvent.click(await screen.findByRole("checkbox", { name: "Sélectionner Maths · Horaire A" }));
  fireEvent.click(screen.getByRole("button", { name: "Exporter les listes sélectionnées (1)" }));
  await screen.findByRole("alert");
  expect(create).not.toHaveBeenCalled();
  expect(screen.getByRole("checkbox", { name: "Sélectionner Maths · Horaire A" })).toHaveProperty("checked", true);
});
