import { createRequire } from "node:module";
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
const { chromium } = createRequire(new URL("../chtaw-team-pwa/package.json", import.meta.url))(
  "@playwright/test",
);
const base = process.argv[2] || "http://127.0.0.1:5180";
const output = new URL("../.test-browser-results/footer-links/", import.meta.url);
await mkdir(output, { recursive: true });
const expected = [
  ["Instagram", "https://www.instagram.com/team_chtaw?cnvx=MTUzdTEwNGxrem9weg=="],
  ["Facebook", "https://www.facebook.com/share/1DiWKmqis9/"],
  ["TikTok", "https://www.tiktok.com/@youssef_chtioui28?_r=1&_t=ZS-9BjIUNlqIfE"],
  ["YouTube", "https://youtube.com/@youssef_chtioui28?si=yP2uycrcFWSvWY1R"],
];
const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  for (const width of [390, 1440])
    for (const language of ["fr", "en"]) {
      const page = await browser.newPage({
        viewport: { width, height: 1000 },
        reducedMotion: "reduce",
      });
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.goto(`${base}/?lang=${language}`, { waitUntil: "networkidle" });
      const footer = page.getByRole("contentinfo");
      await footer.scrollIntoViewIfNeeded();
      await page.waitForFunction(
        (language) => document.documentElement.lang === language,
        language,
      );
      for (const [name, href] of expected) {
        const link = footer.getByRole("link", { name: new RegExp(name) });
        assert.equal(await link.getAttribute("href"), href);
        assert.equal(await link.getAttribute("target"), "_blank");
        assert.ok((await link.getAttribute("rel")).includes("noopener"));
        assert.equal(await link.locator("svg").count(), 1);
        const bounds = await link.boundingBox();
        assert.ok(bounds.width >= 44 && bounds.height >= 44);
        await link.focus();
        assert.equal(await link.evaluate((element) => element === document.activeElement), true);
      }
      assert.equal(
        await footer.getByRole("link", { name: "Teamchtaw@gmail.com" }).getAttribute("href"),
        "mailto:Teamchtaw@gmail.com",
      );
      assert.equal(
        await footer.getByRole("link", { name: "+216 56 322 399" }).getAttribute("href"),
        "tel:+21656322399",
      );
      assert.equal(
        await footer
          .getByRole("navigation", { name: language === "fr" ? "Réseaux sociaux" : "Social media" })
          .count(),
        1,
      );
      assert.equal(
        await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
        false,
      );
      await footer.screenshot({
        path: fileURLToPath(new URL(`footer-${width}-${language}.png`, output)),
      });
      assert.deepEqual(errors, []);
      await page.close();
      console.log(
        JSON.stringify({
          base,
          width,
          language,
          fourSocialLinks: true,
          emailAndPhone: true,
          keyboardFocus: true,
          noOverflow: true,
        }),
      );
    }
} finally {
  await browser.close();
}
