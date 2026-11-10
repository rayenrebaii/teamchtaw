import React from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { AccountAction } from "./account-action";
import { api } from "@/services/api-client";
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
beforeEach(() => { window.history.replaceState(null, "", "/account-action"); });
it("rejects a missing invitation and offers recovery", () => {
  render(<AccountAction />);
  expect(screen.getByRole("alert").textContent).toContain("Lien absent");
  expect(screen.getByRole("button", { name: "Enregistrer le mot de passe" }).hasAttribute("disabled")).toBe(true);
});
it("removes the token from the URL, activates and submits only to the public API", async () => {
  window.history.replaceState(null, "", "/account-action#" + "a".repeat(43));
  const request = vi.spyOn(api, "request").mockResolvedValue({ success: true });
  render(<AccountAction />);
  await waitFor(() => expect(screen.getByRole("button", { name: "Enregistrer le mot de passe" }).hasAttribute("disabled")).toBe(false));
  expect(window.location.hash).toBe("");
  for (const name of ["Nouveau mot de passe", "Confirmer le mot de passe"]) fireEvent.change(screen.getByLabelText(name), { target: { value: "Password-123456789!" } });
  fireEvent.click(screen.getByRole("button", { name: "Enregistrer le mot de passe" }));
  await screen.findByRole("status");
  expect(request).toHaveBeenCalledWith("/auth/account-links/redeem", expect.objectContaining({ method: "POST", body: JSON.stringify({ token: "a".repeat(43), password: "Password-123456789!" }) }), false);
});
it("shows an expired token error and keeps the recovery link", async () => {
  window.history.replaceState(null, "", "/account-action#" + "b".repeat(43));
  vi.spyOn(api, "request").mockRejectedValue(Error("Lien invalide ou expiré."));
  render(<AccountAction />);
  await waitFor(() => expect(screen.getByRole("button").hasAttribute("disabled")).toBe(false));
  for (const name of ["Nouveau mot de passe", "Confirmer le mot de passe"]) fireEvent.change(screen.getByLabelText(name), { target: { value: "Password-123456789!" } });
  fireEvent.click(screen.getByRole("button"));
  expect((await screen.findByRole("alert")).textContent).toContain("expiré");
  expect(screen.getByRole("link", { name: "Demander un nouveau lien" }).getAttribute("href")).toBe("/forgot-password");
});
it("uses a generic public forgot-password response", async () => {
  vi.spyOn(api, "request").mockResolvedValue({ message: "generic" });
  render(<AccountAction forgot />);
  fireEvent.change(screen.getByLabelText("E-mail"), { target: { value: "absent@test.invalid" } });
  fireEvent.click(screen.getByRole("button", { name: "Demander un lien" }));
  expect((await screen.findByRole("status")).textContent).toContain("Si un compte correspond");
});
