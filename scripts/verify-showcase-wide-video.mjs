import { createRequire } from "node:module";
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
const { chromium } = createRequire(new URL("../chtaw-team-pwa/package.json", import.meta.url))(
  "@playwright/test",
);
const base = process.argv[2] || "http://127.0.0.1:5180";
const output = new URL("../.test-browser-results/wide-video/", import.meta.url);
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  for (const width of [390, 1440]) {
    const page = await browser.newPage({
      viewport: { width, height: 1000 },
      reducedMotion: "no-preference",
    });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(base + "/?lang=fr", { waitUntil: "networkidle" });
    const video = page.locator("[data-brand-video]");
    await video.scrollIntoViewIfNeeded();
    await page.waitForFunction(() => {
      const video = document.querySelector("[data-brand-video]");
      return (
        video &&
        video.videoWidth === 1920 &&
        video.videoHeight === 480 &&
        !video.paused &&
        video.readyState >= 2
      );
    });
    const framing = await video.evaluate((video) => {
      const bounds = video.getBoundingClientRect();
      const parent = video.parentElement.getBoundingClientRect();
      const scale = Math.max(bounds.width / video.videoWidth, bounds.height / video.videoHeight);
      return {
        fit: getComputedStyle(video).objectFit,
        ratio: parent.width / parent.height,
        fillsFrame:
          Math.abs(bounds.width - parent.width) < 3 && Math.abs(bounds.height - parent.height) < 3,
        visibleSourceWidth: bounds.width / scale,
        controls: video.controls,
        muted: video.muted,
        loop: video.loop,
      };
    });
    assert.equal(framing.fit, "cover");
    assert.equal(framing.fillsFrame, true);
    assert.ok(framing.visibleSourceWidth >= 480, "The entire centered logo must fit on mobile.");
    assert.ok(Math.abs(framing.ratio - (width < 640 ? 16 / 9 : 4)) < 0.04);
    assert.deepEqual([framing.controls, framing.muted, framing.loop], [false, true, true]);
    await video.evaluate((video) => {
      video.currentTime = video.duration - 0.2;
    });
    await page.waitForFunction(() => {
      const video = document.querySelector("[data-brand-video]");
      return video && !video.paused && video.currentTime < 2;
    });
    await video.evaluate((video) => {
      video.pause();
      video.currentTime = 4.2;
    });
    await page.waitForTimeout(150);
    await video
      .locator("..")
      .screenshot({ path: fileURLToPath(new URL(`banner-${width}.png`, output)) });
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
      false,
    );
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.waitForFunction(() => !document.querySelector("[data-brand-video]"));
    assert.ok(
      (await page.locator('#guide img[src*="chtaw-motion-wide-v1.webp"]').getAttribute("src"))
        ?.length,
    );
    assert.deepEqual(errors, []);
    await page.close();
    console.log(
      JSON.stringify({
        base,
        width,
        horizontalVideo: "1920x480",
        frameFilled: true,
        entireLogoFits: true,
        looping: true,
        posterFallback: true,
      }),
    );
  }
} finally {
  await browser.close();
}
