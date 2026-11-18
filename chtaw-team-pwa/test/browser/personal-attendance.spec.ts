import { test, expect } from "@playwright/test";
import { fixture } from "./fixtures";
for (const width of [320, 390, 768, 1440]) for (const theme of ["light", "dark"]) {
  test(`client upcoming sessions and attendance history ${width} ${theme}`, async ({ page }) => {
    const en = theme === "dark";
    await page.setViewportSize({ width, height: 950 });
    await fixture(page, "USER", theme, en ? "en" : "fr");
    const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
    const user = { id: "fixture-account", firstName: "Mohamed", lastName: "Rami", role: "USER", status: "APPROVED", email: "fixture@example.invalid", bio: "", joinedAt: "2026-01-01T00:00:00Z" };
    const stats = { completed: 4, present: 2, absent: 1, upcoming: 2 };
    function row(id: string, question: string, attendanceStatus: string, future = false) {
      const startsAt = future ? "2099-01-01T10:00:00Z" : "2020-01-01T10:00:00Z";
      const endsAt = future ? "2099-01-01T11:30:00Z" : "2020-01-01T11:30:00Z";
      return { id, question, attendanceStatus, startsAt, endsAt, status: "OPEN", final: attendanceStatus, mandatoryAttendance: false, groupId: "fixture-group", groupName: "Team Chtaw", description: "", completed: !future, scheduleComplete: true, selections: [],
        slots: [{ optionId: id + "-slot", label: "Horaire réservé", startsAt, endsAt }] };
    }
    const upcoming = [row("future1", "Séance à venir réservée", "UPCOMING", true), row("future2", "Prochaine séance", "UPCOMING", true)];
    const history = [row("present", "Séance suivie", "PRESENT"), row("absent", "Séance manquée", "ABSENT"), row("pending", "Séance à confirmer", "PENDING"), row("cancelled", "Séance annulée", "CANCELLED")];
    let historyPage = 1;
    await page.route("**/api/v1/attendance/me?**", route => {
      const search = new URL(route.request().url()).searchParams;
      const future = search.get("status") === "UPCOMING";
      if (!future) { expect(search.get("phase")).toBe("HISTORY"); historyPage = Number(search.get("page")); }
      return route.fulfill({ headers: { "Access-Control-Allow-Origin": new URL(test.info().project.use.baseURL!).origin, "Access-Control-Allow-Credentials": "true" }, json: {
        user, stats, groups: [{ id: "fixture-group", name: "Team Chtaw" }], items: future ? upcoming : historyPage === 1 ? history : [row("older", "Séance ancienne", "PRESENT")],
        total: future ? 2 : 5, limit: future ? 20 : 4, page: future ? 1 : historyPage, timeZone: "Africa/Tunis", incompleteSchedules: false,
      } });
    });
    await page.goto("/app/attendance");
    await expect(page.locator(".personal-stats .stat-card").last().locator("strong")).toHaveText("2");
    await expect(page.getByRole("heading", { name: "Séance à venir réservée", exact: true })).toBeVisible();
    const table = page.getByRole("table", { name: en ? "My attendance history" : "Historique de mes présences" });
    await expect(table).toBeVisible();
    await expect(table.getByRole("row", { name: /Séance suivie/ })).toContainText(en ? "Present" : "Présent");
    await expect(table.getByRole("row", { name: /Séance manquée/ })).toContainText("Absent");
    await expect(table.getByRole("row", { name: /Séance à confirmer/ })).toContainText(en ? "Awaiting attendance" : "En attente de pointage");
    await expect(table.getByRole("row", { name: /Séance annulée/ })).toContainText(en ? "Cancelled" : "Annulée");
    await expect(table.getByText("Séance à venir réservée", { exact: true })).toHaveCount(0);
    expect(await page.locator("body").evaluate(node => node.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
    await page.screenshot({ path: test.info().outputPath("personal-attendance.png"), fullPage: true });
    await table.scrollIntoViewIfNeeded();
    await page.screenshot({ path: test.info().outputPath("attendance-history.png"), fullPage: true });
    const nav = page.getByRole("navigation", { name: en ? "My attendance history" : "Historique de mes présences" });
    await nav.getByRole("button", { name: en ? "Next" : "Suivant", exact: true }).click();
    await expect(table.getByText("Séance ancienne", { exact: true })).toBeVisible(); expect(historyPage).toBe(2);
    await expect(page.locator(".personal-stats .stat-card").last().locator("strong")).toHaveText("2");
    await expect(page.getByRole("heading", { name: "Séance à venir réservée", exact: true })).toBeVisible();
    expect(errors).toEqual([]);
  });
}
