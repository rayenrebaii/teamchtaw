import React from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { ChatScreen } from "./chat-screen";
import { useCommunity } from "@/stores/community";
import { usePreferences } from "@/stores/preferences";
import { attendanceService } from "@/services/attendance.service";
import type { User, Poll } from "@/types";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
const actions = { sync: useCommunity.getState().sync, loadHistory: useCommunity.getState().loadHistory };
const actor: User = { id: "organizer", firstName: "Team", lastName: "Coach", email: "coach@example.invalid", role: "ADMIN", status: "APPROVED", joinedAt: "2026-01-01T00:00:00Z", bio: "" };

beforeEach(() => {
  usePreferences.setState({ language: "fr" });
  useCommunity.getState().clear();
  useCommunity.setState({ users: [actor], session: { userId: actor.id, mode: "real" },
    groups: ["general", "private"].map((id) => ({ id, name: id, description: "", isGeneral: id === "general", color: "#be9af5", memberIds: [actor.id] })),
    sync: vi.fn().mockResolvedValue(undefined), loadHistory: vi.fn().mockResolvedValue(undefined) });
  HTMLElement.prototype.scrollIntoView = vi.fn();
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); useCommunity.setState(actions); });

it.each([
  ["ADMIN", "general"], ["ADMIN", "private"],
  ["COLLABORATOR", "general"], ["COLLABORATOR", "private"],
] as const)("publishes a session from %s's %s conversation into that group", async (role, groupId) => {
  useCommunity.setState({ users: [{ ...actor, role }] });
  const saved: Poll = { id: "session", groupId, authorId: actor.id, question: "Séance du groupe", type: "SESSION", singleChoice: false, options: [], votes: [] };
  const create = vi.spyOn(attendanceService, "create").mockResolvedValue(saved);
  render(<ChatScreen groupId={groupId} />);
  expect(!!screen.queryByRole("button", { name: "Créer un sondage" })).toBe(role === "ADMIN");
  fireEvent.click(screen.getByRole("button", { name: "Créer un sondage de séance" }));
  const dialog = within(screen.getByRole("dialog", { name: "Créer un sondage de séance" }));
  expect(dialog.getByLabelText("Groupe")).toHaveProperty("value", groupId);
  expect(dialog.getByLabelText("Groupe").hasAttribute("disabled")).toBe(true);
  fireEvent.change(dialog.getByLabelText("Titre"), { target: { value: saved.question } });
  fireEvent.change(dialog.getByLabelText("Date limite de vote"), { target: { value: "2099-01-01T10:00" } });
  fireEvent.change(dialog.getByLabelText("Date et heure"), { target: { value: "2099-01-02T10:00" } });
  fireEvent.change(dialog.getByLabelText("Fin du créneau"), { target: { value: "2099-01-02T11:00" } });
  fireEvent.click(dialog.getByRole("button", { name: "Publier le sondage de séance" }));
  await waitFor(() => expect(create).toHaveBeenCalledWith(groupId, expect.objectContaining({ type: "SESSION", question: saved.question, singleChoice: false, mandatoryAttendance: true, options: ["Horaire 1"] })));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(useCommunity.getState().polls).toContainEqual(saved);
  expect(useCommunity.getState().sync).toHaveBeenCalled();
});

it("hides session and ordinary poll creation for a member", () => {
  useCommunity.setState({ users: [{ ...actor, role: "USER" }] });
  render(<ChatScreen groupId="general" />);
  expect(screen.queryByRole("button", { name: "Créer un sondage de séance" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Créer un sondage" })).toBeNull();
});
