import { test, expect } from "@playwright/test";
import { fixture } from "./fixtures";

for (const width of [320, 360, 375, 390, 430, 768, 1440]) for (const theme of ["light", "dark"]) {
  test(`admin calendar weeks, history and session creation at ${width}px in ${theme}`, async ({ page }) => {
    const language = theme === "dark" ? "en" : "fr";
    const en = language === "en";
    await page.setViewportSize({ width, height: 1000 });
    await page.clock.setFixedTime(new Date("2026-11-06T10:00:00Z"));
    await fixture(page, "ADMIN", theme, language);
    const session = (id: string, day: string, start = "10:00", end = "11:00") => ({
      id, groupId: "fixture-group", authorId: "fixture-account", question: id, type: "SESSION", status: "CLOSED", singleChoice: false,
      options: [{ id: `${id}-slot`, label: "Horaire 1", startsAt: `${day}T${start}:00Z`, endsAt: `${day}T${end}:00Z` }], votes: [],
    });
    const polls = [session("Completed session", "2026-11-03"), session("Ongoing session", "2026-11-06", "09:30", "10:30"), session("Upcoming session", "2026-11-06", "14:00", "15:00"),
      session("Archived session", "2026-10-27"), session("Next week session", "2026-11-10"), { ...session("Cancelled session", "2026-11-05"), status: "CANCELLED" },
      { ...session("Ordinary poll", "2026-11-06"), type: "ORDINARY" }];
    await page.route("**/api/v1/polls?*", (route) => route.fulfill({ json: { items: polls, nextCursor: null } }));
    await page.goto("/admin/calendar");
    await expect(page.getByRole("heading", { name: en ? "Admin calendar" : "Calendrier admin", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Completed session", exact: true })).toBeVisible();
    const event = (title: string) => page.locator("article").filter({ has: page.getByRole("heading", { name: title, exact: true }) });
    await expect(event("Completed session")).toHaveAttribute("data-state", "COMPLETED");
    await expect(event("Ongoing session")).toHaveAttribute("data-state", "ONGOING");
    await expect(event("Upcoming session")).toHaveAttribute("data-state", "UPCOMING");
    await expect(event("Cancelled session")).toHaveAttribute("data-state", "CANCELLED");
    await expect(page.getByRole("heading", { name: "Archived session", exact: true })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Next week session", exact: true })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Ordinary poll", exact: true })).toHaveCount(0);
    await expect(page.locator('[data-today="true"]')).toHaveCount(1);
    const overflow = await page.locator(".workspace-content").evaluate((node) => node.scrollWidth - node.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
    if (width === 320 || width === 1440) await page.screenshot({ path: test.info().outputPath("calendar.png") });
    await event("Completed session").getByRole("button").click();
    await expect(page.getByRole("dialog", { name: en ? "Poll results" : "Résultats du sondage", exact: true })).toBeVisible();
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: en ? "Next week" : "Semaine suivante", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Next week session", exact: true })).toBeVisible();
    const weeks = page.getByRole("combobox", { name: en ? "Choose a week" : "Choisir une semaine", exact: true });
    await weeks.selectOption("2026-10-26");
    await expect(event("Archived session")).toHaveAttribute("data-state", "COMPLETED");
    await expect(page.getByRole("heading", { name: "Completed session", exact: true })).toHaveCount(0);
    await page.getByRole("button", { name: en ? "This week" : "Cette semaine", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Completed session", exact: true })).toBeVisible();
    await page.goto("/admin/calendar?week=2026-10-26");
    await expect(event("Archived session")).toHaveAttribute("data-state", "COMPLETED");
    await page.reload();
    await expect(event("Archived session")).toHaveAttribute("data-state", "COMPLETED");
    if (width <= 640) {
      await page.getByRole("button", { name: en ? "More" : "Plus", exact: true }).click();
      await page.getByRole("navigation", { name: en ? "All sections" : "Toutes les sections" }).getByRole("link", { name: en ? "Calendar" : "Calendrier", exact: true }).click();
    } else {
      await page.locator(".rail").getByRole("link", { name: en ? "Calendar" : "Calendrier", exact: true }).click();
    }
    await expect(page).toHaveURL(/\/admin\/calendar$/);
    await page.getByRole("link", { name: en ? "Create a session poll" : "Créer un sondage de séance", exact: true }).click();
    await expect(page.getByRole("dialog", { name: en ? "Create a session poll" : "Créer un sondage de séance", exact: true })).toBeVisible();
  });
}
