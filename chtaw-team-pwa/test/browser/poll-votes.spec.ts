import { test, expect } from "@playwright/test";
import { fixture } from "./fixtures";

for (const width of [320, 375, 430, 768, 1440]) for (const theme of ["light", "dark"]) {
  test(`both poll types show voters and non-voters at ${width}px in ${theme}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await fixture(page, "ADMIN", theme);
    const admin = { id: "fixture-account", firstName: "Mohamed", lastName: "Rami", email: "fixture@example.invalid", role: "ADMIN", status: "APPROVED", joinedAt: "2026-01-01T10:00:00Z", bio: "" };
    const voter = { ...admin, id: "voter", firstName: "Nadia", email: "nadia.long-email-address@example.invalid", role: "USER" };
    const missing = { ...voter, id: "missing", firstName: "Amine", email: "amine.long-email-address@example.invalid" };
    const outsider = { ...missing, id: "outsider", firstName: "Outsider", email: "outsider@example.invalid" };
    const group = { id: "fixture-group", name: "G1", description: "", color: "#be9af5", isGeneral: false, memberIds: [admin.id, voter.id, missing.id] };
    const session = { id: "session", groupId: group.id, authorId: admin.id, question: "Quel créneau ?", type: "SESSION", status: "OPEN", singleChoice: false,
      options: [{ id: "a", label: "Horaire 1", startsAt: "2099-01-02T10:00:00Z", endsAt: "2099-01-02T11:00:00Z" }, { id: "b", label: "Horaire 2" }, { id: "c", label: "Horaire 3" }],
      votes: [{ userId: voter.id, optionIds: ["a", "b"] }] };
    const ordinary = { ...session, id: "ordinary", type: "ORDINARY", question: "Quel format préférez-vous ?" };
    await page.route("**/api/v1/users?*", (route) => route.fulfill({ json: { items: [admin, voter, missing, outsider], nextCursor: null } }));
    await page.route("**/api/v1/groups", (route) => route.fulfill({ json: [group] }));
    await page.route("**/api/v1/polls?*", (route) => route.fulfill({ json: { items: [session, ordinary], nextCursor: null } }));
    await page.goto("/admin/polls");
    await expect(page.getByRole("heading", { name: "Sondages", level: 1 })).toBeVisible();
    await expect(page.getByRole("button", { name: "Créer un sondage de séance", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Créer un sondage simple", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: /Présences et alertes|Gérer les présences/ })).toHaveCount(0);
    expect(await page.locator(".workspace-content").evaluate((node) => node.scrollWidth - node.clientWidth)).toBeLessThanOrEqual(1);
    await page.getByRole("button", { name: "Voir les résultats : Quel créneau ?", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Résultats du sondage" });
    await expect(dialog.getByRole("region", { name: "Horaire 1", exact: true }).getByText(voter.email)).toBeVisible();
    await expect(dialog.getByRole("region", { name: "Horaire 2", exact: true }).getByText(voter.email)).toBeVisible();
    await expect(dialog.getByRole("region", { name: "Horaire 3", exact: true })).toContainText("Aucun vote pour ce choix.");
    const nonVoters = dialog.getByRole("region", { name: "Membres sans vote", exact: true });
    await expect(nonVoters.getByText(missing.email)).toBeVisible();
    await expect(nonVoters.getByText(voter.email)).toHaveCount(0);
    await expect(nonVoters.getByText(admin.email)).toHaveCount(0);
    await expect(dialog.getByText(outsider.email)).toHaveCount(0);
    await expect(dialog.getByText(/présence|absence|pointage/i)).toHaveCount(0);
    expect(await dialog.evaluate((node) => node.scrollWidth - node.clientWidth)).toBeLessThanOrEqual(1);
    if (width === 320 || width === 1440) await dialog.screenshot({ path: test.info().outputPath("session-votes.png") });
    await page.keyboard.press("Escape");
    await page.getByRole("tab", { name: /Sondages simples/ }).click();
    await expect(page.getByRole("heading", { name: "Quel créneau ?" })).toHaveCount(0);
    await page.getByRole("button", { name: "Voir les résultats : Quel format préférez-vous ?", exact: true }).click();
    await expect(nonVoters.getByText(missing.email)).toBeVisible();
    await expect(nonVoters.getByText(admin.email)).toBeVisible();
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Créer un sondage de séance", exact: true }).click();
    const editor = page.getByRole("dialog", { name: "Créer un sondage de séance" });
    await expect(editor.getByLabel("Date et heure", { exact: true })).toBeVisible();
    await expect(editor.getByText(/présence|absence|pointage/i)).toHaveCount(0);
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Créer un sondage simple", exact: true }).click();
    await expect(page.getByRole("dialog", { name: "Créer un sondage", exact: true }).getByLabel("Votre question")).toBeVisible();
  });
}
