import React from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { DeleteContent } from "./delete-content";
import { useCommunity } from "@/stores/community";
import { usePreferences } from "@/stores/preferences";
import { pollsService } from "@/services/polls.service";
import { messagesService } from "@/services/messages.service";
import type { Poll, Message, User } from "@/types";

const user: User = { id: "admin", role: "ADMIN", status: "APPROVED", email: "test@example.invalid", firstName: "Test", lastName: "Test", joinedAt: "2026-01-01", bio: "" };
const poll: Poll = { id: "poll", groupId: "group", authorId: "other", question: "Test poll", type: "SESSION", singleChoice: false, options: [], votes: [] };
const message: Message = { id: "message", groupId: "group", authorId: "other", kind: "text", text: "Test", createdAt: "2026-01-01" };
beforeEach(() => {
  useCommunity.getState().clear();
  usePreferences.setState({ language: "fr" });
  useCommunity.setState({ session: { userId: user.id, mode: "real" }, users: [user], polls: [poll], messages: [message] });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

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
  fireEvent.click(screen.getByRole("button", { name: "Supprimer le message" }));
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
