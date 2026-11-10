import React from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { AuthScreen } from "./auth-screen";

const mocks = vi.hoisted(() => ({ login: vi.fn(), push: vi.fn(), replace: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push, replace: mocks.replace }) }));
vi.mock("@/services/firebase", () => ({ firebaseEnabled: true }));
vi.mock("@/stores/community", () => ({ useCommunity: () => ({ users: [], session: null, login: mocks.login }) }));
vi.mock("@/components/shared", () => ({ attempt: (action: () => Promise<unknown>) => action() }));
afterEach(cleanup);
beforeEach(() => {
  vi.clearAllMocks();
  mocks.login.mockResolvedValue({ id: "local-only", role: "USER", status: "APPROVED", emailVerified: true });
});

it("toggles password visibility without changing the value or submitting", () => {
  render(<AuthScreen />);
  const password = screen.getByLabelText("Mot de passe") as HTMLInputElement;
  fireEvent.change(password, { target: { value: "Local-only-password-123" } });
  expect(password.type).toBe("password");
  fireEvent.click(screen.getByRole("button", { name: "Afficher le mot de passe" }));
  expect(password.type).toBe("text");
  expect(password.value).toBe("Local-only-password-123");
  expect(mocks.login).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Masquer le mot de passe" }));
  expect(password.type).toBe("password");
});

it.each([false, true])("passes the chosen remember setting to login: %s", async (remember) => {
  render(<AuthScreen />);
  fireEvent.change(screen.getByLabelText("Adresse email"), { target: { value: "local@example.invalid" } });
  fireEvent.change(screen.getByLabelText("Mot de passe"), { target: { value: "Local-only-password-123" } });
  const checkbox = screen.getByRole("checkbox", { name: "Rester connecté" }) as HTMLInputElement;
  expect(checkbox.checked).toBe(false);
  if (remember) fireEvent.click(checkbox);
  fireEvent.click(screen.getByRole("button", { name: "Se connecter" }));
  await waitFor(() => expect(mocks.login).toHaveBeenCalledWith("local@example.invalid", "Local-only-password-123", remember));
  await waitFor(() => expect((screen.getByLabelText("Mot de passe") as HTMLInputElement).value).toBe(""));
});

it("provides independent visibility controls at registration", () => {
  render(<AuthScreen register />);
  expect(screen.queryByRole("checkbox", { name: "Rester connecté" })).toBeNull();
  const buttons = screen.getAllByRole("button", { name: "Afficher le mot de passe" });
  fireEvent.click(buttons[1]);
  expect((screen.getByLabelText("Mot de passe") as HTMLInputElement).type).toBe("password");
  expect((screen.getByLabelText("Confirmer le mot de passe") as HTMLInputElement).type).toBe("text");
});
