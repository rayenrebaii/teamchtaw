import { test, expect } from "@playwright/test";
import { fixture } from "./fixtures";
for (const width of [320, 375, 390, 430]) for (const theme of ["light", "dark"]) {
  test("student mobile " + width + "px " + theme, async ({ page }) => {
    await page.setViewportSize({ width, height: 812 });
    await fixture(page, "USER", theme);
    await page.goto("/app");
    const nav = page.locator(".student-workspace .rail nav");
    await expect(nav.getByRole("link")).toHaveCount(4);
    await expect(nav.getByRole("link", { name: "Conversations" })).toHaveAttribute("aria-current", "page");
    await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
    const layout = await page.evaluate(() => {
      const rail = document.querySelector(".student-workspace .rail")!, nav = rail.querySelector("nav")!, content = document.querySelector(".workspace-content")!;
      const luminance = (color: string) => {
        const parts = color.match(/[\d.]+/g)!.slice(0, 3).map(Number).map((value) => { const s = value / 255; return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; });
        return parts[0]! * 0.2126 + parts[1]! * 0.7152 + parts[2]! * 0.0722;
      };
      const barColor = getComputedStyle(rail).backgroundColor;
      return { viewport: innerWidth, pageWidth: document.documentElement.scrollWidth, contentBottom: content.getBoundingClientRect().bottom, barTop: rail.getBoundingClientRect().top,
        links: [...nav.querySelectorAll("a")].map((link) => {
          const rect = link.getBoundingClientRect(), icon = link.querySelector("svg")!, iconRect = icon.getBoundingClientRect(), text = link.querySelector("span")!.getBoundingClientRect(), style = getComputedStyle(link), iconStyle = getComputedStyle(icon);
          const background = style.backgroundColor === "rgba(0, 0, 0, 0)" ? barColor : style.backgroundColor;
          const ink = luminance(style.color), bg = luminance(background);
          return { x: rect.x, width: rect.width, height: rect.height, iconWidth: iconRect.width, iconHeight: iconRect.height, iconCenter: iconRect.x + iconRect.width / 2, center: rect.x + rect.width / 2, iconBottom: iconRect.bottom, textTop: text.top, stroke: iconStyle.strokeWidth, iconColor: iconStyle.color, color: style.color, contrast: (Math.max(ink, bg) + 0.05) / (Math.min(ink, bg) + 0.05), before: getComputedStyle(link, "::before").content, after: getComputedStyle(link, "::after").content, shadow: style.boxShadow };
        }) };
    });
    expect(layout.pageWidth).toBeLessThanOrEqual(width);
    expect(layout.contentBottom).toBeLessThanOrEqual(layout.barTop + 1);
    layout.links.forEach((link, index) => {
      expect(link.width).toBeGreaterThanOrEqual(44); expect(link.height).toBeGreaterThanOrEqual(44);
      expect(link.iconWidth).toBe(23); expect(link.iconHeight).toBe(23);
      expect(link.stroke).toBe("2.25px"); expect(link.iconColor).toBe(link.color);
      expect(Math.abs(link.iconCenter - link.center)).toBeLessThanOrEqual(1);
      expect(link.iconBottom).toBeLessThanOrEqual(link.textTop);
      expect(link.contrast).toBeGreaterThanOrEqual(4.5);
      expect(["none", "normal"]).toContain(link.before); expect(["none", "normal"]).toContain(link.after);
      expect(link.shadow).toBe("none");
      if (index) expect(link.x).toBeGreaterThanOrEqual(layout.links[index - 1]!.x + layout.links[index - 1]!.width);
    });
    await page.screenshot({ path: test.info().outputPath("navigation.png") });
    await nav.getByRole("link", { name: "Mon profil" }).click();
    await expect(page).toHaveURL(/\/app\/profile$/);
    await expect(nav.getByRole("link", { name: "Mon profil" })).toHaveAttribute("aria-current", "page");
  });
}
for (const role of ["ADMIN", "USER"] as const) for (const width of [375, 1440]) {
  test("compact header " + role + " " + width, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 }); await fixture(page, role, "dark");
    await page.goto(role === "ADMIN" ? "/admin/users" : "/app");
    const header = page.locator(".workspace-topbar");
    await expect(header.locator("summary")).toHaveText("mr");
    await expect(header.locator(".brand-logo")).toBeVisible();
    await expect(header.getByRole("button", { name: /Notifications/ })).toBeVisible();
    await expect(header).not.toContainText("Mohamed Rami");
    await header.locator("summary").click();
    await expect(header.getByRole("link", { name: "Mon profil" })).toBeVisible();
    await expect(header.getByRole("link", { name: "Paramètres" })).toBeVisible();
    await expect(header.getByRole("button", { name: "Déconnexion" })).toBeVisible();
    await page.screenshot({ path: test.info().outputPath("header.png") });
  });
}
test("admin English pages and compact More navigation", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 }); await fixture(page, "ADMIN", "light", "en");
  await page.goto("/admin/users"); await expect(page.getByRole("heading", { name: "Member management" })).toBeVisible();
  await expect(page.getByRole("cell", { name: "Mohamed Rami fixture@example.invalid" })).toBeVisible();
  await page.getByRole("button", { name: "More", exact: true }).click();
  const menu = page.getByRole("navigation", { name: "All sections" }); await expect(menu.getByRole("link")).toHaveCount(4);
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await page.locator(".admin-mobile-nav").getByRole("link", { name: "Groups", exact: true }).click();
  await expect(page.getByRole("heading", { name: "A community for everyone." })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Nom métier conservé" })).toBeVisible();
  await page.getByLabel("Search groups").fill("no-matching-group");
  await expect(page.getByRole("heading", { name: "No groups found." })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Nom métier conservé" })).toHaveCount(0);
  await page.getByLabel("Search groups").fill("");
  await expect(page.getByRole("heading", { name: "Nom métier conservé" })).toBeVisible();
  await page.getByRole("button", { name: "More", exact: true }).click();
  await menu.getByRole("link", { name: "Settings", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Settings", exact: true })).toBeVisible();
  await expect(page.getByLabel("Choose a theme")).toHaveValue("light");
  await page.getByLabel("Choose a theme").selectOption("dark");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.getByLabel("Session reminders")).toHaveCount(0);
  await page.getByLabel("Choose a language").selectOption("fr");
  await expect(page.getByRole("heading", { name: "Paramètres", exact: true })).toBeVisible();
  await page.reload(); await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.getByRole("heading", { name: "Paramètres", exact: true })).toBeVisible();
});
