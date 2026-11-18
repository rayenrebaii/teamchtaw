import { test, expect } from "@playwright/test";
import { fixture } from "./fixtures";
import { analyticsFixture, analyticsSessionsFixture, analyticsAlertsFixture } from "../fixtures/analytics";

for (const width of [320, 390, 768, 1440]) for (const theme of ["light", "dark"]) {
  test(`analytics dashboard at ${width}px in ${theme}`, async ({ page }) => {
    const language = theme === "dark" ? "en" : "fr", en = language === "en";
    await page.setViewportSize({ width, height: 1000 });
    await fixture(page, "ADMIN", theme, language);
    let allRecordsRequested = false;
    page.on("request", request => { if (/\/api\/v1\/(users|polls)(\?|$)/.test(request.url())) allRecordsRequested = true; });
    await page.route("**/api/v1/admin/analytics**", route => {
      const url = new URL(route.request().url()), isSessions = url.pathname.endsWith("/sessions"), isAlerts = url.pathname.endsWith("/alerts");
      return route.fulfill({ headers: { "Access-Control-Allow-Origin": new URL(test.info().project.use.baseURL!).origin, "Access-Control-Allow-Credentials": "true" }, json: isSessions ? analyticsSessionsFixture : isAlerts ? analyticsAlertsFixture : analyticsFixture });
    });
    await page.goto("/admin");
    await expect(page.getByRole("heading", { name: en ? "Dashboard" : "Tableau de bord", exact: true })).toBeVisible();
    await expect(page.getByText("148", { exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: en ? "Registration trends" : "Évolution des inscriptions", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: en ? "Active alerts" : "Signalements actifs", exact: true })).toBeVisible();
    await expect(page.locator('[aria-label="' + (en ? "Key indicators" : "Indicateurs clés") + '"] article')).toHaveCount(5);
    expect(allRecordsRequested).toBe(false);
    const overflow = await page.locator(".workspace-content").evaluate(node => node.scrollWidth - node.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
    const chart = page.getByRole("img", { name: /Courbe des inscriptions|Registration chart/ });
    await chart.focus(); await page.keyboard.press("Home");
    await expect(page.getByText("2 " + (en ? "registration(s)" : "inscription(s)"), { exact: true })).toBeVisible();
    await page.getByRole("button", { name: en ? "Cumulative" : "Cumulées", exact: true }).click();
    await expect(page.getByText(en ? "90 cumulative accounts" : "90 comptes cumulés", { exact: true })).toBeVisible();
    if (width === 320 || width === 1440) {
      await page.locator(".workspace-content").evaluate(node => node.scrollTo(0, 0));
      await page.screenshot({ path: test.info().outputPath(`dashboard-${theme}.png`), fullPage: true });
      await page.getByRole("heading", { name: en ? "Attendance by group" : "Présences par groupe", exact: true }).scrollIntoViewIfNeeded();
      await page.screenshot({ path: test.info().outputPath(`comparisons-${theme}.png`), fullPage: true });
      await page.getByRole("heading", { name: en ? "Active alerts" : "Signalements actifs", exact: true }).scrollIntoViewIfNeeded();
      await page.screenshot({ path: test.info().outputPath(`alerts-${theme}.png`), fullPage: true });
    }
    await page.getByRole("button", { name: /^Préparation au bac/ }).click();
    await expect(page.getByLabel(en ? "Group" : "Groupe", { exact: true })).toHaveValue(analyticsFixture.groups[0]!.id);
    await page.getByRole("button", { name: en ? "Reset" : "Réinitialiser", exact: true }).click();
    await expect(page.getByLabel(en ? "Group" : "Groupe", { exact: true })).toHaveValue("");
  });
}
