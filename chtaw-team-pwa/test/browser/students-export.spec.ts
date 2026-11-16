import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { fixture } from "./fixtures";

for (const width of [390, 1440]) for (const theme of ["light", "dark"]) {
  test(`admin student Excel download ${width} ${theme}`, async ({ page }) => {
    const en = theme === "dark";
    await page.setViewportSize({ width, height: 900 });
    await fixture(page, "ADMIN", theme, en ? "en" : "fr");
    let failed = true;
    const bytes = Buffer.from("transport-fixture-only");
    await page.route("**/api/v1/admin/students/export?**", route => {
      expect(new URL(route.request().url()).search).toBe(`?language=${en ? "en" : "fr"}`);
      expect(route.request().headers().authorization).toBeTruthy();
      if (failed) return route.fulfill({ status: 503 });
      return route.fulfill({ contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", body: bytes });
    });
    await page.goto("/admin/users");
    await page.getByPlaceholder(en ? "Name or email…" : "Nom, prénom ou email…").fill("no matching student");
    const button = page.getByRole("button", { name: "Export", exact: true }).or(page.getByRole("button", { name: "Exporter", exact: true }));
    await button.click();
    await expect(page.getByRole("alert").filter({ hasText: en ? "Export failed." : "Export impossible." })).toBeVisible();
    failed = false;
    const download = page.waitForEvent("download");
    await button.click();
    const file = await download;
    expect(file.suggestedFilename()).toBe("chtaw-team-students.xlsx");
    expect(await readFile((await file.path())!)).toEqual(bytes);
    await expect(page.getByRole("status").filter({ hasText: en ? "Export downloaded." : "Export téléchargé." })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `.test-browser-results/students-export-${width}-${theme}.png`, fullPage: true });
  });
}

test("collaborators cannot see the export control", async ({ page }) => {
  await fixture(page, "COLLABORATOR", "light");
  await page.goto("/collaborator");
  await expect(page.getByRole("button", { name: "Exporter", exact: true })).toHaveCount(0);
});
