import React from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { AccountAction } from "./account-action";
import { api } from "@/services/api-client";
const firebase = vi.hoisted(() => ({ signIn: vi.fn(), signOut: vi.fn().mockResolvedValue(undefined), token: vi.fn().mockResolvedValue("firebase-id-token"), auth: {} }));
vi.mock("@/services/firebase", () => ({ firebaseEnabled: true, firebaseAuth: () => firebase.auth }));
vi.mock("firebase/auth", () => ({ signInWithEmailAndPassword: firebase.signIn, signOut: firebase.signOut }));
beforeEach(() => {
  vi.clearAllMocks(); firebase.signIn.mockResolvedValue({ user: { getIdToken: firebase.token } });
  window.history.replaceState(null, "", "/account-action#" + "a".repeat(43));
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
async function fill() {
  await waitFor(() => expect(screen.getByRole("button").hasAttribute("disabled")).toBe(false));
  fireEvent.change(screen.getByLabelText("E-mail"), { target: { value: "collab@test.invalid" } });
  fireEvent.change(screen.getByLabelText("Mot de passe choisi dans Firebase"), { target: { value: "Firebase-password-2026!" } });
  fireEvent.click(screen.getByRole("button", { name: "Activer mon compte collaborateur" }));
}
it("active avec un ID token frais sans transmettre le mot de passe au backend", async () => {
  const request = vi.spyOn(api, "request").mockResolvedValue({ success: true });
  render(<AccountAction />); await fill();
  expect((await screen.findByRole("status")).textContent).toContain("compte collaborateur est activé");
  expect(firebase.signIn).toHaveBeenCalledWith(firebase.auth, "collab@test.invalid", "Firebase-password-2026!");
  expect(request).toHaveBeenCalledWith("/auth/account-links/activate-firebase", expect.objectContaining({ body: JSON.stringify({ token: "a".repeat(43), idToken: "firebase-id-token" }) }), false);
  expect(firebase.signOut).toHaveBeenCalled(); expect(window.location.hash).toBe("");
});
it("affiche un lien expiré sans annoncer une activation et ferme la session Firebase temporaire", async () => {
  vi.spyOn(api, "request").mockRejectedValue(Error("Lien invalide ou expiré."));
  render(<AccountAction />); await fill();
  expect((await screen.findByRole("alert")).textContent).toContain("expiré");
  expect(screen.queryByRole("status")).toBeNull(); expect(firebase.signOut).toHaveBeenCalled();
});
it("refuse un lien absent et propose de contacter l’administrateur", () => {
  window.history.replaceState(null, "", "/account-action"); render(<AccountAction />);
  expect(screen.getByRole("button").hasAttribute("disabled")).toBe(true);
  expect(screen.getByRole("alert").textContent).toContain("administrateur");
});
