import React from "react";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ProfileScreen } from "./account-screen";
import { PollCard } from "./polls/poll-card";
import { GroupMembers } from "./chat/group-members";
import { useCommunity } from "@/stores/community";
import { usePreferences } from "@/stores/preferences";
import type { User, Poll } from "@/types";
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn(), push: vi.fn() }) }));
const actor: User = { id: "actor", firstName: "Coach", lastName: "Team", email: "coach@test.invalid", role: "ADMIN", status: "APPROVED", joinedAt: "2026-01-01T00:00:00Z", bio: "" };
const collaborator: User = { ...actor, id: "collaborator", firstName: "Collab", role: "COLLABORATOR" };
const client: User = { ...actor, id: "client", firstName: "Client", role: "USER" };
const group = { id: "group", name: "G1", isGeneral: false, description: "", color: "#be9af5", memberIds: [actor.id, collaborator.id, client.id] };
const poll: Poll = { id: "poll", groupId: group.id, authorId: "organizer", question: "Votre choix ?", type: "SESSION", status: "OPEN", singleChoice: true, votes: [], options: [{ id: "one", label: "Option 1" }, { id: "two", label: "Option 2" }] };
const original = { vote: useCommunity.getState().vote, membership: useCommunity.getState().membership };
beforeEach(() => {
  usePreferences.setState({ language: "fr" });
  useCommunity.getState().clear();
  useCommunity.setState({ session: { userId: actor.id, mode: "real" }, users: [actor, collaborator, client], groups: [group], vote: vi.fn().mockResolvedValue(undefined), membership: vi.fn().mockResolvedValue(undefined) });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); useCommunity.setState(original); });

it.each(["ADMIN", "COLLABORATOR", "USER"] as const)("shows a personal attendance link only for the client (%s)", (role) => {
  useCommunity.setState({ users: [{ ...actor, role }] });
  render(<ProfileScreen />);
  expect(!!screen.queryByRole("link", { name: "Mon historique de présence" })).toBe(role === "USER");
  expect(screen.queryByRole("button", { name: "Mon historique de présence" })).toBeNull();
});

it.each(["ADMIN", "COLLABORATOR"] as const)("prevents %s from selecting, confirming or editing a session vote", (role) => {
  useCommunity.setState({ users: [{ ...actor, role }] });
  render(<PollCard poll={poll} />);
  const option = screen.getByRole("button", { name: "Option 1" });
  expect(option.hasAttribute("disabled")).toBe(true);
  fireEvent.click(option);
  expect(screen.queryByRole("button", { name: "Confirmer le vote" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Modifier mon vote" })).toBeNull();
  expect(useCommunity.getState().vote).not.toHaveBeenCalled();
});

it.each(["ADMIN", "COLLABORATOR", "USER"] as const)("allows %s to vote in an ordinary poll", async (role) => {
  useCommunity.setState({ users: [{ ...actor, role }] });
  render(<PollCard poll={{ ...poll, type: "ORDINARY" }} />);
  fireEvent.click(screen.getByRole("button", { name: "Option 1" }));
  fireEvent.click(screen.getByRole("button", { name: "Confirmer le vote" }));
  await waitFor(() => expect(useCommunity.getState().vote).toHaveBeenCalledWith(poll.id, ["one"], false));
});

it("keeps session voting available to clients", async () => {
  useCommunity.setState({ users: [{ ...actor, role: "USER" }] });
  render(<PollCard poll={poll} />);
  fireEvent.click(screen.getByRole("button", { name: "Option 1" }));
  fireEvent.click(screen.getByRole("button", { name: "Confirmer le vote" }));
  await waitFor(() => expect(useCommunity.getState().vote).toHaveBeenCalledWith(poll.id, ["one"], false));
});

it.each(["collaborator", "client"])("lets the admin remove a %s with confirmation while retaining the account", async (id) => {
  render(<GroupMembers group={group} />);
  const member = id === "collaborator" ? collaborator : client;
  const remove = screen.getByRole("button", { name: `Retirer ${member.firstName} Team du groupe` });
  fireEvent.click(remove);
  expect(screen.getByText(/Son compte sera conservé/)).toBeTruthy();
  expect(useCommunity.getState().membership).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Confirmer le retrait" }));
  await waitFor(() => expect(useCommunity.getState().membership).toHaveBeenCalledWith(group.id, id, false));
  expect(useCommunity.getState().users.some((user) => user.id === id)).toBe(true);
  expect(screen.queryByRole("button", { name: "Retirer Coach Team du groupe" })).toBeNull();
});

it.each(["USER", "COLLABORATOR"] as const)("does not expose group member removal to %s", (role) => {
  useCommunity.setState({ users: [{ ...actor, role }, collaborator, client] });
  render(<GroupMembers group={group} />);
  expect(screen.queryByRole("button", { name: /Retirer .* du groupe/ })).toBeNull();
});

it("preserves automatic general group membership", () => {
  render(<GroupMembers group={{ ...group, isGeneral: true }} />);
  expect(screen.queryByRole("button", { name: /Retirer .* du groupe/ })).toBeNull();
});

it("keeps the removal confirmation available after a server refusal", async () => {
  useCommunity.setState({ membership: vi.fn().mockRejectedValue(Error("Refus serveur")) });
  render(<GroupMembers group={group} />);
  fireEvent.click(screen.getByRole("button", { name: "Retirer Collab Team du groupe" }));
  fireEvent.click(screen.getByRole("button", { name: "Confirmer le retrait" }));
  await waitFor(() => expect(screen.getByRole("button", { name: "Confirmer le retrait" }).hasAttribute("disabled")).toBe(false));
  expect(useCommunity.getState().users).toContainEqual(collaborator);
});
