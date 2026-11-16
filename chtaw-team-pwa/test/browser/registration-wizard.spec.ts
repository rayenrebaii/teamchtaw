import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";

const school = { id: "ad17810e-dc39-4de4-a369-192bf19d9773", name: "Pilote de Tunis — Lycée officiel" };
const photo = { name: "photo.png", mimeType: "image/png", buffer: readFileSync("public/branding/chtaw-logo.png") };
const password = "Local-wizard-password-2026!";
async function setup(page: Page, theme = "light") {
  await page.addInitScript(theme => { localStorage.setItem("chtaw-theme", theme); localStorage.setItem("chtaw-language", "fr"); delete Object.getPrototypeOf(navigator).serviceWorker; }, theme);
  await page.routeWebSocket("**/socket.io/**", socket => socket.close());
  const state = { registrations: [] as Record<string, unknown>[], uploads: 0, signedIn: false, schoolFailure: false, emptySchools: false, serverError: "" };
  const student = { id: "registered-student", firstName: "Nadia", lastName: "Test", email: "wizard@test.invalid", role: "USER", status: "PENDING", joinedAt: "2026-11-16T10:00:00Z", bio: "", profilePhotoId: null as string | null };
  await page.route("**/api/v1/**", async route => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/establishments")) {
      expect(route.request().headers().authorization).toBeUndefined();
      if (state.schoolFailure) return route.fulfill({ status: 503, json: { message: "Chargement impossible." } });
      return route.fulfill({ json: state.emptySchools ? [] : [...Array.from({ length: 250 }, (_, index) => ({ id: `other-${index}`, name: `Lycée ${String(index).padStart(3, "0")} — nom complet conservé` })), school] });
    }
    if (path.endsWith("/auth/register")) {
      state.registrations.push(route.request().postDataJSON());
      await new Promise(resolve => setTimeout(resolve, 150));
      if (state.serverError) { const message = state.serverError; state.serverError = ""; return route.fulfill({ status: 400, json: { message } }); }
      return route.fulfill({ status: 201, json: student });
    }
    if (path.endsWith("/auth/login") || (path.endsWith("/auth/refresh") && state.signedIn)) {
      state.signedIn = true; return route.fulfill({ json: { accessToken: "local-render-only", expiresIn: 900, userId: student.id, sessionId: "wizard-preview", user: student } });
    }
    if (path.endsWith("/auth/me") && state.signedIn) return route.fulfill({ json: student });
    if (path.endsWith("/users/me/photo")) {
      expect(state.signedIn).toBe(true); expect(state.registrations).toHaveLength(1);
      state.uploads++; student.profilePhotoId = "e8ec430f-e716-43b5-8c6d-470cb19f2790";
      return route.fulfill({ status: 201, json: student });
    }
    if (path.includes("/profile-photos/")) return route.fulfill({ contentType: "image/png", body: photo.buffer });
    return route.fulfill({ status: 401, json: { message: "Anonymous render fixture" } });
  });
  await page.goto("/register");
  return state;
}
async function identity(page: Page) {
  await page.getByLabel("Prénom", { exact: true }).fill("Nadia");
  await page.getByLabel("Nom", { exact: true }).fill("Test");
  await page.getByRole("button", { name: "Suivant", exact: true }).click();
  await expect(page.getByLabel("Lycée", { exact: true })).toBeEnabled();
}
async function account(page: Page) {
  await page.getByLabel("Adresse email", { exact: true }).fill("wizard@test.invalid");
  await page.getByLabel("Numéro de téléphone", { exact: true }).fill("20123456");
  await page.locator("#auth-password").fill(password);
  await page.locator("#auth-confirm").fill(password);
}
async function singleStep(page: Page, number: number) {
  await expect(page.locator("[data-registration-step]")).toHaveCount(1);
  await expect(page.locator(`[data-registration-step="${number}"]`)).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}
for (const width of [390, 1440]) for (const theme of ["light", "dark"]) {
  test(`three registration steps ${width} ${theme}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const state = await setup(page, theme);
    await singleStep(page, 1);
    await expect(page.getByLabel("Adresse email", { exact: true })).toHaveCount(0);
    await expect(page.locator('input[type="file"]')).toBeHidden();
    await page.getByRole("button", { name: "Suivant", exact: true }).click();
    await expect(page.getByLabel("Prénom", { exact: true })).toBeFocused();
    await expect(page.getByRole("alert").first()).toContainText("Au moins 2 caractères.");
    await page.getByLabel("Prénom", { exact: true }).fill("Nadia");
    await page.getByLabel("Nom", { exact: true }).fill("Test");
    await expect(page.getByRole("alert").filter({ hasText: "Au moins 2 caractères." })).toHaveCount(0);
    const withPhoto = width === 390;
    if (withPhoto) {
      const chooser = page.waitForEvent("filechooser");
      await page.getByRole("button", { name: "Ajouter une photo", exact: true }).click();
      await (await chooser).setFiles(photo);
      await expect(page.getByRole("img", { name: "Aperçu de la photo" })).toBeVisible();
      await page.getByLabel("Photo de profil facultative").setInputFiles({ ...photo, name: "replacement.png" });
      await page.getByRole("button", { name: "Retirer la photo sélectionnée" }).click();
      await expect(page.getByRole("img", { name: "Aperçu de la photo" })).toHaveCount(0);
      await page.getByLabel("Photo de profil facultative").setInputFiles(photo);
    }
    await page.screenshot({ path: `.test-browser-results/registration-wizard-1-${width}-${theme}.png`, fullPage: true });
    await page.getByRole("button", { name: "Suivant", exact: true }).click();
    await singleStep(page, 2);
    await expect(page.getByRole("heading", { name: "Votre lycée", exact: true })).toBeFocused();
    await expect(page.getByRole("searchbox")).toHaveCount(0);
    await expect(page.getByLabel("Prénom", { exact: true })).toHaveCount(0);
    await expect(page.getByLabel("Lycée", { exact: true }).locator("option")).toHaveCount(253);
    const other = theme === "dark";
    const select = page.getByLabel("Lycée", { exact: true });
    if (other) {
      await select.selectOption("OTHER");
      await page.getByRole("button", { name: "Suivant", exact: true }).click();
      await expect(page.getByLabel("Nom de votre lycée", { exact: true })).toBeFocused();
      await page.getByLabel("Nom de votre lycée", { exact: true }).fill("  Lycée proposé  ");
    } else {
      await select.focus(); await select.press("p");
      await expect(select).toHaveValue(school.id);
    }
    await page.screenshot({ path: `.test-browser-results/registration-wizard-2-${width}-${theme}.png`, fullPage: true });
    await page.getByRole("button", { name: "Retour", exact: true }).click();
    await expect(page.getByLabel("Prénom", { exact: true })).toHaveValue("Nadia");
    if (withPhoto) await expect(page.getByRole("img", { name: "Aperçu de la photo" })).toBeVisible();
    expect(state.registrations).toHaveLength(0); expect(state.uploads).toBe(0);
    await page.getByRole("button", { name: "Suivant", exact: true }).click();
    await expect(select).toHaveValue(other ? "OTHER" : school.id);
    await page.getByRole("button", { name: "Suivant", exact: true }).click();
    await singleStep(page, 3);
    await expect(page.getByRole("heading", { name: "Votre compte", exact: true })).toBeFocused();
    await page.getByRole("button", { name: "Créer mon compte", exact: true }).click();
    await expect(page.getByLabel("Adresse email", { exact: true })).toBeFocused();
    await account(page);
    await page.locator("#auth-confirm").fill("different-password");
    await page.getByRole("button", { name: "Créer mon compte", exact: true }).click();
    await expect(page.getByText("Les mots de passe ne correspondent pas.", { exact: true })).toBeVisible();
    expect(state.registrations).toHaveLength(0);
    await page.locator("#auth-confirm").fill(password);
    await page.getByRole("button", { name: "Afficher le mot de passe", exact: true }).nth(1).click();
    await expect(page.locator("#auth-confirm")).toHaveAttribute("type", "text");
    await expect(page.locator("#auth-password")).toHaveAttribute("type", "password");
    await page.getByRole("button", { name: "Retour", exact: true }).click();
    await page.getByRole("button", { name: "Suivant", exact: true }).click();
    await expect(page.locator("#auth-password")).toHaveValue(password);
    await expect(page.getByRole("heading", { name: "Votre compte", exact: true })).toBeFocused();
    expect(state.registrations).toHaveLength(0);
    expect(await page.evaluate(() => JSON.stringify(localStorage))).not.toContain(password);
    await page.screenshot({ path: `.test-browser-results/registration-wizard-3-${width}-${theme}.png`, fullPage: true });
    await page.getByRole("button", { name: "Créer mon compte", exact: true }).evaluate((button: HTMLButtonElement) => { button.click(); button.click(); });
    await expect(page).toHaveURL(/\/pending-approval$/);
    expect(state.registrations).toHaveLength(1); expect(state.uploads).toBe(withPhoto ? 1 : 0);
    expect(state.registrations[0]).toMatchObject({ firstName: "Nadia", lastName: "Test", phone: "+21620123456", ...(other ? { proposedEstablishmentName: "Lycée proposé" } : { establishmentId: school.id }) });
    expect(state.registrations[0]).not.toHaveProperty(other ? "establishmentId" : "proposedEstablishmentName");
  });
}
test("server error returns to school and preserves account data", async ({ page }) => {
  const state = await setup(page); await identity(page);
  await page.getByLabel("Lycée", { exact: true }).selectOption(school.id);
  await page.getByRole("button", { name: "Suivant", exact: true }).click(); await account(page);
  state.serverError = "Choisissez un établissement officiel valide.";
  await page.getByRole("button", { name: "Créer mon compte", exact: true }).click();
  await singleStep(page, 2);
  await expect(page.getByRole("alert").filter({ hasText: "établissement officiel valide" })).toBeVisible();
  await expect(page.getByLabel("Lycée", { exact: true })).toBeFocused();
  await page.getByLabel("Lycée", { exact: true }).selectOption("OTHER");
  await page.getByLabel("Nom de votre lycée", { exact: true }).fill("Lycée nouveau");
  await page.getByRole("button", { name: "Suivant", exact: true }).click();
  await expect(page.getByLabel("Adresse email", { exact: true })).toHaveValue("wizard@test.invalid");
  await expect(page.locator("#auth-password")).toHaveValue(password);
  await expect(page.getByLabel("Numéro de téléphone", { exact: true })).toHaveValue("20123456");
  expect(state.uploads).toBe(0);
});
test("loading failure, retry, empty list and reduced motion on a small viewport", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 }); await page.emulateMedia({ reducedMotion: "reduce" });
  const state = await setup(page); state.schoolFailure = true; await identity(page);
  await expect(page.getByRole("alert").filter({ hasText: "Chargement impossible." })).toBeVisible();
  state.schoolFailure = false; state.emptySchools = true;
  await page.getByRole("button", { name: "Réessayer", exact: true }).click();
  await expect(page.getByText("Aucun établissement officiel disponible.", { exact: true })).toBeVisible();
  await page.getByLabel("Lycée", { exact: true }).selectOption("OTHER");
  await page.getByLabel("Nom de votre lycée", { exact: true }).fill("Lycée proposé");
  await page.getByRole("button", { name: "Suivant", exact: true }).click(); await singleStep(page, 3);
  expect(await page.locator("[data-registration-step]").evaluate(node => node.getAnimations().length)).toBe(0);
  await page.setViewportSize({ width: 320, height: 360 });
  await page.locator("#auth-confirm").focus(); await page.locator("#auth-confirm").scrollIntoViewIfNeeded();
  await expect(page.locator("#auth-confirm")).toBeFocused();
  const box = await page.locator("#auth-confirm").boundingBox(); expect(box!.y).toBeGreaterThanOrEqual(0); expect(box!.y + box!.height).toBeLessThanOrEqual(360);
  expect(state.registrations).toHaveLength(0);
});
