import React from "react";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MembersPanel } from "./requests-panel";
import { useCommunity } from "@/stores/community";
import { usePreferences } from "@/stores/preferences";
import { usersService } from "@/services/users.service";
import { groupsService } from "@/services/groups.service";
import type { User } from "@/types";
const originalSync = useCommunity.getState().sync;
const admin: User = { id: "admin", firstName: "Admin", lastName: "Team", email: "admin@test.invalid", role: "ADMIN", status: "APPROVED", joinedAt: "2026-01-01T00:00:00Z", bio: "" };
const make = (id: string, status: User["status"] = "APPROVED", role: User["role"] = "USER"): User => ({ ...admin, id, firstName: id, role, status, email: `${id}@test.invalid`, joinedAt: "2026-11-12T00:00:00Z" });
const group = { id: "private", name: "G1", isGeneral: false, description: "", color: "#be9af5", memberIds: [admin.id] };
beforeEach(() => {
  vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
  usePreferences.setState({ language: "fr" });
  useCommunity.getState().clear();
  useCommunity.setState({ users: [admin, make("A"), make("B"), make("Pending", "PENDING"), make("Invite", "PENDING", "COLLABORATOR")],
    session: { userId: admin.id, mode: "real" }, groups: [group, { ...group, id: "general", name: "Général", isGeneral: true }], sync: vi.fn().mockResolvedValue(undefined) });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); useCommunity.setState({ sync: originalSync }); });

it("accepts only selected pending clients and preserves the collaborator invitation flow", async () => {
  const review = vi.spyOn(usersService, "review").mockResolvedValue(make("Pending", "APPROVED"));
  render(<MembersPanel />);
  expect(screen.getByRole("checkbox", { name: "Sélectionner Admin Team" }).hasAttribute("disabled")).toBe(true);
  expect(screen.getByRole("checkbox", { name: "Sélectionner Invite Team" }).hasAttribute("disabled")).toBe(true);
  fireEvent.click(screen.getByRole("checkbox", { name: "Sélectionner Pending Team" }));
  fireEvent.click(screen.getByRole("checkbox", { name: "Sélectionner A Team" }));
  fireEvent.click(screen.getByRole("button", { name: "Accepter (1)" }));
  const dialog = within(screen.getByRole("dialog", { name: "Accepter les membres sélectionnés" }));
  expect(review).not.toHaveBeenCalled();
  fireEvent.click(dialog.getByRole("button", { name: "Confirmer pour 1 membre(s)" }));
  await waitFor(() => expect(review).toHaveBeenCalledWith("Pending", "APPROVED"));
  expect(review).toHaveBeenCalledTimes(1);
  await waitFor(() => expect(screen.getByText("1 opération(s) réussie(s)")).toBeTruthy());
  expect(screen.getByRole("checkbox", { name: "Sélectionner A Team" })).toHaveProperty("checked", true);
});

it("confirms a multi-member ban, prevents double submission and retains only failed members for retry", async () => {
  let finish!: () => void;
  const ban = vi.spyOn(usersService, "ban").mockImplementation((id) => id === "A" ? new Promise<void>((resolve) => { finish = resolve; }) : Promise.reject(Error("Refus serveur")));
  render(<MembersPanel />);
  for (const name of ["A", "B"]) fireEvent.click(screen.getByRole("checkbox", { name: `Sélectionner ${name} Team` }));
  fireEvent.click(screen.getByRole("button", { name: "Bannir (2)" }));
  const dialog = within(screen.getByRole("dialog", { name: "Bannir les membres sélectionnés" }));
  expect(dialog.getByText(/irréversible/)).toBeTruthy();
  expect(ban).not.toHaveBeenCalled();
  const confirm = dialog.getByRole("button", { name: "Confirmer pour 2 membre(s)" });
  fireEvent.click(confirm); fireEvent.click(confirm);
  expect(ban).toHaveBeenCalledTimes(1);
  finish();
  expect(await screen.findByRole("alert")).toHaveProperty("textContent", expect.stringContaining("Refus serveur"));
  expect(ban).toHaveBeenCalledTimes(2);
  expect(screen.queryByRole("checkbox", { name: "Sélectionner A Team" })).toBeNull();
  expect(screen.getByRole("checkbox", { name: "Sélectionner B Team" })).toHaveProperty("checked", true);
});

it("adds selected approved users to the chosen private group and excludes existing members", async () => {
  useCommunity.setState({ groups: [{ ...group, memberIds: [admin.id, "A"] }, { ...group, id: "general", name: "Général", isGeneral: true }] });
  const add = vi.spyOn(groupsService, "member").mockResolvedValue({ ...group, memberIds: [admin.id, "A", "B"] });
  render(<MembersPanel />);
  for (const name of ["A", "B"]) fireEvent.click(screen.getByRole("checkbox", { name: `Sélectionner ${name} Team` }));
  fireEvent.click(screen.getByRole("button", { name: "Ajouter au groupe (2)" }));
  const dialog = within(screen.getByRole("dialog", { name: "Ajouter les membres sélectionnés au groupe" }));
  expect(dialog.queryByRole("option", { name: "Général" })).toBeNull();
  fireEvent.change(dialog.getByLabelText("Groupe de destination"), { target: { value: "private" } });
  fireEvent.click(dialog.getByRole("button", { name: "Confirmer pour 1 membre(s)" }));
  await waitFor(() => expect(add).toHaveBeenCalledWith("private", "B", true));
  expect(add).toHaveBeenCalledTimes(1);
});

it("selects just the visible page, keeps selection between pages and clears it when filters change", () => {
  useCommunity.setState({ users: [admin, ...Array.from({ length: 12 }, (_, i) => make(`Member${String(i).padStart(2, "0")}`))] });
  render(<MembersPanel />);
  fireEvent.click(screen.getByRole("checkbox", { name: "Sélectionner les membres de cette page" }));
  expect(screen.getByText("10 sélectionné(s)")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Suivant" }));
  expect(screen.getByText("10 sélectionné(s)")).toBeTruthy();
  expect(screen.getByRole("checkbox", { name: "Sélectionner les membres de cette page" })).toHaveProperty("checked", false);
  fireEvent.change(screen.getByRole("searchbox"), { target: { value: "Member11" } });
  expect(screen.getByText("0 sélectionné(s)")).toBeTruthy();
});
