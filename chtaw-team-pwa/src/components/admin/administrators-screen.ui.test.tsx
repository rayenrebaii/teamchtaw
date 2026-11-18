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
