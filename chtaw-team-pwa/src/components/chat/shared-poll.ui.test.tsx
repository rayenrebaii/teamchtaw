import React from "react";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { ChatScreen } from "./chat-screen";
import { useCommunity } from "@/stores/community";
import { usePreferences } from "@/stores/preferences";
import type { User, Poll } from "@/types";
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
const collaborator: User = { id: "collaborator", firstName: "Collab", lastName: "Team", email: "collab@test.invalid", role: "COLLABORATOR", status: "APPROVED", joinedAt: "2026-01-01T00:00:00Z", bio: "" };
const poll: Poll = { id: "admin-session", groupId: "group", authorId: "admin", question: "Séance de l’admin", type: "SESSION", status: "OPEN", singleChoice: false, options: [{ id: "one", label: "Matin" }], votes: [] };
const actions = { loadHistory: useCommunity.getState().loadHistory, vote: useCommunity.getState().vote };
beforeEach(() => {
  usePreferences.setState({ language: "fr" });
  useCommunity.getState().clear();
  useCommunity.setState({ session: { userId: collaborator.id, mode: "real" }, users: [collaborator],
    groups: [{ id: "group", name: "G1", isGeneral: false, description: "", color: "#be9af5", memberIds: [collaborator.id] }],
    polls: [], messages: [{ id: "message", groupId: "group", authorId: "admin", kind: "poll", text: "", createdAt: "2026-11-12T10:00:00Z", pollId: poll.id, poll }],
    loadHistory: vi.fn().mockResolvedValue(undefined), vote: vi.fn().mockResolvedValue(undefined) });
  HTMLElement.prototype.scrollIntoView = vi.fn();
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); useCommunity.setState(actions); });

it("shows a foreign organizer's session from the message without relying on the management list or exposing voting", () => {
  render(<ChatScreen groupId="group" />);
  expect(screen.getByRole("heading", { name: poll.question })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Matin" }).hasAttribute("disabled")).toBe(true);
  expect(screen.queryByRole("button", { name: "Confirmer le vote" })).toBeNull();
  expect(screen.queryByRole("button", { name: /Supprimer le sondage/ })).toBeNull();
  expect(useCommunity.getState().polls).toHaveLength(0);
});

it("keeps the chat card updated from poll events after the management list is refreshed", () => {
  render(<ChatScreen groupId="group" />);
  act(() => useCommunity.getState().receivePoll({ ...poll, votes: [{ userId: "client", optionIds: ["one"] }] }));
  act(() => useCommunity.setState({ polls: [] }));
  expect(screen.getByText("1 participation")).toBeTruthy();
  expect(useCommunity.getState().messages[0]?.poll?.votes).toHaveLength(1);
  expect(screen.queryByRole("button", { name: "Confirmer le vote" })).toBeNull();
});
