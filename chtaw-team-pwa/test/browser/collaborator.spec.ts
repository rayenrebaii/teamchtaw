import { test, expect } from "@playwright/test";
import { fixture } from "./fixtures";

for (const width of [320, 390, 768, 1440]) for (const theme of ["light", "dark"]) {
  test(`collaborator calendar, creation, attendance and reports at ${width}px ${theme}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.clock.setFixedTime(new Date("2026-11-10T10:00:00Z"));
    await fixture(page, "COLLABORATOR", theme);
    const session = (id: string, authorId: string) => ({ id, groupId: "fixture-group", authorId, question: id, type: "SESSION", status: "OPEN", singleChoice: false,
      options: [{ id: `${id}-slot`, label: "Horaire 1", startsAt: "2026-11-10T09:00:00Z", endsAt: "2026-11-10T12:00:00Z" }], votes: [] });
    await page.route("**/api/v1/polls?*", (route) => route.fulfill({ json: { items: [session("Ma séance", "fixture-account"), session("Autre organisateur", "other")], nextCursor: null } }));
    await page.goto("/collaborator");
    await expect(page.getByRole("heading", { name: "Mon calendrier", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Ma séance", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Autre organisateur", exact: true })).toHaveCount(0);
    await expect(page.locator('.rail a[href="/admin/users"]')).toHaveCount(0);
    expect(await page.locator(".workspace-content").evaluate((node) => node.scrollWidth - node.clientWidth)).toBeLessThanOrEqual(1);
    await page.screenshot({ path: test.info().outputPath("collaborator-calendar.png") });
    await page.getByRole("link", { name: "Créer un sondage de séance", exact: true }).click();
    await expect(page.getByRole("dialog", { name: "Créer un sondage de séance", exact: true })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("button", { name: "Créer un sondage simple", exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Modifier / annuler", exact: true })).toBeVisible();
    await page.goto("/collaborator/attendance");
    await expect(page.getByRole("heading", { name: "Gestion des présences", exact: true })).toBeVisible();
    expect(await page.locator(".workspace-content").evaluate((node) => node.scrollWidth - node.clientWidth)).toBeLessThanOrEqual(1);
    await page.goto("/collaborator/reports");
    await expect(page.getByRole("heading", { name: "Signalements par organisateur", exact: true })).toBeVisible();
    await expect(page.getByText("Aucun signalement.", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Suspendre le compte étudiant" })).toHaveCount(0);
    await page.goto("/admin/collaborators");
    await expect(page).toHaveURL(/\/collaborator$/);
  });
}
