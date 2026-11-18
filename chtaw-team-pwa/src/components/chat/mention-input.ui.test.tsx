import React, { useState } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MentionInput } from "./mention-input";
import { ChatScreen } from "./chat-screen";
import { useCommunity } from "@/stores/community";
import { usePreferences } from "@/stores/preferences";
import type { MemberSummary, User } from "@/types";
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
const members: MemberSummary[] = [
  { id: "nadia", firstName: "Nadia", lastName: "Équipe", role: "USER", bio: "", profilePhotoId: "photo" },
  { id: "coach", firstName: "Team", lastName: "Coach", role: "ADMIN", bio: "" },
];
const changed = vi.fn(), submitted = vi.fn();
function Composer() {
  const [value, setValue] = useState("");
  return <form onSubmit={event => { event.preventDefault(); submitted(); }}><MentionInput value={value} members={members} onChange={(text, ids) => { setValue(text); changed(text, ids); }} /></form>;
}
beforeEach(() => { usePreferences.setState({ language: "fr" }); vi.clearAllMocks(); HTMLElement.prototype.scrollIntoView = vi.fn(); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
it("finds names without accents, shows an avatar, inserts a readable mention, and removes its recipient when deleted", async () => {
  render(<Composer />);
  const input = screen.getByRole("textbox");
  fireEvent.change(input, { target: { value: "Bonjour @equi", selectionStart: 13 } });
  expect(screen.getByRole("option", { name: "@Nadia Équipe" })).toBeTruthy();
  expect(screen.getByRole("option", { name: "@Nadia Équipe" }).querySelector(".avatar")).toBeTruthy();
  fireEvent.keyDown(input, { key: "Enter" });
  expect(changed).toHaveBeenLastCalledWith("Bonjour @Nadia Équipe ", ["nadia"]);
  expect(submitted).not.toHaveBeenCalled();
  await waitFor(() => expect(input).toHaveProperty("value", "Bonjour @Nadia Équipe "));
  fireEvent.change(input, { target: { value: "Bonjour", selectionStart: 7 } });
  expect(changed).toHaveBeenLastCalledWith("Bonjour", []);
});
it("supports everyone, arrow navigation, Escape, Shift+Enter and the English copy", () => {
  usePreferences.setState({ language: "en" });
  render(<Composer />);
  const input = screen.getByRole("textbox");
  fireEvent.change(input, { target: { value: "@", selectionStart: 1 } });
  expect(screen.getByText("Notify every member of this group")).toBeTruthy();
  fireEvent.keyDown(input, { key: "ArrowDown" });
  expect(screen.getByRole("option", { name: "@Nadia Équipe" }).getAttribute("aria-selected")).toBe("true");
  fireEvent.keyDown(input, { key: "Escape" });
  expect(screen.queryByRole("listbox")).toBeNull();
  fireEvent.keyDown(input, { key: "Enter", shiftKey: true }); expect(submitted).not.toHaveBeenCalled();
  fireEvent.click(input);
  fireEvent.click(screen.getByRole("button", { name: /@tous/ }));
  expect(changed).toHaveBeenLastCalledWith("@tous ", []);
});
it.each(["ADMIN", "USER", "COLLABORATOR"] as const)("sends a selected mention from a %s conversation", async role => {
  const saved = { post: useCommunity.getState().post, loadHistory: useCommunity.getState().loadHistory };
  const actor: User = { id: "actor", firstName: "Actor", lastName: "Test", role, status: "APPROVED", email: "actor@example.invalid", bio: "", joinedAt: "2026-01-01T00:00:00Z" };
  const post = vi.fn().mockResolvedValue(undefined);
  useCommunity.getState().clear();
  useCommunity.setState({ users: [actor], people: members, session: { userId: actor.id, mode: "real" }, groups: [{ id: "g", name: "Group", description: "", color: "#fff", isGeneral: false, memberIds: [actor.id, "nadia"] }], post, loadHistory: vi.fn().mockResolvedValue(undefined) });
  try {
    render(<ChatScreen groupId="g" />);
    fireEvent.change(screen.getByRole("textbox", { name: "Votre message" }), { target: { value: "@Nad", selectionStart: 4 } });
    expect(screen.queryByRole("option", { name: "@Team Coach" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "@Nadia Équipe" }));
    fireEvent.click(screen.getByRole("button", { name: "Envoyer le message" }));
    await waitFor(() => expect(post).toHaveBeenCalledWith("g", "@Nadia Équipe", ["nadia"]));
    await waitFor(() => expect(screen.getByRole("textbox", { name: "Votre message" })).toHaveProperty("value", ""));
  } finally { useCommunity.setState(saved); }
});
