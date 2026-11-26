import { createRequire } from "node:module";
import assert from "node:assert/strict";
const { chromium } = createRequire(new URL("../chtaw-team-pwa/package.json", import.meta.url))(
  "@playwright/test",
);
const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  for (const [url, selector] of [
    ["http://127.0.0.1:5180", "[data-brand-video]"],
    ["http://127.0.0.1:5181/login", "[data-auth-video]"],
    ["http://127.0.0.1:5181/register", "[data-auth-video]"],
  ]) {
    const page = await browser.newPage({ reducedMotion: "no-preference" });
    await page.route("http://127.0.0.1:1/**", (route) => route.abort());
    await page.goto(url, { waitUntil: "networkidle" });
    const video = page.locator(selector);
    await video.scrollIntoViewIfNeeded();
    await page.waitForFunction((selector) => {
      const video = document.querySelector(selector);
      return video && video.readyState >= 2 && !video.paused && Number.isFinite(video.duration);
    }, selector);
    assert.deepEqual(
      await video.evaluate((element) => [
        element.autoplay,
        element.muted,
        element.loop,
        element.playsInline,
        element.controls,
      ]),
      [true, true, true, true, false],
    );
    await video.evaluate((element) => {
      element.currentTime = element.duration - 0.3;
    });
    await page.waitForFunction(
      (selector) => {
        const video = document.querySelector(selector);
        return video && !video.paused && video.currentTime < 2;
      },
      selector,
      { timeout: 10000 },
    );
    assert.equal(await page.getByRole("button", { name: /pause|stop|animer le fond/i }).count(), 0);
    console.log(
      `Autoplay and real end-to-start looping verified: ${new URL(url).pathname || "/"} (${new URL(url).port}).`,
    );
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.waitForFunction((selector) => !document.querySelector(selector), selector);
    await page.close();
  }
} finally {
  await browser.close();
}
