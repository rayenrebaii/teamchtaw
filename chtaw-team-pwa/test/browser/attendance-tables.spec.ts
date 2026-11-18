import { test, expect } from "@playwright/test";
import { fixture } from "./fixtures";
for (const width of [320, 1440]) for (const language of ["fr", "en"]) {
  test(`attendance identity and six-row tables ${width}px ${language}`, async ({ page }) => {
    const en = language === "en";
    await page.setViewportSize({ width, height: 1000 });
    await fixture(page, "ADMIN", en ? "dark" : "light", language);
    const users = Array.from({ length: 7 }, (_, index) => ({ id: `student-${index}`, firstName: `Student${index}`, lastName: "Fixture", email: `student-${index}@fixture.invalid`, profilePhotoId: index === 0 ? "photo-fixture" : null, role: "USER", status: "APPROVED", joinedAt: "2026-01-01", bio: "" }));
    const roster = { id: "fixture-session", question: "Attendance fixture", group: { id: "fixture-group", name: "Fixture group" }, status: "CLOSED", attendanceLockedAt: null, mandatoryAttendance: true, finished: true,
      slots: [{ id: "fixture-slot", label: "Slot 1", startsAt: "2020-01-01T10:00:00Z", endsAt: "2020-01-01T11:30:00Z", students: users.map(user => ({ user, attendance: "NON_VERIFIE", final: "EN_ATTENTE", absences: 0, version: 0, participantVersion: 0, voted: true })) }] };
    const saved: { userId: string; status: string }[][] = [];
    const headers = { "Access-Control-Allow-Origin": new URL(test.info().project.use.baseURL!).origin, "Access-Control-Allow-Credentials": "true" };
    await page.route("**/api/v1/polls/fixture-session/attendance", route => {
      if (route.request().method() === "PUT") saved.push(route.request().postDataJSON().entries);
      return route.fulfill({ headers, json: roster });
    });
    await page.route("**/api/v1/profile-photos/**", route => route.fulfill({ headers, contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><rect width="40" height="40" fill="#b788ed"/><circle cx="20" cy="14" r="7" fill="#fff"/><path d="M7 38a13 13 0 0 1 26 0" fill="#fff"/></svg>' }));
    await page.goto("/admin/attendance/fixture-session");
    const table = page.locator(".roster-table");
    await expect(table.locator("tbody tr")).toHaveCount(6);
    await expect(table.locator("thead th")).toHaveCount(4);
    await expect(table).not.toContainText("@fixture.invalid");
    await expect(table.locator(".avatar img").first()).toBeVisible();
    await table.locator("tbody tr").first().getByRole("button", { name: en ? "Present" : "Présent", exact: true }).click();
    await page.getByRole("button", { name: en ? "Next" : "Suivant", exact: true }).click();
    await expect(table.locator("tbody tr")).toHaveCount(1);
    await table.locator("tbody tr").first().getByRole("button", { name: en ? "Absent" : "Absent", exact: true }).click();
    await page.getByRole("button", { name: en ? "Previous" : "Précédent", exact: true }).click();
    await expect(table.locator("tbody tr").first().getByRole("button", { name: en ? "Present" : "Présent", exact: true })).toHaveAttribute("aria-pressed", "true");
    await page.getByRole("button", { name: en ? "Save attendance" : "Enregistrer les présences", exact: true }).click();
    await expect.poll(() => saved.length).toBe(1);
    expect(saved[0]).toEqual(expect.arrayContaining([{ userId: "student-0", optionId: "fixture-slot", status: "PRESENT", version: 0, participantVersion: 0 }, { userId: "student-6", optionId: "fixture-slot", status: "ABSENT", version: 0, participantVersion: 0 }]));
    await expect(table.locator("tbody tr")).toHaveCount(6);
    expect(await page.locator(".workspace-content").evaluate(node => node.scrollWidth - node.clientWidth)).toBeLessThanOrEqual(1);
    await page.locator(".roster-table-shell").scrollIntoViewIfNeeded();
    await page.screenshot({ path: test.info().outputPath("attendance-identity.png") });
  });
}
