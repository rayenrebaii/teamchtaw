import React from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { AdministratorsScreen } from "./administrators-screen";
import { api } from "@/services/api-client";
import { useCommunity } from "@/stores/community";
import { usePreferences } from "@/stores/preferences";
import type { User } from "@/types";

const principal: User = { id: "principal", firstName: "Principal", lastName: "Admin", email: "principal@test.invalid", role: "ADMIN", status: "APPROVED", joinedAt: "2026-01-01", bio: "", isInvitedAdmin: false };
const friend: User = { ...principal, id: "friend", firstName: "Friend", email: "friend@test.invalid", isInvitedAdmin: true, principalAdminId: principal.id, activatedAt: "2026-11-18" };
beforeEach(() => {
  usePreferences.setState({ language: "fr" });
  useCommunity.setState({ users: [principal, friend], session: { userId: principal.id, mode: "real" } });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

it("protects principal administrators and prevents self deletion", async () => {
  vi.spyOn(api, "request").mockResolvedValue([principal, friend]);
  useCommunity.setState({ session: { userId: friend.id, mode: "real" } });
  render(<AdministratorsScreen />);
  await screen.findByText("Principal Admin");
  expect(screen.getByText("Compte protégé")).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Supprimer" })).toBeNull();
});

it("creates an administrator invitation using the dedicated API", async () => {
  const request = vi.spyOn(api, "request").mockImplementation(async (_path, options) => options?.method === "POST" ? { invitation: { sent: true } } as never : [principal] as never);
  render(<AdministratorsScreen />);
  fireEvent.click(screen.getByRole("button", { name: "Inviter un administrateur" }));
  const dialog = within(screen.getByRole("dialog"));
  fireEvent.change(dialog.getByLabelText("Prénom"), { target: { value: "Friend" } });
  fireEvent.change(dialog.getByLabelText("Nom"), { target: { value: "Admin" } });
  fireEvent.change(dialog.getByLabelText("E-mail"), { target: { value: friend.email } });
  fireEvent.click(dialog.getByRole("button", { name: "Créer et inviter" }));
  await screen.findByText("Administrateur créé et invitation envoyée.");
  expect(request).toHaveBeenCalledWith("/admin/administrators", { method: "POST", body: JSON.stringify({ firstName: "Friend", lastName: "Admin", email: friend.email }) });
});

it("requires confirmation and retains the dialog when deletion fails", async () => {
  const request = vi.spyOn(api, "request").mockImplementation(async (_path, options) => {
    if (options?.method === "DELETE") throw Error("Suppression impossible");
    return [principal, friend] as never;
  });
  render(<AdministratorsScreen />);
  fireEvent.click(await screen.findByRole("button", { name: "Supprimer" }));
  expect(request).not.toHaveBeenCalledWith("/users/friend", { method: "DELETE" });
  fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Retirer l’accès" }));
  await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("Suppression impossible"));
  expect(screen.getByRole("dialog")).toBeTruthy();
});
it("uses membership-style status tabs, search and account type filters while protecting the principal", async () => {
  const pending = { ...friend, id: "invited", firstName: "Invited", email: "invited@test.invalid", activatedAt: undefined };
  vi.spyOn(api, "request").mockResolvedValue([principal, friend, pending]);
  render(<AdministratorsScreen />);
  await screen.findByText("Principal Admin");
  expect(screen.getByText("Total des administrateurs").parentElement?.textContent).toContain("3");
  fireEvent.click(screen.getByRole("tab", { name: /Invitations en attente/ }));
  expect(screen.getByText("invited@test.invalid")).toBeTruthy();
  expect(screen.queryByText("principal@test.invalid")).toBeNull();
  expect(screen.queryByText("friend@test.invalid")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Réinitialiser" }));
  fireEvent.change(screen.getByRole("searchbox"), { target: { value: "Friend Admin" } });
  expect(screen.getByText("friend@test.invalid")).toBeTruthy();
  expect(screen.queryByText("principal@test.invalid")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Réinitialiser" }));
  fireEvent.change(screen.getByLabelText("Type de compte"), { target: { value: "PRINCIPAL" } });
  expect(screen.getByText("principal@test.invalid")).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Supprimer" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Réinitialiser" }));
  expect(screen.getByText("friend@test.invalid")).toBeTruthy();
});

it("resets pagination when searching and offers a reset for empty results", async () => {
  vi.spyOn(api, "request").mockResolvedValue([principal, ...Array.from({ length: 7 }, (_, index) => ({ ...friend, id: `agent-${index}`, firstName: `Agent${index}`, email: `agent${index}@test.invalid` }))]);
  render(<AdministratorsScreen />);
  await screen.findByRole("button", { name: "Suivant" });
  fireEvent.click(screen.getByRole("button", { name: "Suivant" }));
  expect(screen.getByRole("button", { name: "Précédent" }).hasAttribute("disabled")).toBe(false);
  fireEvent.change(screen.getByRole("searchbox"), { target: { value: "agent6@test.invalid" } });
  expect(screen.getByText("agent6@test.invalid")).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Suivant" })).toBeNull();
  fireEvent.change(screen.getByRole("searchbox"), { target: { value: "no matching account" } });
  expect(screen.getByText("Aucun administrateur ne correspond")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Réinitialiser" }));
  expect(screen.getByRole("button", { name: "Précédent" }).hasAttribute("disabled")).toBe(true);
});
