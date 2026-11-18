import { test, expect } from "@playwright/test";
import { fixture } from "./fixtures";
for (const width of [390, 1440]) for (const language of ["fr", "en"]) {
  test(`administration agents ${width}px ${language}`, async ({ page }) => {
    const en = language === "en";
    await page.setViewportSize({ width, height: 1000 });
    await fixture(page, "ADMIN", en ? "dark" : "light", language);
    const principal = { id: "fixture-account", firstName: "Principal", lastName: "Fixture", email: "principal@fixture.invalid", role: "ADMIN", status: "APPROVED", isInvitedAdmin: false, joinedAt: "2026-01-01", bio: "" };
    const agent = { ...principal, id: "fixture-agent", firstName: "Agent", email: "agent@fixture.invalid", isInvitedAdmin: true, principalAdminId: principal.id, activatedAt: "2026-11-18" };
    await page.route("**/api/v1/admin/administrators**", route => route.fulfill({ headers: { "Access-Control-Allow-Origin": new URL(test.info().project.use.baseURL!).origin, "Access-Control-Allow-Credentials": "true" }, json: [principal, agent] }));
    await page.goto("/admin/administrators");
    await expect(page.getByRole("heading", { name: en ? "Administrators" : "Administrateurs", exact: true })).toBeVisible();
    await expect(page.getByText(en ? "Protected account" : "Compte protégé", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: en ? "Invite an administrator" : "Inviter un administrateur", exact: true }).click();
    await expect(page.getByRole("dialog")).toContainText(en ? "Their sessions, polls and posts belong to the principal administrator" : "Ses séances, sondages et publications appartiennent à l’administrateur principal");
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: en ? "Delete" : "Supprimer", exact: true }).click();
    await expect(page.getByRole("dialog")).toContainText(en ? "attendance history will be preserved" : "historiques de présence de l’administrateur principal seront conservés");
    await expect(page.getByRole("button", { name: en ? "Remove access" : "Retirer l’accès", exact: true })).toBeVisible();
    expect(await page.locator(".workspace-content").evaluate(node => node.scrollWidth - node.clientWidth)).toBeLessThanOrEqual(1);
  });
}
