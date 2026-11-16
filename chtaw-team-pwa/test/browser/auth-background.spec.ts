import { test, expect } from "@playwright/test";

test.use({ video: process.env.CHTAW_AUTH_RECORD_VIDEO === "1" ? "on" : "off" });

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => { delete Object.getPrototypeOf(navigator).serviceWorker; });
  await page.routeWebSocket("**/socket.io/**", (socket) => socket.close());
  await page.route("**/api/v1/**", (route) => route.fulfill({
    status: route.request().method() === "OPTIONS" ? 204 : 401,
    headers: { "Access-Control-Allow-Origin": "http://127.0.0.1:3001", "Access-Control-Allow-Credentials": "true", "Access-Control-Allow-Headers": "Content-Type,Authorization,X-Session-Transport", "Access-Control-Allow-Methods": "GET,POST,OPTIONS" },
    json: { message: "Vérification locale : authentification indisponible." },
  }));
});

for (const route of ["login", "register"]) for (const width of [390, 1440]) for (const theme of ["light", "dark"]) {
  test(`${route}: background stays behind unchanged form at ${width}px, ${theme}`, async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.setViewportSize({ width, height: 900 });
    await page.addInitScript((theme) => localStorage.setItem("chtaw-theme", theme), theme);
    await page.goto(`/${route}`);
    const form = page.locator(".auth-form");
    await expect(form).toBeVisible();
    const scene = page.locator("[data-auth-background]");
    await expect(scene).toHaveAttribute("aria-hidden", "true");
    await expect(scene).toHaveCSS("pointer-events", "none");
    await expect.poll(() => scene.locator("img").evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
    const original = await form.boundingBox();
    const baseline = await page.locator(".auth-main").evaluate((node) => {
      const classes = node.className;
      node.setAttribute("class", "auth-main");
      const box = document.querySelector(".auth-form")!.getBoundingClientRect();
      node.setAttribute("class", classes);
      return { x: box.x, y: box.y, width: box.width, height: box.height };
    });
    for (const key of ["x", "y", "width", "height"] as const) expect(original![key]).toBeCloseTo(baseline[key], 0);
    const panel = await page.locator(".auth-main").boundingBox();
    const sceneBox = await scene.boundingBox();
    for (const key of ["x", "y", "width", "height"] as const) expect(sceneBox![key]).toBeCloseTo(panel![key], 0);
    await expect(scene).toHaveCSS("position", "absolute");
    await expect(scene).toHaveCSS("overflow", "hidden");
    await expect(page.locator(".auth-story [data-auth-background]")).toHaveCount(0);
    await expect(page.locator(".auth-story")).toHaveCSS("background-color", "rgb(22, 6, 47)");
    await expect(scene.locator("[data-auth-shape]:visible")).toHaveCount(width <= 800 ? 3 : 4);
    // Observe real animation frames, including inclination and independent shape motion.
    for (const selector of ["[data-auth-gymnast]", "[data-auth-ring]", "[data-auth-shape]"]) {
      const object = scene.locator(selector).first();
      const initial = await object.evaluate(node => getComputedStyle(node).transform);
      await expect.poll(() => object.evaluate(node => getComputedStyle(node).transform)).not.toBe(initial);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(await scene.evaluate((node) => node.getAnimations({ subtree: true }).length)).toBeGreaterThan(0);
    await expect(scene.locator("span[data-mobile-hidden]:visible")).toHaveCount(width <= 800 ? 0 : 5);
    await page.getByRole("button", { name: route === "login" ? "Se connecter" : "Créer mon compte", exact: true }).click();
    await expect(form.getByText("Au moins 12 caractères.", { exact: true }).first()).toBeVisible();
    await page.screenshot({ path: `.test-browser-results/auth-background-${route}-${theme}-${width}-validation.png`, fullPage: true });
    await page.locator('input[type="email"]').fill("preview@example.invalid");
    await page.locator("#auth-password").fill("Preview-only-password-2026!");
    await page.getByRole("button", { name: "Afficher le mot de passe", exact: true }).first().click();
    await expect(page.locator("#auth-password")).toHaveAttribute("type", "text");
    await expect(page.locator("#auth-password")).toHaveValue("Preview-only-password-2026!");
    await page.getByRole("button", { name: "Masquer le mot de passe", exact: true }).first().click();
    if (route === "register") {
      await page.getByLabel("Prénom", { exact: false }).fill("Nadia");
      await page.locator('input[name="lastName"]').fill("Preview");
      await page.locator("#auth-confirm").fill("Preview-only-password-2026!");
      await page.getByRole("button", { name: "Afficher le mot de passe", exact: true }).nth(1).click();
      await expect(page.locator("#auth-confirm")).toHaveAttribute("type", "text");
      await page.getByRole("button", { name: "Masquer le mot de passe", exact: true }).click();
    } else await page.getByRole("checkbox", { name: "Rester connecté" }).check();
    await page.getByRole("button", { name: route === "login" ? "Se connecter" : "Créer mon compte", exact: true }).click();
    await expect(page.getByText("Vérification locale : authentification indisponible.", { exact: true }).last()).toBeVisible();
    await page.screenshot({ path: `.test-browser-results/auth-background-${route}-${theme}-${width}.png`, fullPage: true });
    if (width === 390) {
      // Simulate the viewport shrinking when the mobile keyboard opens, while retaining focus.
      await page.setViewportSize({ width, height: 420 });
      const target = page.locator(route === "register" ? "#auth-confirm" : "#auth-password");
      await target.focus();
      await target.scrollIntoViewIfNeeded();
      await expect(target).toBeFocused();
      const box = await target.boundingBox();
      expect(box!.y).toBeGreaterThanOrEqual(0);
      expect(box!.y + box!.height).toBeLessThanOrEqual(420);
      expect(await target.evaluate((node) => {
        const r = node.getBoundingClientRect();
        return document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2) === node;
      })).toBe(true);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.screenshot({ path: `.test-browser-results/auth-background-${route}-${theme}-keyboard-390.png`, fullPage: true });
    }
    expect(errors).toEqual([]);
    const destination = route === "login" ? "/register" : "/login";
    await page.locator(`.auth-form a[href="${destination}"]`).click();
    await expect(page).toHaveURL(new RegExp(`${destination}$`));
  });
}

for (const route of ["login", "register"]) test(`${route}: reduced motion is static at 320px`, async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(`/${route}`);
  await expect(page.locator(".auth-form")).toBeVisible();
  expect(await page.locator("[data-auth-background]").evaluate((node) => node.getAnimations({ subtree: true }).length)).toBe(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: `.test-browser-results/auth-background-${route}-reduced-320.png`, fullPage: true });
});
