import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { FirebaseActions } from "./firebase-actions";

const mocks = vi.hoisted(() => ({ params: new URLSearchParams(), reset: vi.fn(), confirm: vi.fn(), verify: vi.fn(), apply: vi.fn(), send: vi.fn(), logout: vi.fn().mockResolvedValue(undefined), sync: vi.fn().mockResolvedValue(undefined) }));
vi.mock("next/navigation", () => ({ useSearchParams: () => mocks.params, useRouter: () => ({ replace: vi.fn() }) }));
vi.mock("@/services/firebase", () => ({ firebaseEnabled: true, firebaseAuth: () => ({ currentUser: null }), emailActionSettings: () => ({ url: "https://example.test/login" }) }));
vi.mock("firebase/auth", () => ({ sendPasswordResetEmail: mocks.reset, confirmPasswordReset: mocks.confirm, verifyPasswordResetCode: mocks.verify, applyActionCode: mocks.apply, sendEmailVerification: mocks.send, signInWithEmailAndPassword: vi.fn() }));
vi.mock("@/stores/community", () => ({ useCommunity: () => ({ users: [], session: null, logout: mocks.logout, sync: mocks.sync }) }));
afterEach(cleanup);
beforeEach(() => { vi.clearAllMocks(); mocks.params = new URLSearchParams(); });

describe("Firebase email pages", () => {
  it("uses the same reset response when Firebase rejects an unknown email", async () => {
    mocks.reset.mockRejectedValueOnce({ code: "auth/user-not-found" });
    render(<FirebaseActions screen="forgot" />);
    fireEvent.change(screen.getByLabelText("Adresse e-mail"), { target: { value: "absent@example.test" } });
    fireEvent.click(screen.getByRole("button", { name: "Demander un lien" }));
    await waitFor(() => expect(screen.getByRole("status").textContent).toContain("Si un compte correspond"));
    expect(screen.queryByText(/user-not-found/)).toBeNull();
  });
  it("rejects incomplete action links without calling Firebase", () => {
    render(<FirebaseActions screen="action" />);
    expect(screen.getByRole("alert").textContent).toContain("Lien invalide");
    expect(mocks.apply).not.toHaveBeenCalled();
  });
  it("shows an expired verification link and offers recovery", async () => {
    mocks.params = new URLSearchParams({ mode: "verifyEmail", oobCode: "expired-code" });
    mocks.apply.mockRejectedValueOnce({ code: "auth/expired-action-code" });
    render(<FirebaseActions screen="action" />);
    fireEvent.click(screen.getByRole("button", { name: "Confirmer mon adresse" }));
    await waitFor(() => expect(screen.getByRole("status").textContent).toContain("invalide ou expiré"));
  });
  it("confirms email without claiming that administrative approval was granted", async () => {
    mocks.params = new URLSearchParams({ mode: "verifyEmail", oobCode: "valid-code" });
    mocks.apply.mockResolvedValueOnce(undefined);
    render(<FirebaseActions screen="action" />);
    fireEvent.click(screen.getByRole("button", { name: "Confirmer mon adresse" }));
    await screen.findByText("Adresse e-mail confirmée.");
    expect(screen.getByText(/L’accès à l’application reste soumis/)).toBeTruthy();
  });
  it("uses Firebase reset and closes the local session", async () => {
    mocks.params = new URLSearchParams({ mode: "resetPassword", oobCode: "valid-code" });
    mocks.verify.mockResolvedValueOnce("test@example.test"); mocks.confirm.mockResolvedValueOnce(undefined);
    render(<FirebaseActions screen="action" />);
    fireEvent.change(screen.getByLabelText("Nouveau mot de passe"), { target: { value: "New-password-12345!" } });
    fireEvent.change(screen.getByLabelText("Confirmer le mot de passe"), { target: { value: "New-password-12345!" } });
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer le mot de passe" }));
    await screen.findByText("Mot de passe modifié.");
    expect(mocks.confirm).toHaveBeenCalledWith(expect.anything(), "valid-code", "New-password-12345!");
    expect(mocks.logout).toHaveBeenCalledOnce();
  });
});
