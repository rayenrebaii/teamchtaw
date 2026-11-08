import React from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { ChatScreen } from "./chat-screen";
import { useCommunity } from "@/stores/community";
import { usePreferences } from "@/stores/preferences";
import type { User, Group } from "@/types";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
const actions = { sync: useCommunity.getState().sync, membership: useCommunity.getState().membership, loadHistory: useCommunity.getState().loadHistory };
const admin: User = { id: "admin", firstName: "Admin", lastName: "Team", email: "admin@test.invalid", role: "ADMIN", status: "APPROVED", joinedAt: "2026-11-01T10:00:00Z", bio: "" };
const member: User = { ...admin, id: "candidate", firstName: "Nadia", lastName: "Ben Ali", email: "nadia@example.invalid", role: "USER" };
const group: Group = { id: "group", name: "G1", description: "", color: "#be9af5", isGeneral: false, memberIds: [admin.id] };
beforeEach(() => {
  usePreferences.setState({ language: "fr" });
  useCommunity.getState().clear();
  useCommunity.setState({ ...actions, session: { userId: admin.id, mode: "real" }, users: [admin, member, { ...member, id: "pending", firstName: "Pending", status: "PENDING" }], groups: [group],
    sync: vi.fn().mockResolvedValue(undefined), loadHistory: vi.fn().mockResolvedValue(undefined) });
  HTMLElement.prototype.scrollIntoView = vi.fn();
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); useCommunity.setState(actions); });

it("opens the current group's member picker and searches by name or email without creating a group", async () => {
  let finish!: () => void;
  const add = vi.fn().mockImplementation(() => new Promise<void>((resolve) => {
    finish = () => { useCommunity.setState({ groups: [{ ...group, memberIds: [admin.id, member.id] }] }); resolve(); };
  }));
  useCommunity.setState({ membership: add });
  render(<ChatScreen groupId={group.id} />);
  const header = within(document.querySelector(".chat-header") as HTMLElement);
  expect(header.queryByRole("button", { name: "Créer un groupe" })).toBeNull();
  fireEvent.click(header.getByRole("button", { name: "Ajouter des membres au groupe" }));
  const dialog = within(screen.getByRole("dialog", { name: "Ajouter des membres au groupe" }));
  expect(dialog.queryByLabelText("Nom du groupe")).toBeNull();
  expect(dialog.getByText("Déjà membre")).toBeTruthy();
  expect(dialog.queryByText("Pending Ben Ali")).toBeNull();
  const search = dialog.getByRole("searchbox");
  fireEvent.change(search, { target: { value: "ben ali" } });
  expect(dialog.getByText(member.email)).toBeTruthy();
  fireEvent.change(search, { target: { value: "nadia@example.invalid" } });
  fireEvent.click(dialog.getByRole("button", { name: "Ajouter Nadia Ben Ali au groupe" }));
  expect(add).toHaveBeenCalledWith(group.id, member.id, true);
  expect(dialog.getByRole("button", { name: "Ajouter Nadia Ben Ali au groupe" }).hasAttribute("disabled")).toBe(true);
  finish();
  await waitFor(() => expect(dialog.queryByRole("button", { name: "Ajouter Nadia Ben Ali au groupe" })).toBeNull());
  expect(dialog.getByText("Déjà membre")).toBeTruthy();
});

it("keeps the list and permits retrying after a failed addition", async () => {
  useCommunity.setState({ membership: vi.fn().mockRejectedValue(Error("Connection unavailable")) });
  render(<ChatScreen groupId={group.id} />);
  fireEvent.click(screen.getByRole("button", { name: "Ajouter des membres au groupe" }));
  fireEvent.click(screen.getByRole("button", { name: "Ajouter Nadia Ben Ali au groupe" }));
  expect(await screen.findByRole("alert")).toHaveProperty("textContent", "L’ajout a échoué. Réessayez sans quitter la liste.");
  expect(screen.getByRole("button", { name: "Ajouter Nadia Ben Ali au groupe" }).hasAttribute("disabled")).toBe(false);
  expect(useCommunity.getState().groups[0]!.memberIds).toEqual([admin.id]);
});

it("hides the add button for ordinary users and the automatic general group", () => {
  useCommunity.setState({ session: { userId: member.id, mode: "real" }, groups: [{ ...group, memberIds: [member.id] }] });
  const view = render(<ChatScreen groupId={group.id} />);
  expect(screen.queryByRole("button", { name: "Ajouter des membres au groupe" })).toBeNull();
  view.unmount();
  useCommunity.setState({ session: { userId: admin.id, mode: "real" }, groups: [{ ...group, isGeneral: true }] });
  render(<ChatScreen groupId={group.id} />);
  expect(screen.queryByRole("button", { name: "Ajouter des membres au groupe" })).toBeNull();
});
