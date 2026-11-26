import { createRequire } from "node:module";
import { mkdir } from "node:fs/promises";
import assert from "node:assert/strict";
const { chromium } = createRequire(new URL("../chtaw-team-pwa/package.json", import.meta.url))(
  "@playwright/test",
);
const base = "http://127.0.0.1:5180";
const output = new URL("../.test-browser-results/showcase/", import.meta.url);
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  for (const width of [375, 1440]) {
    for (const language of ["fr", "en"]) {
      const page = await browser.newPage({
        viewport: { width, height: 960 },
        reducedMotion: "reduce",
      });
      await page.goto(`${base}/?lang=${language}`, { waitUntil: "networkidle" });
      await page.locator("#guide").scrollIntoViewIfNeeded();
      await page.waitForTimeout(250);
      assert.equal(await page.locator("#guide ol > li").count(), 6);
      assert.equal(
        await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
        false,
      );
      assert.equal(
        await page
          .locator("#guide")
          .innerText()
          .then((text) => /chronomètre|personnalisés|performance tracking/i.test(text)),
        false,
      );
      await page.locator("#guide").screenshot({
        path: new URL(`guide-${width}-${language}.png`, output).pathname.replace(/^\/(\w:)/, "$1"),
      });
      await page.locator("#contact").scrollIntoViewIfNeeded();
      const form = page.locator("#contact form");
      await form.locator('button[type="submit"]').click();
      assert.equal(await page.locator("#contact-name").getAttribute("aria-invalid"), "true");
      await page.locator("#contact-name").fill("Website Test");
      await page.locator("#contact-email").fill("visitor@example.test");
      await page.locator("#contact-subject").selectOption("registration");
      await page.locator("#contact-message").fill("A question about registration.");
      let mode = "limited";
      let sends = 0;
      await page.route("**/api/v1/contact", async (route) => {
        sends++;
        if (mode === "offline") return route.abort("failed");
        return route.fulfill({
          status: mode === "limited" ? 429 : 201,
          contentType: "application/json",
          body: JSON.stringify(mode === "limited" ? {} : { received: true }),
        });
      });
      await form.locator('button[type="submit"]').click();
      await page.getByRole("alert").waitFor();
      assert.equal(
        await page.locator("#contact-message").inputValue(),
        "A question about registration.",
      );
      assert.equal(await page.getByRole("status").count(), 0);
      mode = "offline";
      await form.locator('button[type="submit"]').click();
      await page.getByRole("alert").waitFor();
      assert.equal(
        await page.locator("#contact-message").inputValue(),
        "A question about registration.",
      );
      mode = "success";
      await form.locator('button[type="submit"]').click();
      await page.getByRole("status").waitFor();
      assert.equal(sends, 3);
      assert.equal(await page.locator("#contact-message").inputValue(), "");
      await page.locator("#contact").screenshot({
        path: new URL(`contact-${width}-${language}.png`, output).pathname.replace(
          /^\/(\w:)/,
          "$1",
        ),
      });
      await page.close();
    }
  }
  console.log(
    "Browser checks passed: mobile/desktop, FR/EN, validation, HTTP 429, offline, acknowledgement, no horizontal overflow. API responses mocked; no production requests.",
  );
} finally {
  await browser.close();
}
