import React from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { RegistrationWizard } from "./registration-wizard";

const mocks = vi.hoisted(() => ({ register: vi.fn(), push: vi.fn(), official: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push }) }));
vi.mock("@/services/firebase", () => ({ firebaseEnabled: true }));
vi.mock("@/stores/community", () => ({ useCommunity: () => ({ register: mocks.register }) }));
vi.mock("@/services/student-schools.service", () => ({ studentSchoolsService: { official: mocks.official } }));
const school = { id: "school-local", name: "Lycée Pilote" };
const user = { id: "student-local", role: "USER", status: "PENDING", emailVerified: true };
const busy = vi.fn();
beforeEach(() => {
  vi.clearAllMocks(); mocks.official.mockResolvedValue([school]); mocks.register.mockResolvedValue(user);
  vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: vi.fn(() => "blob:preview-test"), revokeObjectURL: vi.fn() }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
async function identity() {
  fireEvent.change(screen.getByLabelText("Prénom"), { target: { value: "Nadia" } });
  fireEvent.change(screen.getByLabelText("Nom", { exact: true }), { target: { value: "Test" } });
  fireEvent.click(screen.getByRole("button", { name: "Suivant" }));
  await waitFor(() => expect((screen.getByLabelText("Lycée") as HTMLSelectElement).disabled).toBe(false));
}
async function account() {
  await identity();
  fireEvent.change(screen.getByLabelText("Lycée"), { target: { value: school.id } });
  fireEvent.click(screen.getByRole("button", { name: "Suivant" }));
  await screen.findByLabelText("Adresse email");
  for (const [label, value] of [["Adresse email", "student@test.invalid"], ["Numéro de téléphone", "20123456"], ["Mot de passe", "Local-password-2026!"], ["Confirmer le mot de passe", "Local-password-2026!"]]) {
    fireEvent.change(screen.getByLabelText(label), { target: { value } });
  }
}
it("validates identity, focuses the error and never creates an account during navigation", async () => {
  render(<RegistrationWizard onBusyChange={busy} />);
  expect(screen.queryByLabelText("Adresse email")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Suivant" }));
  await waitFor(() => expect(document.activeElement).toBe(screen.getByLabelText("Prénom")));
  await identity();
  expect(screen.queryByLabelText("Prénom")).toBeNull();
  expect(screen.queryByRole("searchbox")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Suivant" }));
  expect(screen.getByRole("alert").textContent).toBe("Choisissez votre lycée.");
  fireEvent.change(screen.getByLabelText("Lycée"), { target: { value: "OTHER" } });
  fireEvent.click(screen.getByRole("button", { name: "Suivant" }));
  expect(screen.getByRole("alert").textContent).toBe("Le nom de votre lycée est obligatoire.");
  expect(document.activeElement).toBe(screen.getByLabelText("Nom de votre lycée"));
  expect(mocks.register).not.toHaveBeenCalled();
});
it("preserves identity, photo and school when going back, without persisting private values", async () => {
  render(<RegistrationWizard onBusyChange={busy} />);
  const file = new File(["local-preview"], "profile.png", { type: "image/png" });
  const input = screen.getByLabelText("Photo de profil facultative") as HTMLInputElement;
  expect(input.hidden).toBe(true);
  fireEvent.change(input, { target: { files: [file] } });
  expect(screen.getByAltText("Aperçu de la photo")).toBeTruthy();
  await identity();
  fireEvent.change(screen.getByLabelText("Lycée"), { target: { value: "OTHER" } });
  fireEvent.change(screen.getByLabelText("Nom de votre lycée"), { target: { value: "Lycée proposé" } });
  fireEvent.click(screen.getByRole("button", { name: "Retour" }));
  expect((screen.getByLabelText("Prénom") as HTMLInputElement).value).toBe("Nadia");
  expect(screen.getByAltText("Aperçu de la photo")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Suivant" }));
  await screen.findByLabelText("Lycée");
  expect((screen.getByLabelText("Lycée") as HTMLSelectElement).value).toBe("OTHER");
  expect((screen.getByLabelText("Nom de votre lycée") as HTMLInputElement).value).toBe("Lycée proposé");
  expect(mocks.register).not.toHaveBeenCalled();
  expect(JSON.stringify(localStorage)).not.toContain("local-preview");
});
it("sends once on final submission, with canonical +216 phone and only one school choice", async () => {
  let resolve!: (value: typeof user) => void;
  mocks.register.mockImplementation(() => new Promise(res => { resolve = res; }));
  render(<RegistrationWizard onBusyChange={busy} />);
  await account();
  const form = screen.getByRole("button", { name: "Créer mon compte" }).closest("form")!;
  fireEvent.submit(form); fireEvent.submit(form);
  await waitFor(() => expect(mocks.register).toHaveBeenCalledTimes(1));
  expect(mocks.register.mock.calls[0][0]).toEqual({ firstName: "Nadia", lastName: "Test", email: "student@test.invalid", phone: "+21620123456", password: "Local-password-2026!", establishmentId: school.id });
  expect(busy).toHaveBeenCalledWith(true);
  resolve(user);
  await waitFor(() => expect(mocks.push).toHaveBeenCalledWith("/pending-approval"));
});
it("returns a server school error to the school step and retains account fields", async () => {
  mocks.register.mockRejectedValueOnce(new Error("Choisissez un établissement officiel valide."));
  render(<RegistrationWizard onBusyChange={busy} />);
  await account();
  fireEvent.click(screen.getByRole("button", { name: "Créer mon compte" }));
  await screen.findByLabelText("Lycée");
  expect(screen.getByRole("alert").textContent).toContain("établissement officiel valide");
  await waitFor(() => expect((screen.getByLabelText("Lycée") as HTMLSelectElement).disabled).toBe(false));
  fireEvent.click(screen.getByRole("button", { name: "Suivant" }));
  await screen.findByLabelText("Adresse email");
  expect((screen.getByLabelText("Adresse email") as HTMLInputElement).value).toBe("student@test.invalid");
  expect((screen.getByLabelText("Mot de passe") as HTMLInputElement).value).toBe("Local-password-2026!");
});
