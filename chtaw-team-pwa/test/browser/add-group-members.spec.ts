import { test, expect } from "@playwright/test";
import { fixture } from "./fixtures";

for (const width of [320, 375, 430, 1440]) for (const theme of ["light", "dark"]) {
  test(`conversation adds existing users at ${width}px in ${theme}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await fixture(page, "ADMIN", theme);
    const admin = { id: "fixture-account", firstName: "Mohamed", lastName: "Rami", role: "ADMIN", status: "APPROVED", email: "fixture@example.invalid", bio: "", joinedAt: "2026-01-01T10:00:00Z" };
    const candidate = { ...admin, id: "candidate", role: "USER", firstName: "Nadia", lastName: "Ben Ali", email: "nadia.long-email-address@example.invalid" };
    let group = { id: "fixture-group", name: "G1", description: "", color: "#be9af5", isGeneral: false, memberIds: [admin.id] };
    let additions = 0, creations = 0;
    page.on("request", (request) => { if (request.method() === "POST" && new URL(request.url()).pathname === "/api/v1/groups") creations++; });
    await page.route("**/api/v1/users?*", (route) => route.fulfill({ json: { items: [admin, candidate], nextCursor: null } }));
    await page.route("**/api/v1/groups", (route) => route.request().method() === "OPTIONS" ? route.fallback() : route.fulfill({ json: [group] }));
    await page.route("**/api/v1/groups/fixture-group", (route) => route.request().method() === "OPTIONS" ? route.fallback() : route.fulfill({ json: { ...group, members: [admin] } }));
    await page.route("**/api/v1/groups/fixture-group/messages?*", (route) => route.fulfill({ json: { items: [], nextCursor: null } }));
    await page.route("**/api/v1/groups/fixture-group/members/candidate", (route) => {
      if (route.request().method() === "OPTIONS") return route.fallback();
      expect(route.request().method()).toBe("PUT");
      additions++;
      group = { ...group, memberIds: [admin.id, candidate.id] };
      return route.fulfill({ json: group });
    });
    await page.goto("/app/groups/fixture-group");
    await page.getByRole("button", { name: "Ajouter des membres au groupe", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Ajouter des membres au groupe", exact: true });
    await expect(dialog.getByText(candidate.email)).toBeVisible();
    await expect(dialog.getByLabel("Nom du groupe")).toHaveCount(0);
    await dialog.getByRole("searchbox").fill("Ben Ali");
    await expect(dialog.getByText(candidate.email)).toBeVisible();
    await dialog.getByRole("searchbox").fill(candidate.email);
    await expect(dialog.getByText("Mohamed Rami")).toHaveCount(0);
    expect(await dialog.evaluate((node) => node.scrollWidth - node.clientWidth)).toBeLessThanOrEqual(1);
    await dialog.screenshot({ path: test.info().outputPath("add-member.png") });
    await dialog.getByRole("button", { name: "Ajouter Nadia Ben Ali au groupe" }).click();
    await expect(dialog.getByText("Déjà membre")).toBeVisible();
    await expect(page.locator(".chat-heading")).toContainText("2 membres");
    expect(additions).toBe(1);
    expect(creations).toBe(0);
    await dialog.getByRole("button", { name: "Fermer", exact: true }).last().click();
    await expect(dialog).toHaveCount(0);
  });
}
