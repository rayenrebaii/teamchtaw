import React from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { DeleteContent } from "./delete-content";
import { ChatScreen } from "./chat/chat-screen";
import { useCommunity } from "@/stores/community";
import { usePreferences } from "@/stores/preferences";
import { pollsService } from "@/services/polls.service";
import { messagesService } from "@/services/messages.service";
import type { Poll, Message, User } from "@/types";
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
const loadHistory = useCommunity.getState().loadHistory;

const user: User = { id: "admin", role: "ADMIN", status: "APPROVED", email: "test@example.invalid", firstName: "Test", lastName: "Test", joinedAt: "2026-01-01", bio: "" };
const poll: Poll = { id: "poll", groupId: "group", authorId: "other", question: "Test poll", type: "SESSION", singleChoice: false, options: [], votes: [] };
const message: Message = { id: "message", groupId: "group", authorId: "other", kind: "text", text: "Test", createdAt: "2026-01-01" };
beforeEach(() => {
  useCommunity.getState().clear();
  usePreferences.setState({ language: "fr" });
  useCommunity.setState({ session: { userId: user.id, mode: "real" }, users: [user], polls: [poll], messages: [message],
    groups: [{ id: "group", name: "Test group", description: "", isGeneral: false, color: "#aabbcc", memberIds: [user.id] }],
    history: { group: { loaded: true, loading: false, nextCursor: null } }, loadHistory: vi.fn().mockResolvedValue(undefined),
  });
  HTMLElement.prototype.scrollIntoView = vi.fn();
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); useCommunity.setState({ loadHistory }); });

it("confirms before the admin deletes another author's poll", async () => {
  const remove = vi.spyOn(pollsService, "remove").mockResolvedValue(undefined);
  render(<DeleteContent poll={poll} />);
  fireEvent.click(screen.getByRole("button", { name: /Supprimer le sondage/ }));
  expect(remove).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Annuler" }));
  expect(remove).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: /Supprimer le sondage/ }));
  fireEvent.click(screen.getByRole("button", { name: "Confirmer la suppression" }));
  await waitFor(() => expect(useCommunity.getState().polls).toHaveLength(0));
  expect(remove).toHaveBeenCalledOnce();
});
it("keeps the message when the server refuses deletion", async () => {
  vi.spyOn(messagesService, "remove").mockRejectedValue(new Error("Suppression refusée"));
  render(<DeleteContent message={message} />);
  fireEvent.click(screen.getByRole("button", { name: "Actions du message" }));
  fireEvent.click(screen.getByRole("menuitem", { name: "Supprimer le message" }));
  fireEvent.click(screen.getByRole("button", { name: "Confirmer la suppression" }));
  await waitFor(() => expect(screen.getByRole("button", { name: "Confirmer la suppression" }).hasAttribute("disabled")).toBe(false));
  expect(useCommunity.getState().messages).toHaveLength(1);
  expect(screen.getByRole("dialog")).toBeTruthy();
});
it.each(["USER", "COLLABORATOR"] as const)("hides message deletion and other authors' poll deletion for %s", (role) => {
  useCommunity.setState({ users: [{ ...user, role }] });
  render(<><DeleteContent message={{ ...message, authorId: user.id }} /><DeleteContent poll={poll} /></>);
  expect(screen.queryByRole("button")).toBeNull();
});
it("allows a collaborator to delete their own poll", () => {
  useCommunity.setState({ users: [{ ...user, role: "COLLABORATOR" }] });
  render(<DeleteContent poll={{ ...poll, authorId: user.id }} />);
  expect(screen.getByRole("button", { name: /Supprimer le sondage/ })).toBeTruthy();
});
it("keeps deletion inside a contextual menu and dismisses it with Escape or an outside click", () => {
  render(<DeleteContent message={message} />);
  expect(screen.queryByText("Supprimer le message")).toBeNull();
  const trigger = screen.getByRole("button", { name: "Actions du message" });
  fireEvent.keyDown(trigger, { key: "ArrowDown" });
  expect(screen.getByRole("menuitem", { name: "Supprimer le message" })).toBeTruthy();
  fireEvent.keyDown(document, { key: "Escape" });
  expect(screen.queryByRole("menu")).toBeNull();
  expect(document.activeElement).toBe(trigger);
  fireEvent.click(trigger);
  fireEvent.pointerDown(document.body);
  expect(screen.queryByRole("menu")).toBeNull();
});
it("opens the message menu by clicking or right-clicking the bubble", () => {
  const { container } = render(<ChatScreen groupId="group" />);
  const bubble = container.querySelector(".bubble")!;
  fireEvent.click(bubble.querySelector("p")!);
  expect(screen.getByRole("menuitem", { name: "Supprimer le message" })).toBeTruthy();
  fireEvent.keyDown(document, { key: "Escape" });
  fireEvent.contextMenu(bubble);
  expect(screen.getByRole("menuitem", { name: "Supprimer le message" })).toBeTruthy();
});
it("sends deletion only after the menu action and explicit confirmation", async () => {
  const remove = vi.spyOn(messagesService, "remove").mockResolvedValue(undefined);
  render(<DeleteContent message={message} />);
  fireEvent.click(screen.getByRole("button", { name: "Actions du message" }));
  fireEvent.click(screen.getByRole("menuitem", { name: "Supprimer le message" }));
  expect(remove).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Confirmer la suppression" }));
  await waitFor(() => expect(useCommunity.getState().messages).toHaveLength(0));
  expect(remove).toHaveBeenCalledOnce();
});
it("translates the contextual action into English", () => {
  usePreferences.setState({ language: "en" });
  render(<DeleteContent message={message} />);
  fireEvent.click(screen.getByRole("button", { name: "Message actions" }));
  expect(screen.getByRole("menuitem", { name: "Delete message" })).toBeTruthy();
});
it("puts both poll and message deletion in the poll bubble menu for admins", () => {
  useCommunity.setState({ messages: [{ ...message, kind: "poll", pollId: poll.id, text: "" }] });
  const { container } = render(<ChatScreen groupId="group" />);
  expect(screen.queryByRole("button", { name: /Supprimer le sondage/ })).toBeNull();
  fireEvent.click(container.querySelector(".bubble h3")!);
  const messageAction = screen.getByRole("menuitem", { name: "Supprimer le message" });
  const pollAction = screen.getByRole("menuitem", { name: "Supprimer le sondage" });
  fireEvent.keyDown(messageAction, { key: "ArrowDown" });
  expect(document.activeElement).toBe(pollAction);
  fireEvent.click(pollAction);
  expect(screen.getByRole("dialog", { name: "Supprimer le sondage" })).toBeTruthy();
  expect(screen.getByText(/deux heures avant le premier créneau/)).toBeTruthy();
});
