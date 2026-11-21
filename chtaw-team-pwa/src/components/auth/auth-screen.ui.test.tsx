import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { translate } from "@/lib/i18n";
import { usePreferences } from "@/stores/preferences";
import { AuthScreen } from "./auth-screen";

const mocks = vi.hoisted(() => ({ login: vi.fn(), push: vi.fn(), replace: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push, replace: mocks.replace }) }));
vi.mock("@/services/firebase", () => ({ firebaseEnabled: true }));
vi.mock("@/stores/community", () => ({ useCommunity: () => ({ users: [], session: null, login: mocks.login }) }));
vi.mock("@/components/shared", async importOriginal => ({ ...await importOriginal<typeof import("@/components/shared")>(), attempt: (action: () => Promise<unknown>) => action() }));
vi.mock("@/services/student-schools.service", () => ({ studentSchoolsService: { official: vi.fn().mockResolvedValue([]) } }));
afterEach(() => { cleanup(); usePreferences.setState({ language: "fr" }); });
describe.each(["fr", "en"] as const)("auth in %s", language => {
const t = (key: string) => translate(key, language);
beforeEach(() => {
  usePreferences.setState({ language });
  vi.clearAllMocks();
  mocks.login.mockResolvedValue({ id: "local-only", role: "USER", status: "APPROVED", emailVerified: true });
});

it("toggles password visibility without changing the value or submitting", () => {
  render(<AuthScreen />);
  const password = screen.getByLabelText(t("Mot de passe")) as HTMLInputElement;
  fireEvent.change(password, { target: { value: "Local-only-password-123" } });
  expect(password.type).toBe("password");
  fireEvent.click(screen.getByRole("button", { name: t("Afficher le mot de passe") }));
  expect(password.type).toBe("text");
  expect(password.value).toBe("Local-only-password-123");
  expect(mocks.login).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: t("Masquer le mot de passe") }));
  expect(password.type).toBe("password");
});

it.each([false, true])("passes the chosen remember setting to login: %s", async (remember) => {
  render(<AuthScreen />);
  fireEvent.change(screen.getByLabelText(t("Adresse email")), { target: { value: "local@example.invalid" } });
  fireEvent.change(screen.getByLabelText(t("Mot de passe")), { target: { value: "Local-only-password-123" } });
  const checkbox = screen.getByRole("checkbox", { name: t("Rester connecté") }) as HTMLInputElement;
  expect(checkbox.checked).toBe(false);
  if (remember) fireEvent.click(checkbox);
  fireEvent.click(screen.getByRole("button", { name: t("Se connecter") }));
  await waitFor(() => expect(mocks.login).toHaveBeenCalledWith("local@example.invalid", "Local-only-password-123", remember));
  await waitFor(() => expect((screen.getByLabelText(t("Mot de passe")) as HTMLInputElement).value).toBe(""));
});

it("provides independent visibility controls on the account step", async () => {
  render(<AuthScreen register />);
  expect(screen.queryByRole("checkbox", { name: t("Rester connecté") })).toBeNull();
  fireEvent.change(screen.getByLabelText(t("Prénom")), { target: { value: "Nadia" } });
  fireEvent.change(screen.getByLabelText(t("Nom"), { exact: true }), { target: { value: "Test" } });
  fireEvent.click(screen.getByRole("button", { name: t("Suivant") }));
  await waitFor(() => expect((screen.getByLabelText(t("Lycée")) as HTMLSelectElement).disabled).toBe(false));
  fireEvent.change(screen.getByLabelText(t("Lycée")), { target: { value: "OTHER" } });
  fireEvent.change(screen.getByLabelText(t("Nom de votre lycée")), { target: { value: "Lycée local" } });
  fireEvent.click(screen.getByRole("button", { name: t("Suivant") }));
  await screen.findByLabelText(t("Mot de passe"));
  const buttons = screen.getAllByRole("button", { name: t("Afficher le mot de passe") });
  fireEvent.click(buttons[1]);
  expect((screen.getByLabelText(t("Mot de passe")) as HTMLInputElement).type).toBe("password");
  expect((screen.getByLabelText(t("Confirmer le mot de passe")) as HTMLInputElement).type).toBe("text");
});

});
