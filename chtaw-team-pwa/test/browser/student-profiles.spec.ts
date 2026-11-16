import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { fixture } from "./fixtures";
const photo = { name: "profile.png", mimeType: "image/png", buffer: readFileSync("public/branding/chtaw-logo.png") };
const school = { id: "ad17810e-dc39-4de4-a369-192bf19d9773", name: "Lycée Pilote de Tunis" };
const photoId = "e8ec430f-e716-43b5-8c6d-470cb19f2790";

for (const width of [390, 1440]) for (const theme of ["light", "dark"]) {
  test(`admin school suggestions and manual assignment ${width} ${theme}`, async ({ page }) => {
    const en = theme === "dark";
    await page.setViewportSize({ width, height: 900 });
    await fixture(page, "ADMIN", theme, en ? "en" : "fr");
    const student = { id: "fixture-student", firstName: "Nadia", lastName: "Test", email: "student@example.invalid", role: "USER", status: "PENDING", bio: "", joinedAt: "2026-11-16T10:00:00Z", phone: "+21620123456", establishment: null as typeof school | null, establishmentSuggestion: { id: "suggestion-1", name: "Lycée proposé", status: "PENDING" } };
    const suggestions = [{ id: "suggestion-1", name: "Lycée proposé", status: "PENDING", students: [student] }, { id: "suggestion-2", name: "Lycée refusé", status: "PENDING", students: [student] }];
    await page.route("**/api/v1/users?**", route => route.fulfill({ json: { items: [student], nextCursor: null } }));
    await page.route("**/api/v1/users", route => route.fulfill({ json: { items: [student], nextCursor: null } }));
    await page.route("**/api/v1/approvals/*/history", route => route.fulfill({ json: [] }));
    await page.route("**/api/v1/establishments", route => route.fulfill({ json: [school] }));
    await page.route("**/api/v1/admin/establishments", route => route.fulfill({ json: [school] }));
    await page.route("**/api/v1/admin/establishment-suggestions**", route => {
      if (route.request().method() === "PATCH") {
        const id = new URL(route.request().url()).pathname.split("/").at(-1);
        const item = suggestions.find(row => row.id === id)!;
        item.status = (route.request().postDataJSON() as { status: string }).status;
        return route.fulfill({ json: item });
      }
      return route.fulfill({ json: suggestions });
    });
    await page.route("**/api/v1/admin/students/*/establishment", route => {
      expect(route.request().method()).toBe("PATCH");
      expect(route.request().postDataJSON()).toEqual({ establishmentId: school.id });
      student.establishment = school;
      return route.fulfill({ json: student });
    });
    await page.goto("/admin/establishments");
    const section = page.getByRole("region", { name: en ? "School suggestions" : "Suggestions d’établissements" });
    await expect(section.getByText("Nadia Test", { exact: true })).toHaveCount(2);
    await section.screenshot({ path: `.test-browser-results/school-suggestions-${width}-${theme}.png` });
    await section.getByRole("listitem").filter({ has: page.getByRole("heading", { name: "Lycée proposé", exact: true }) }).getByRole("button", { name: en ? "Approve" : "Accepter", exact: true }).click();
    await expect(section.getByRole("status").filter({ hasText: en ? "Suggestion accepted." : "Suggestion acceptée." })).toBeVisible();
    await section.getByRole("listitem").filter({ has: page.getByRole("heading", { name: "Lycée refusé", exact: true }) }).getByRole("button", { name: en ? "Reject" : "Refuser", exact: true }).click();
    await expect(section.getByRole("status").filter({ hasText: en ? "Suggestion rejected." : "Suggestion refusée." })).toBeVisible();
    await section.getByLabel(en ? "Suggestion status" : "Statut de la suggestion").selectOption("REJECTED");
    await expect(section.getByRole("heading", { name: "Lycée refusé", exact: true })).toBeVisible();
    expect(student.status).toBe("PENDING");
    await page.goto("/admin/users");
    const row = page.getByRole("row").filter({ hasText: "student@example.invalid" });
    await expect(row.getByText("Lycée proposé", { exact: false }).first()).toBeVisible();
    await row.getByRole("button", { name: en ? "Edit school" : "Modifier l’établissement", exact: true }).click();
    let dialog = page.getByRole("dialog");
    await dialog.getByLabel(en ? "Search schools" : "Rechercher un établissement").fill("no-match");
    await expect(dialog.getByText(en ? "No schools match your search." : "Aucun établissement ne correspond à votre recherche.")).toBeVisible();
    await dialog.getByLabel(en ? "Search schools" : "Rechercher un établissement").fill("Pilote");
    await dialog.getByLabel(en ? "School / High school" : "Établissement / Lycée", { exact: true }).selectOption(school.id);
    await dialog.getByRole("button", { name: en ? "Save" : "Enregistrer", exact: true }).click();
    await expect(row.getByText(school.name, { exact: false }).first()).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `.test-browser-results/member-school-${width}-${theme}.png`, fullPage: true });
    await row.getByRole("button", { name: en ? "View profile" : "Consulter", exact: true }).click();
    dialog = page.getByRole("dialog");
    await expect(dialog.getByText(school.name, { exact: false }).first()).toBeVisible();
    await expect(dialog.getByText("+21620123456", { exact: true })).toBeVisible();
  });
}

for (const width of [390, 1440]) for (const theme of ["light", "dark"]) {
  test(`registration school choice and optional photo ${width} ${theme}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.addInitScript(theme => { localStorage.setItem("chtaw-theme", theme); delete Object.getPrototypeOf(navigator).serviceWorker; }, theme);
    let signedIn = false, photoUploads = 0;
    let registration: Record<string, unknown> | undefined;
    const student = { id: "registered-student", firstName: "Nadia", lastName: "Test", email: "register@test.invalid", role: "USER", status: "PENDING", bio: "", joinedAt: "2026-11-16T10:00:00Z", profilePhotoId: null as string | null };
    await page.route("**/api/v1/**", route => {
      const path = new URL(route.request().url()).pathname;
      if (path.endsWith("/establishments")) { expect(route.request().headers().authorization).toBeUndefined(); return route.fulfill({ json: [school] }); }
      if (path.endsWith("/auth/register")) { registration = route.request().postDataJSON() as Record<string, unknown>; return route.fulfill({ status: 201, json: student }); }
      if (path.endsWith("/auth/login")) { signedIn = true; return route.fulfill({ json: { accessToken: "local-render-only", expiresIn: 900, userId: student.id, user: student } }); }
      if (path.endsWith("/auth/me") && signedIn) return route.fulfill({ json: student });
      if (path.endsWith("/auth/refresh") && signedIn) return route.fulfill({ json: { accessToken: "local-render-only", expiresIn: 900, userId: student.id, sessionId: "signup-preview" } });
      if (path.endsWith("/users/me/photo")) {
        expect(signedIn).toBe(true); photoUploads++; student.profilePhotoId = photoId;
        expect(route.request().headers()["content-type"]).toContain("multipart/form-data");
        return route.fulfill({ status: 201, json: student });
      }
      return route.fulfill({ status: 401, json: { message: "No preview session" } });
    });
    await page.goto("/register");
    await page.getByLabel("Prénom", { exact: true }).fill("Nadia");
    await page.getByLabel("Nom", { exact: true }).fill("Test");
    await page.getByLabel("Rechercher un établissement").fill("Pilote");
    await expect(page.getByRole("option", { name: school.name })).toHaveCount(1);
    const other = theme === "dark";
    await page.getByLabel("Établissement / Lycée", { exact: true }).selectOption(other ? "OTHER" : school.id);
    if (other) await page.getByLabel("Nom du lycée proposé", { exact: true }).fill("  Lycée Nouveau  ");
    const withPhoto = width === 390;
    if (withPhoto) {
      await page.getByLabel("Photo de profil (facultative)", { exact: true }).setInputFiles(photo);
      await expect(page.getByRole("img", { name: "Aperçu de la photo" })).toBeVisible();
      await page.getByRole("button", { name: "Retirer l’image sélectionnée" }).click();
      await expect(page.getByRole("img", { name: "Aperçu de la photo" })).toHaveCount(0);
      await page.getByLabel("Photo de profil (facultative)", { exact: true }).setInputFiles(photo);
    }
    await page.getByLabel("Adresse email", { exact: true }).fill(student.email);
    await page.getByLabel("Téléphone", { exact: true }).fill("20123456");
    await page.locator("#auth-password").fill("Preview-registration-2026!");
    await page.locator("#auth-confirm").fill("Preview-registration-2026!");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `.test-browser-results/student-registration-${width}-${theme}.png`, fullPage: true });
    await page.getByRole("button", { name: "Créer mon compte", exact: true }).click();
    await expect(page).toHaveURL(/\/pending-approval$/);
    expect(registration).toMatchObject(other ? { proposedEstablishmentName: "Lycée Nouveau" } : { establishmentId: school.id });
    expect(registration?.phone).toBe("+21620123456");
    expect(registration).not.toHaveProperty(other ? "establishmentId" : "proposedEstablishmentName");
    expect(photoUploads).toBe(withPhoto ? 1 : 0);
  });
}

for (const role of ["ADMIN", "USER", "COLLABORATOR"] as const) for (const width of [390, 1440]) for (const theme of ["light", "dark"]) {
  test(`profile photo ${role} ${width} ${theme}`, async ({ page }) => {
    const en = role === "COLLABORATOR";
    await page.setViewportSize({ width, height: 900 });
    await fixture(page, role, theme, en ? "en" : "fr");
    let user = { id: "fixture-account", firstName: "Mohamed", lastName: "Rami", email: "fixture@example.invalid", role, status: "APPROVED", joinedAt: "2026-01-01T10:00:00Z", bio: "", profilePhotoId: null as string | null, establishment: role === "USER" ? school : null };
    await page.route("**/api/v1/auth/me", route => route.fulfill({ json: user }));
    await page.route("**/api/v1/users/me/photo", route => { user = { ...user, profilePhotoId: route.request().method() === "DELETE" ? null : photoId }; return route.fulfill({ json: user }); });
    await page.route("**/api/v1/profile-photos/**", route => route.fulfill({ contentType: "image/png", body: photo.buffer }));
    await page.goto("/app/profile");
    await expect(page.getByRole("heading", { name: en ? "My profile" : "Mon profil", exact: false }).first()).toBeVisible();
    await page.locator('input[type="file"]').setInputFiles(photo);
    await expect(page.getByRole("img", { name: en ? "Photo preview" : "Aperçu de la photo" })).toBeVisible();
    await page.getByRole("button", { name: en ? "Save photo" : "Enregistrer la photo", exact: true }).click();
    await expect(page.getByRole("status").filter({ hasText: en ? "Photo saved." : "Photo enregistrée." })).toBeVisible();
    await expect(page.locator(".user-menu .avatar img")).toBeVisible();
    await expect.poll(() => page.locator(".user-menu .avatar img").evaluate((node: HTMLImageElement) => node.complete && node.naturalWidth > 0)).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `.test-browser-results/profile-photo-${role}-${width}-${theme}.png`, fullPage: true });
    await page.getByRole("button", { name: en ? "Delete photo" : "Supprimer la photo", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("button", { name: en ? "Cancel" : "Annuler", exact: true }).click();
    expect(user.profilePhotoId).toBe(photoId);
    await page.getByRole("button", { name: en ? "Delete photo" : "Supprimer la photo", exact: true }).click();
    await dialog.getByRole("button", { name: en ? "Delete" : "Supprimer", exact: true }).click();
    await expect(page.locator(".user-menu .avatar")).toHaveText("mr");
    expect(user.profilePhotoId).toBeNull();
  });
}

test("broken private photo falls back to initials; invalid file cannot be saved", async ({ page }) => {
  await fixture(page, "USER", "light");
  const user = { id: "fixture-account", firstName: "Mohamed", lastName: "Rami", email: "fixture@example.invalid", role: "USER", status: "APPROVED", joinedAt: "2026-01-01T10:00:00Z", bio: "", profilePhotoId: photoId };
  let reads = 0;
  await page.route("**/api/v1/auth/me", route => route.fulfill({ json: user }));
  await page.route("**/api/v1/profile-photos/**", route => { reads++; return route.fulfill({ status: 404 }); });
  await page.goto("/app/profile");
  await expect.poll(() => reads).toBeGreaterThan(0);
  await expect(page.locator(".user-menu .avatar")).toHaveText("mr");
  await expect(page.locator(".user-menu .avatar img")).toHaveCount(0);
  await page.locator('input[type="file"]').setInputFiles({ name: "bad.txt", mimeType: "text/plain", buffer: Buffer.from("invalid") });
  await expect(page.getByText("Choisissez une image JPG, PNG, WebP ou GIF.", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Enregistrer la photo", exact: true })).toHaveCount(0);
});
