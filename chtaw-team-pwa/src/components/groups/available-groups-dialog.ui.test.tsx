import React from "react";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { AvailableGroups } from "./available-groups";
import { groupsService } from "@/services/groups.service";
import { useCommunity } from "@/stores/community";
import { usePreferences } from "@/stores/preferences";
import type { User } from "@/types";
const actor: User = { id: "user", firstName: "Team", lastName: "Member", email: "member@test.invalid", role: "USER", status: "APPROVED", joinedAt: "2026-01-01T00:00:00Z", bio: "" };
beforeEach(() => {
  usePreferences.setState({ language: "fr" }); useCommunity.getState().clear();
  useCommunity.setState({ session: { userId: actor.id, mode: "real" }, users: [actor] });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

it.each(["USER", "COLLABORATOR"] as const)("keeps the sidebar compact and searches available names only inside the dialog for %s", async (role) => {
  useCommunity.setState({ users: [{ ...actor, role }] });
  const list = vi.spyOn(groupsService, "directory").mockResolvedValue([
    { id: "one", name: "Atelier Danse", isGeneral: false, isMember: false, requestStatus: null },
    { id: "two", name: "Club Musique", isGeneral: false, isMember: false, requestStatus: "PENDING" },
    { id: "member", name: "Groupe actuel", isGeneral: false, isMember: true, requestStatus: null },
  ]);
  render(<AvailableGroups />);
  expect(list).not.toHaveBeenCalled();
  expect(screen.queryByText("Atelier Danse")).toBeNull();
  expect(screen.queryByRole("dialog")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Groupes disponibles" }));
  const dialog = within(screen.getByRole("dialog", { name: "Groupes disponibles" }));
  expect(await dialog.findByText("Atelier Danse")).toBeTruthy();
  expect(dialog.queryByText("Groupe actuel")).toBeNull();
  fireEvent.change(dialog.getByRole("searchbox"), { target: { value: "CLUB musique" } });
  expect(dialog.queryByText("Atelier Danse")).toBeNull();
  expect(dialog.getByText("Club Musique")).toBeTruthy();
  expect(dialog.getByText("Demande en attente")).toBeTruthy();
  expect(dialog.queryByRole("link")).toBeNull();
  fireEvent.change(dialog.getByRole("searchbox"), { target: { value: "absent" } });
  expect(dialog.getByText("Aucun groupe ne correspond à votre recherche.")).toBeTruthy();
  fireEvent.click(dialog.getByRole("button", { name: "Fermer" }));
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(screen.queryByText("Club Musique")).toBeNull();
});
