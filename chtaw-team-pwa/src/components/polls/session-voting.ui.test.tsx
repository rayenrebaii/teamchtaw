import React from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { PollCard } from "./poll-card";
import { SessionEditor } from "./session-editor";
import { useCommunity } from "@/stores/community";
import { usePreferences } from "@/stores/preferences";
import type { Poll, User } from "@/types";

const originalVote = useCommunity.getState().vote;
const user: User = { id: "student", firstName: "Test", lastName: "Student", email: "test@example.invalid", role: "USER", status: "APPROVED", bio: "", joinedAt: "2026-01-01T00:00:00Z" };
const poll: Poll = { id: "poll", groupId: "group", authorId: "admin", question: "Séance", type: "SESSION", status: "OPEN", singleChoice: false, options: ["a", "b"].map((id) => ({ id, label: id, capacity: 1, startsAt: "2099-01-01T19:00:00Z", endsAt: "2099-01-01T20:30:00Z" })), votes: [] };
beforeEach(() => {
  usePreferences.setState({ language: "fr" });
  useCommunity.getState().clear();
  useCommunity.setState({ users: [user], session: { userId: user.id, mode: "real" }, vote: vi.fn().mockResolvedValue(undefined) });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); useCommunity.setState({ vote: originalVote }); });

it("uses one choice even when a historical session advertises multiple choice", async () => {
  render(<PollCard poll={poll} />);
  fireEvent.click(screen.getByRole("button", { name: "a" }));
  fireEvent.click(screen.getByRole("button", { name: "b" }));
  fireEvent.click(screen.getByRole("button", { name: "Confirmer le vote" }));
  await waitFor(() => expect(useCommunity.getState().vote).toHaveBeenCalledWith("poll", ["b"], false));
  expect(screen.getAllByText(/0 \/ 1/)).toHaveLength(2);
  expect(screen.getAllByText(/1 h 30/)).toHaveLength(2);
});
it("shows full slots while allowing the current student to withdraw their own full reservation", async () => {
  render(<PollCard poll={{ ...poll, votes: [{ userId: user.id, optionIds: ["a"] }, { userId: "other", optionIds: ["b"] }] }} />);
  expect(screen.getAllByText(/Complet/)).toHaveLength(2);
  fireEvent.click(screen.getByRole("button", { name: "Modifier mon vote" }));
  expect(screen.getByRole("button", { name: "b" }).hasAttribute("disabled")).toBe(true);
  expect(screen.getByRole("button", { name: "a" }).hasAttribute("disabled")).toBe(false);
  fireEvent.click(screen.getByRole("button", { name: "a" }));
  fireEvent.click(screen.getByRole("button", { name: "Retirer mon vote" }));
  await waitFor(() => expect(useCommunity.getState().vote).toHaveBeenCalledWith("poll", [], true));
});
it("closes only the started slot while a future slot remains selectable", () => {
  render(<PollCard poll={{ ...poll, options: [{ ...poll.options[0]!, startsAt: "2020-01-01T19:00:00Z" }, poll.options[1]!] }} />);
  expect(screen.getByRole("button", { name: "a" }).hasAttribute("disabled")).toBe(true);
  expect(screen.getByRole("button", { name: "b" }).hasAttribute("disabled")).toBe(false);
  expect(screen.getByText(/Clôturé/)).toBeTruthy();
});
it("offers capacity and Tunis start time without end time or voting deadline fields", () => {
  render(<SessionEditor close={vi.fn()} />);
  expect(screen.queryByLabelText("Date limite de vote")).toBeNull();
  expect(screen.queryByLabelText("Fin du créneau")).toBeNull();
  expect(screen.getByLabelText("Nombre maximal de participants").getAttribute("min")).toBe("1");
  expect(screen.getByLabelText("Date et heure")).toBeTruthy();
});
