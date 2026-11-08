import { test, expect } from "@playwright/test";
import { fixture } from "./fixtures";

for (const width of [320, 360, 375, 390, 430, 768, 1024, 1440, 1920]) {
  for (const theme of ["light", "dark"]) {
    test(`members remain usable at ${width}px in ${theme}`, async ({ page }) => {
      await page.setViewportSize({ width, height: 1000 });
      await fixture(page, "ADMIN", theme);
      // Stress content is isolated to intercepted test responses, never application data.
      await page.route("**/api/v1/users?*", (route) => route.fulfill({ json: {
        items: ["APPROVED", "PENDING", "REJECTED"].map((status, index) => ({
          id: `member-${index}`, firstName: "Alexandrine-Charlotte", lastName: "BenAbdallah-Delacroix",
          email: `${"long-email-address".repeat(5)}@example.invalid`, role: "USER", status,
          joinedAt: "2026-11-01T10:00:00Z", bio: "",
        })), nextCursor: null,
      } }));
      await page.goto("/admin/users");
      const region = page.getByRole("region", { name: "Liste des membres" });
      await expect(region.getByRole("button", { name: "Consulter", exact: true })).toHaveCount(4);
      const geometry = await region.evaluate((node) => {
        const content = document.querySelector(".workspace-content")!;
        const rows = [...node.querySelectorAll("tbody tr")];
        return {
          overflow: content.scrollWidth - content.clientWidth,
          tableOverflow: node.scrollWidth - node.clientWidth,
          layout: rows.map((row) => getComputedStyle(row).display),
          buttonsFit: [...node.querySelectorAll("button")].every((button) => {
            const box = button.getBoundingClientRect(), parent = button.closest("td")!.getBoundingClientRect();
            return box.left >= parent.left - 1 && box.right <= parent.right + 1 && button.scrollWidth <= button.clientWidth + 1;
          }),
        };
      });
      expect(geometry.overflow).toBeLessThanOrEqual(1);
      expect(geometry.tableOverflow).toBeLessThanOrEqual(1);
      expect(geometry.buttonsFit).toBe(true);
      expect(await region.locator("button").evaluateAll((buttons) => buttons.every((button) => !!button.querySelector('svg[aria-hidden="true"]')))).toBe(true);
      await expect(region.getByRole("button", { name: "Bannir", exact: true })).toHaveCount(1);
      expect(geometry.layout).toEqual(Array(4).fill(width <= 1024 ? "grid" : "table-row"));
      if (width <= 640) {
        const tabs = page.getByRole("tablist", { name: "Statut des membres" });
        const hint = tabs.locator("..").locator(":scope > span");
        await expect(hint).toBeVisible();
        expect(await tabs.evaluate((node) => getComputedStyle(node).scrollbarWidth)).toBe("none");
        const tabGeometry = await tabs.getByRole("tab").evaluateAll((nodes) => nodes.map((node) => ({
          top: node.getBoundingClientRect().top, width: node.clientWidth, content: node.scrollWidth,
        })));
        expect(new Set(tabGeometry.map((tab) => tab.top)).size).toBe(1);
        tabGeometry.forEach((tab) => expect(tab.content).toBeLessThanOrEqual(tab.width + 1));
        await tabs.evaluate((node) => node.scrollTo({ left: node.scrollWidth, behavior: "instant" }));
        await expect(hint).toHaveCount(0);
        await expect(tabs.getByRole("tab").last()).toBeInViewport();
        await tabs.getByRole("tab").last().focus();
        await page.keyboard.press("Home");
        await expect(tabs.getByRole("tab").first()).toBeFocused();
        await expect(tabs.getByRole("tab").first()).toHaveAttribute("aria-selected", "true");
        const cards = await region.locator("tbody tr").evaluateAll((rows) => rows.map((row) => {
          const cells = row.querySelectorAll("td");
          const buttons = [...cells[4]!.querySelectorAll("button")].map((node) => node.getBoundingClientRect());
          const [identity, date, status, groups, actions] = [...cells].map((node) => node.getBoundingClientRect());
          const labels = [...row.querySelectorAll("td > span[aria-hidden]")];
          return {
            ordered: identity!.bottom <= status!.top && status!.bottom <= date!.top && status!.bottom <= groups!.top &&
              Math.max(date!.bottom, groups!.bottom) < actions!.top,
            iconsVisible: labels.length === 2 && labels.every((node) => getComputedStyle(node).display === "flex" && !!node.querySelector("svg")),
            twoColumns: buttons[0]!.top === buttons[1]!.top && buttons[0]!.right < buttons[1]!.left,
            lastFullWidth: buttons.length !== 3 || (buttons[2]!.top >= buttons[0]!.bottom && Math.abs(buttons[2]!.width - actions!.width) < 1),
            sameHeight: buttons.every((button) => Math.abs(button.height - buttons[0]!.height) < 1),
          };
        }));
        for (const card of cards) {
          expect(card).toEqual({ ordered: true, iconsVisible: true, twoColumns: true, lastFullWidth: true, sameHeight: true });
        }
      }
      await region.getByRole("button", { name: "Refuser", exact: true }).click();
      await expect(page.getByRole("dialog", { name: "Refuser cette demande ?" })).toBeVisible();
      await page.getByRole("button", { name: "Annuler", exact: true }).click();
      await expect(page.getByRole("dialog")).toHaveCount(0);
      await region.getByRole("button", { name: "Bannir", exact: true }).click();
      await expect(page.getByRole("dialog", { name: "Bannir et supprimer ce compte ?" })).toBeVisible();
      await page.getByRole("button", { name: "Annuler", exact: true }).click();
      await expect(page.getByRole("dialog")).toHaveCount(0);
      await region.getByRole("button", { name: "Affecter à un groupe", exact: true }).first().click();
      await expect(page.getByRole("dialog")).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(page.getByRole("dialog")).toHaveCount(0);
      if ([320, 430, 768, 1440].includes(width)) {
        await region.screenshot({ path: test.info().outputPath("members.png") });
      }
    });
  }
}
