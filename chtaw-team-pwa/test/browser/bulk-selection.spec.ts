import { test, expect } from "@playwright/test";
import { fixture } from "./fixtures";
for (const width of [390, 1440]) for (const language of ["fr", "en"]) {
  test(`poll selection and attendance export ${width}px ${language}`, async ({ page }) => {
    const en = language === "en";
    await page.setViewportSize({ width, height: 1000 });
    await fixture(page, "ADMIN", en ? "dark" : "light", language);
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    const group = { id: "fixture-group", name: "Fixture group" };
    const polls = Array.from({ length: 7 }, (_, index) => ({ id: `poll-${index}`, authorId: "fixture-account", groupId: group.id, question: `Session ${index}`, type: "SESSION", status: "CLOSED", singleChoice: true,
      options: [{ id: "slot", label: "Slot 1", startsAt: "2026-11-18T15:04:00Z" }], votes: [] }));
    await page.route("**/api/v1/polls?*", route => route.fulfill({ json: { items: polls, nextCursor: null } }));
    await page.route("**/api/v1/admin/attendance/sessions?*", route => route.fulfill({ json: { items: polls.slice(0, 2).map(poll => ({ ...poll, group, groups: [group], phase: "FINISHED", concerned: 0, present: 0, toVerify: 0 })), total: 2 } }));
    await page.route("**/api/v1/polls/poll-*/attendance", route => {
      const id = new URL(route.request().url()).pathname.split("/").at(-2)!;
      return route.fulfill({ json: { id, question: polls.find(poll => poll.id === id)!.question, group, status: "CLOSED", attendanceLockedAt: null,
        slots: [{ id: "slot", label: "Slot 1", startsAt: "2026-11-18T15:04:00Z", students: [] }] } });
    });
    await page.goto("/admin/polls");
    await page.getByRole("checkbox", { name: en ? "Select polls on this page" : "Sélectionner les sondages de cette page" }).check();
    await expect(page.getByText(en ? "6 selected" : "6 sélectionné(s)", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: en ? "Next" : "Suivant", exact: true }).click();
    await page.getByRole("checkbox", { name: en ? "Select Session 6" : "Sélectionner Session 6", exact: true }).check();
    await page.getByRole("button", { name: en ? "Delete selection (7)" : "Supprimer la sélection (7)", exact: true }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.getByRole("button", { name: en ? "Cancel" : "Annuler", exact: true }).click();
    await page.screenshot({ path: test.info().outputPath("polls.png"), fullPage: true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
    await page.goto("/admin/attendance");
    await page.getByRole("checkbox", { name: en ? "Select time slots on this page" : "Sélectionner les horaires de cette page" }).check();
    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: en ? "Export selected attendance lists (2)" : "Exporter les listes sélectionnées (2)", exact: true }).click();
    expect((await download).suggestedFilename()).toBe("chtaw-team-attendance.csv");
    await expect(page.getByText(en ? "Export downloaded." : "Export téléchargé.", { exact: true })).toBeVisible();
    await page.screenshot({ path: test.info().outputPath("attendance.png"), fullPage: true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
    expect(errors).toEqual([]);
  });
}
