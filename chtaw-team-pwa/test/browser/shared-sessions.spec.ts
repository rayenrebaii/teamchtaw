import { test, expect } from "@playwright/test";
import { fixture } from "./fixtures";
import type { Poll } from "../../src/types";

for (const width of [320, 390, 1440]) for (const theme of ["light", "dark"]) {
  test(`shared session creation and group addition at ${width}px ${theme}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 950 });
    await fixture(page, "ADMIN", theme);
    const groups = ["a", "b", "c"].map(id => ({ id, name: `Groupe ${id.toUpperCase()}`, description: "", isGeneral: false, color: "#be9af5", memberIds: ["fixture-account"] }));
    let poll: Poll = { id: "shared", groupId: "a", groupIds: ["a", "b"], groups: groups.slice(0, 2), authorId: "fixture-account", question: "Séance commune", type: "SESSION", status: "OPEN", singleChoice: true,
      options: [{ id: "h1", label: "Horaire 1", capacity: 10, startsAt: "2099-01-01T10:00:00Z" }, { id: "h2", label: "Horaire 2", capacity: 10, startsAt: "2099-01-02T10:00:00Z" }],
      votes: Array.from({ length: 8 }, (_, index) => ({ userId: `student-${index}`, optionIds: ["h1"] })) };
    let added = 0, created = 0, removed = 0;
    await page.route("**/api/v1/groups", route => route.fulfill({ json: groups }));
    await page.route("**/api/v1/polls?*", route => route.fulfill({ json: { items: [poll], nextCursor: null } }));
    await page.route("**/api/v1/groups/a/polls", route => {
      expect(route.request().postDataJSON()).toEqual(expect.objectContaining({ groupIds: ["a", "b"], capacities: [10] }));
      created++; return route.fulfill({ status: 201, json: poll });
    });
    await page.route("**/api/v1/polls/shared/groups", route => {
      expect(route.request().postDataJSON()).toEqual({ groupIds: ["c"] }); added++;
      poll = { ...poll, groupIds: ["a", "b", "c"], groups }; return route.fulfill({ status: 201, json: poll });
    });
    await page.route("**/api/v1/polls/shared/options/h1", route => {
      removed++; poll = { ...poll, options: [poll.options[1]!], votes: [] }; return route.fulfill({ json: poll });
    });
    await page.goto("/admin/polls");
    await expect(page.getByText("Groupe A · Groupe B", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Créer un sondage de séance", exact: true }).click();
    const editor = page.getByRole("dialog");
    await editor.getByRole("checkbox", { name: "Groupe A" }).check();
    await editor.getByRole("checkbox", { name: "Groupe B" }).check();
    await editor.getByLabel("Titre", { exact: true }).fill("Séance commune");
    await editor.getByLabel("Date et heure", { exact: true }).fill("2099-01-01T11:00");
    await editor.getByLabel("Nombre maximal de participants").fill("10");
    expect(await editor.evaluate(node => node.scrollWidth - node.clientWidth)).toBeLessThanOrEqual(1);
    await editor.screenshot({ path: test.info().outputPath("shared-creation.png") });
    await editor.getByRole("button", { name: "Publier le sondage de séance", exact: true }).click();
    await expect(editor).toHaveCount(0); expect(created).toBe(1);
    await page.getByRole("button", { name: "Gérer la séance : Séance commune", exact: true }).click();
    const management = page.getByRole("dialog");
    await management.getByRole("checkbox", { name: "Groupe C" }).check();
    await management.getByRole("button", { name: "Ajouter les groupes sélectionnés" }).click();
    await expect(management.getByText("Groupes concernés : Groupe A · Groupe B · Groupe C")).toBeVisible(); expect(added).toBe(1);
    await management.getByRole("button", { name: "Retirer le créneau : Horaire 1", exact: true }).click();
    await expect(management.getByText("8 étudiant(s) concerné(s).")).toBeVisible(); expect(removed).toBe(0);
    expect(await management.evaluate(node => node.scrollWidth - node.clientWidth)).toBeLessThanOrEqual(1);
    await management.screenshot({ path: test.info().outputPath("shared-confirmation.png") });
    await management.getByRole("button", { name: "Confirmer la suppression" }).click();
    await expect(management.getByRole("button", { name: "Retirer le créneau : Horaire 2", exact: true })).toBeDisabled(); expect(removed).toBe(1);
    expect(await page.locator("body").evaluate(node => node.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
  });
}
