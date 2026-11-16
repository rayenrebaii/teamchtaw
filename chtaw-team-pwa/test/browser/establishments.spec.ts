import { test, expect } from "@playwright/test";
import { fixture } from "./fixtures";

for (const width of [390, 1440]) for (const theme of ["light", "dark"]) for (const language of ["fr", "en"]) {
  test(`schools CRUD ${width}px ${theme} ${language}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await fixture(page, "ADMIN", theme, language);
    const en = language === "en";
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    let items: { id: string; name: string }[] = [];
    let failDelete = true;
    let writes = 0;
    await page.route("**/api/v1/admin/establishments**", async route => {
      const request = route.request();
      const method = request.method();
      const id = new URL(request.url()).pathname.split("/")[5];
      if (method === "GET") return route.fulfill({ json: items });
      if (method === "DELETE") {
        if (failDelete) { failDelete = false; return route.fulfill({ status: 500, json: { message: "Opération impossible." } }); }
        items = items.filter(item => item.id !== id);
        return route.fulfill({ status: 204 });
      }
      const { name } = request.postDataJSON() as { name: string };
      expect(name).toBe(name.trim());
      writes++;
      if (items.some(item => item.id !== id && item.name.toLowerCase() === name.toLowerCase())) return route.fulfill({ status: 409, json: { message: "Un établissement portant ce nom existe déjà." } });
      const item = { id: id ?? "school-fixture", name };
      items = [...items.filter(item => item.id !== id), item];
      return route.fulfill({ status: method === "POST" ? 201 : 200, json: item });
    });
    await page.goto("/admin/establishments");
    await expect(page.getByRole("heading", { name: en ? "Schools" : "Établissements", exact: true })).toBeVisible();
    const navigationLinks = page.locator(width === 390 ? ".admin-mobile-nav a" : ".rail nav a");
    expect((await navigationLinks.evaluateAll(links => links.map(link => link.getAttribute("href")))).slice(0, 4)).toEqual(["/app", "/admin/users", "/admin/calendar", "/admin/polls"]);
    await expect(page.getByText(en ? "No schools yet" : "Aucun établissement", { exact: true })).toBeVisible();
    if (width === 390) {
      await page.getByRole("button", { name: en ? "More" : "Plus", exact: true }).click();
      const navigation = page.getByRole("dialog");
      await expect(navigation.getByRole("link", { name: en ? "Schools" : "Établissements", exact: true })).toHaveAttribute("aria-current", "page");
      await navigation.getByRole("link", { name: en ? "Schools" : "Établissements", exact: true }).click();
    } else await expect(page.getByRole("link", { name: en ? "Schools" : "Établissements", exact: true })).toHaveAttribute("aria-current", "page");
    const add = page.getByRole("button", { name: en ? "Add a school" : "Ajouter un établissement", exact: true });
    await add.click();
    let dialog = page.getByRole("dialog");
    const input = dialog.getByLabel(en ? "High school name" : "Nom du lycée", { exact: true });
    await expect(dialog.getByRole("textbox")).toHaveCount(1);
    await input.fill("   ");
    await dialog.getByRole("button", { name: en ? "Save" : "Enregistrer", exact: true }).click();
    await expect(dialog.getByRole("alert")).toHaveText(en ? "High school name is required." : "Le nom du lycée est obligatoire.");
    expect(writes).toBe(0);
    await input.fill("  Lycée Pilote de Tunis  ");
    await dialog.getByRole("button", { name: en ? "Save" : "Enregistrer", exact: true }).click();
    await expect(page.getByRole("status").filter({ hasText: en ? "School added." : "Établissement ajouté." })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Lycée Pilote de Tunis", exact: true })).toBeVisible();
    await add.click();
    dialog = page.getByRole("dialog");
    await dialog.getByRole("textbox").fill("LYCÉE PILOTE DE TUNIS");
    await dialog.getByRole("button", { name: en ? "Save" : "Enregistrer", exact: true }).click();
    await expect(dialog.getByRole("alert")).toHaveText(en ? "A school with this name already exists." : "Un établissement portant ce nom existe déjà.");
    await page.screenshot({ path: `.test-browser-results/establishments-${language}-${theme}-${width}-duplicate.png`, fullPage: true });
    await dialog.getByRole("button", { name: en ? "Cancel" : "Annuler", exact: true }).click();
    await page.getByRole("button", { name: `${en ? "Edit" : "Modifier"} Lycée Pilote de Tunis`, exact: true }).click();
    dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("textbox")).toHaveValue("Lycée Pilote de Tunis");
    await dialog.getByRole("textbox").fill("Lycée Pierre de Coubertin");
    await dialog.getByRole("button", { name: en ? "Save" : "Enregistrer", exact: true }).click();
    await expect(page.getByRole("status").filter({ hasText: en ? "School updated." : "Établissement modifié." })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Lycée Pierre de Coubertin", exact: true })).toBeVisible();
    await expect(page.getByRole("columnheader", { name: en ? "High school name" : "Nom du lycée" })).toHaveCount(1);
    await expect(page.getByRole("columnheader", { name: "Actions" })).toHaveCount(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `.test-browser-results/establishments-${language}-${theme}-${width}.png`, fullPage: true });
    const remove = page.getByRole("button", { name: `${en ? "Delete" : "Supprimer"} Lycée Pierre de Coubertin`, exact: true });
    await remove.click();
    dialog = page.getByRole("dialog");
    await dialog.getByRole("button", { name: en ? "Cancel" : "Annuler", exact: true }).click();
    expect(items).toHaveLength(1);
    await remove.click();
    await dialog.getByRole("button", { name: en ? "Delete" : "Supprimer", exact: true }).click();
    await expect(dialog.getByRole("alert")).toHaveText(en ? "Operation failed." : "Opération impossible.");
    expect(items).toHaveLength(1);
    await dialog.getByRole("button", { name: en ? "Delete" : "Supprimer", exact: true }).click();
    await expect(page.getByRole("status").filter({ hasText: en ? "School deleted." : "Établissement supprimé." })).toBeVisible();
    await expect(page.getByText(en ? "No schools yet" : "Aucun établissement", { exact: true })).toBeVisible();
    expect(items).toHaveLength(0);
    expect(errors).toEqual([]);
  });
}

test("loading, load failure and retry", async ({ page }) => {
  await fixture(page, "ADMIN", "light", "en");
  let failed = true;
  let release!: () => void;
  const wait = new Promise<void>(resolve => { release = resolve; });
  await page.route("**/api/v1/admin/establishments", async route => {
    if (failed) { await wait; return route.fulfill({ status: 503, json: { message: "Opération impossible." } }); }
    return route.fulfill({ json: [] });
  });
  await page.goto("/admin/establishments");
  await expect(page.getByText("Loading…", { exact: true })).toBeVisible();
  release();
  await expect(page.getByRole("region", { name: "School list" }).getByRole("alert")).toContainText("Operation failed.");
  failed = false;
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await expect(page.getByText("No schools yet", { exact: true })).toBeVisible();
});
