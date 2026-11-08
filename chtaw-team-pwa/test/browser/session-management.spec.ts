import { test, expect } from "@playwright/test";
import { fixture } from "./fixtures";

for (const width of [320, 375, 1440]) for (const theme of ["light", "dark"]) {
  test(`session timing and removal at ${width}px in ${theme}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.clock.setFixedTime(new Date("2026-11-06T10:00:00Z"));
    await fixture(page, "ADMIN", theme);
    const student = { id: "student", firstName: "Nadia", lastName: "Team", email: "nadia@example.invalid", role: "USER", status: "APPROVED", bio: "", joinedAt: "2026-01-01T00:00:00Z" };
    let poll: { id: string; groupId: string; authorId: string; question: string; type: string; status: string; singleChoice: boolean; mandatoryAttendance: boolean; options: { id: string; label: string; startsAt: string; endsAt: string }[]; votes: never[] } | null = {
      id: "session", groupId: "fixture-group", authorId: "fixture-account", question: "Entraînement", type: "SESSION", status: "CLOSED", singleChoice: false, mandatoryAttendance: true, votes: [],
      options: [{ id: "one", label: "Horaire 1", startsAt: "2026-11-09T09:00:00Z", endsAt: "2026-11-09T10:00:00Z" }, { id: "two", label: "Horaire 2", startsAt: "2026-11-10T09:00:00Z", endsAt: "2026-11-10T10:00:00Z" }],
    };
    let pointages = 0, slotDeletes = 0, sessionDeletes = 0;
    let present = false;
    const roster = () => ({ id: "session", question: "Entraînement", group: { id: "fixture-group", name: "G1" }, status: "CLOSED", mandatoryAttendance: true, attendanceLockedAt: null,
      participants: [{ user: student, included: true, version: present ? 1 : 0, final: present ? "PRESENT" : "EN_ATTENTE" }],
      slots: poll!.options.map((slot) => ({ ...slot, students: [{ user: student, attendance: present && slot.id === "one" ? "PRESENT" : "NON_VERIFIE", version: present ? 1 : 0, participantVersion: present ? 1 : 0, final: present ? "PRESENT" : "EN_ATTENTE", absences: 0, voted: false }] })),
    });
    await page.route("**/api/v1/polls?*", (route) => route.fulfill({ json: { items: poll ? [poll] : [], nextCursor: null } }));
    await page.route("**/api/v1/polls/session/attendance", (route) => {
      if (route.request().method() === "OPTIONS") return route.fallback();
      if (route.request().method() === "PUT") {
        pointages++;
        expect(route.request().postDataJSON().entries).toEqual([expect.objectContaining({ optionId: "one", status: "PRESENT" })]);
        present = true;
      }
      return route.fulfill({ json: roster() });
    });
    await page.route("**/api/v1/polls/session/options/one", (route) => {
      if (route.request().method() === "OPTIONS") return route.fallback();
      expect(route.request().method()).toBe("DELETE"); slotDeletes++;
      poll = { ...poll!, options: [poll!.options[1]!] };
      return route.fulfill({ json: poll });
    });
    await page.route("**/api/v1/polls/session", (route) => {
      if (route.request().method() === "OPTIONS") return route.fallback();
      expect(route.request().method()).toBe("DELETE"); sessionDeletes++; poll = null;
      return route.fulfill({ status: 204 });
    });
    await page.goto("/admin/attendance/session");
    const mark = page.getByRole("button", { name: "Présent", exact: true });
    await expect(mark).toBeDisabled();
    await expect(page.getByText("Le pointage est disponible uniquement à partir de l’heure de début du créneau.", { exact: false })).toBeVisible();
    expect(pointages).toBe(0);
    await page.clock.setFixedTime(new Date("2026-11-09T09:00:00Z"));
    await expect(mark).toBeEnabled();
    await mark.click();
    await page.getByRole("button", { name: /Horaire 2/ }).click();
    await expect(mark).toBeDisabled();
    await page.getByRole("button", { name: "Enregistrer les présences", exact: true }).click();
    await expect.poll(() => pointages).toBe(1);
    await page.goto("/admin/polls");
    await page.getByRole("button", { name: "Gérer la séance : Entraînement", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Gérer la séance", exact: true });
    expect(await dialog.evaluate((node) => node.scrollWidth - node.clientWidth)).toBeLessThanOrEqual(1);
    await dialog.getByRole("button", { name: "Retirer le créneau : Horaire 1", exact: true }).click();
    expect(slotDeletes).toBe(0);
    await dialog.getByRole("button", { name: "Confirmer la suppression", exact: true }).click();
    await expect(dialog.getByRole("button", { name: "Retirer le créneau : Horaire 1", exact: true })).toHaveCount(0);
    await expect(dialog.getByRole("button", { name: "Retirer le créneau : Horaire 2", exact: true })).toBeDisabled();
    expect(slotDeletes).toBe(1);
    await dialog.getByRole("button", { name: "Supprimer la séance", exact: true }).click();
    expect(sessionDeletes).toBe(0);
    await dialog.getByRole("button", { name: "Confirmer la suppression", exact: true }).click();
    await expect(dialog).toHaveCount(0);
    expect(sessionDeletes).toBe(1);
    await page.goto("/admin/calendar");
    await expect(page.getByText("Aucun créneau enregistré pour cette semaine.")).toBeVisible();
    await page.reload();
    await expect(page.getByRole("heading", { name: "Entraînement", exact: true })).toHaveCount(0);
  });
}
