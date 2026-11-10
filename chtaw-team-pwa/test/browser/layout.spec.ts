import { test, expect } from "@playwright/test";
import { fixture } from "./fixtures";
for (const width of [320, 375, 390, 430, 768, 1024, 1440]) for (const theme of ["light", "dark"]) for (const language of ["fr", "en"]) {
  test("shared layout " + width + " " + theme + " " + language, async ({ browser }) => {
    const measurements: { header: number; sidebar: number; background: string; title: string }[] = [];
    for (const role of ["USER", "ADMIN"] as const) {
      const page = await browser.newPage({ viewport: { width, height: 900 } });
      try {
        await fixture(page, role, theme, language);
        await page.goto(role === "USER" ? "/app/attendance" : "/admin/users");
        await expect(page.locator(".workspace-topbar summary")).toHaveText("mr");
        await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
        await expect(page.locator(".workspace-content h1")).toBeVisible();
        const box = await page.evaluate(() => {
          const header = document.querySelector(".workspace-topbar")!, rail = document.querySelector(".rail")!, title = document.querySelector(".workspace-content h1")!, content = document.querySelector(".workspace-content")!;
          const first = document.querySelector(".stat-card");
          return { header: header.getBoundingClientRect().height, sidebar: rail.getBoundingClientRect().width, background: getComputedStyle(header).backgroundColor, title: getComputedStyle(title).fontSize, headerBottom: header.getBoundingClientRect().bottom, contentTop: content.getBoundingClientRect().top, firstTop: first?.getBoundingClientRect().top, width: document.documentElement.scrollWidth, contentWidth: content.scrollWidth, viewportWidth: content.clientWidth };
        });
        expect(box.width).toBeLessThanOrEqual(width);
        expect(box.contentWidth).toBeLessThanOrEqual(box.viewportWidth + 1);
        expect(box.contentTop).toBeGreaterThanOrEqual(box.headerBottom);
        if (box.firstTop !== undefined) expect(box.firstTop).toBeGreaterThanOrEqual(box.headerBottom);
        measurements.push(box);
        if (width <= 640) {
          const nav = role === "USER" ? page.locator(".rail .mobile-navigation") : page.locator(".admin-mobile-nav");
          await expect(nav).toBeVisible();
          await expect(nav.locator(".nav-item")).toHaveCount(role === "USER" ? 4 : 5);
          const positions = await nav.locator(".nav-item").evaluateAll((items) => items.map((item) => {
            const rect = item.getBoundingClientRect(), icon = item.querySelector("svg")!.getBoundingClientRect();
            return { x: rect.x, right: rect.right, width: rect.width, height: rect.height, icon: icon.width };
          }));
          positions.forEach((item, index) => { expect(item.width).toBeGreaterThanOrEqual(44); expect(item.height).toBeGreaterThanOrEqual(44); expect(item.icon).toBe(23); if (index) expect(item.x).toBeGreaterThanOrEqual(positions[index - 1]!.right); });
          const contentBottom = await page.locator(".workspace-content").evaluate((node) => node.getBoundingClientRect().bottom);
          expect(contentBottom).toBeLessThanOrEqual((await nav.boundingBox())!.y);
          if (role === "ADMIN") {
            await expect(page.locator(".rail")).not.toBeVisible();
            await nav.getByRole("button").click();
            const menu = page.getByRole("navigation", { name: language === "fr" ? "Toutes les sections" : "All sections" });
            await expect(menu.getByRole("link")).toHaveCount(5);
            await expect(menu.locator('a[href="/admin/collaborators"]')).toBeVisible();
            await menu.getByRole("link", { name: language === "fr" ? "Paramètres" : "Settings", exact: true }).click();
            await expect(nav.getByRole("button")).toHaveAttribute("aria-current", "page");
          }
        } else {
          await expect(page.locator(".rail .brand")).toBeVisible();
          await expect(page.locator(".rail nav .nav-item")).toHaveCount(role === "USER" ? 4 : 9);
        }
        if (role === "ADMIN" && [375, 1440].includes(width)) {
          for (const route of ["/app", "/admin/groups", "/admin/polls", "/admin/attendance", "/app/profile", "/app/settings"]) {
            await page.goto(route);
            await expect(page.locator(".workspace-topbar")).toBeVisible();
            await expect(page.locator("html")).toHaveAttribute("lang", language);
            await expect.poll(() => page.locator(".workspace-content").evaluate((node) => node.scrollTop)).toBe(0);
            const overflow = await page.locator(".workspace-content").evaluate((node) => node.scrollWidth - node.clientWidth);
            expect(overflow, route).toBeLessThanOrEqual(1);
          }
          await page.goto("/admin/users");
          await expect(page.locator(".members-stats")).toBeVisible();
          await page.screenshot({ path: test.info().outputPath("admin.png") });
        }
      } finally { await page.close(); }
    }
    expect(measurements[0]!.header).toBe(measurements[1]!.header);
    expect(measurements[0]!.background).toBe(measurements[1]!.background);
    expect(measurements[0]!.title).toBe(measurements[1]!.title);
    if (width > 640) expect(measurements[0]!.sidebar).toBe(measurements[1]!.sidebar);
  });
}
test("navigation resets the content scroll before displaying member statistics", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 700 });
  await fixture(page, "ADMIN", "dark");
  await page.goto("/admin/users");
  await expect(page.locator(".members-stats")).toBeVisible();
  await page.locator(".workspace-content").evaluate((node) => { node.scrollTop = 350; });
  await page.getByRole("button", { name: "Plus", exact: true }).click();
  await page.getByRole("navigation", { name: "Toutes les sections" }).getByRole("link", { name: "Paramètres", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Paramètres", exact: true })).toBeVisible();
  await expect.poll(() => page.locator(".workspace-content").evaluate((node) => node.scrollTop)).toBe(0);
});
