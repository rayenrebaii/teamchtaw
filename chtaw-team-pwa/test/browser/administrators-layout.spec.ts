import { test, expect } from "@playwright/test";
import { fixture } from "./fixtures";

for (const width of [390, 1440]) for (const theme of ["light", "dark"]) {
  test(`administrators membership layout ${width} ${theme}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    await fixture(page, "ADMIN", theme, "en");
    const principal = { id: "fixture-account", firstName: "Principal", lastName: "Preview", email: "principal@example.invalid", role: "ADMIN", status: "APPROVED", joinedAt: "2026-01-01T10:00:00Z", bio: "", isInvitedAdmin: false };
    await page.route("**/api/v1/admin/administrators", route => route.fulfill({ json: [principal,
      { ...principal, id: "agent", firstName: "Agent", email: "agent@example.invalid", isInvitedAdmin: true, activatedAt: "2026-11-18T10:00:00Z" },
      { ...principal, id: "pending", firstName: "Invited", email: "invited@example.invalid", isInvitedAdmin: true },
    ] }));
    await page.goto("/admin/administrators");
    await expect(page.getByText("principal@example.invalid", { exact: true })).toBeVisible();
    await expect(page.getByText("Total administrators", { exact: true })).toBeVisible();
    await expect(page.getByRole("tab", { name: /All administrators/ })).toBeVisible();
    await expect(page.getByRole("searchbox")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `.test-browser-results/administrators-layout-${width}-${theme}.png`, fullPage: true });
    await page.getByRole("tab", { name: /Pending invitations/ }).click();
    await expect(page.getByText("invited@example.invalid", { exact: true })).toBeVisible();
    await expect(page.getByText("principal@example.invalid", { exact: true })).toHaveCount(0);
    await page.getByRole("button", { name: "Reset", exact: true }).click();
    await page.getByRole("combobox", { name: "Account type", exact: true }).selectOption("PRINCIPAL");
    await expect(page.getByText("principal@example.invalid", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Delete", exact: true })).toHaveCount(0);
  });
}
