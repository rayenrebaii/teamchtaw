// Public auth UI checks with business API requests intercepted; no account is used.
const { createRequire } = require('node:module');
const path = require('node:path');
const fs = require('node:fs');
const requirePwa = createRequire(path.resolve(__dirname, '../chtaw-team-pwa/package.json'));
const { chromium, expect } = requirePwa('@playwright/test');
const base = process.argv[2] || 'http://127.0.0.1:3016';
if (!['http://127.0.0.1:3016', 'https://teamchtaw-pwa.vercel.app'].includes(base)) throw Error('Unreviewed destination');
const output = path.resolve(__dirname, '../chtaw-team-pwa/.test-browser-results/auth-video');
fs.mkdirSync(output, { recursive: true });
async function main() {
  const browser = await chromium.launch({channel: 'msedge', headless: true});
  try {
    for (const width of [375, 1440]) for (const theme of ['light', 'dark']) {
      const context = await browser.newContext({viewport: {width, height: 1000}, serviceWorkers: 'block'});
      await context.addInitScript(theme => localStorage.setItem('chtaw-theme', theme), theme);
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.route('**/api/v1/**', route => route.fulfill({status: 401, contentType: 'application/json', body: '{"message":"No session during public UI verification"}'}));
      for (const name of ['login', 'register']) {
        await page.goto(base + '/' + name, {waitUntil: 'domcontentloaded'});
        await page.waitForFunction(() => {
          const video = document.querySelector('video[data-auth-video]');
          return video && video.readyState >= 2 && !video.paused && video.currentTime > 0;
        });
        const video = page.locator('[data-auth-video]');
        expect(await video.evaluate(v => v.autoplay && v.muted && v.loop && v.playsInline)).toBe(true);
        expect(await page.locator('[data-auth-gymnast]').count()).toBe(0);
        expect(await page.locator('.brand-logo:visible').count()).toBe(1);
        const main = await page.locator('.auth-main').boundingBox();
        const bounds = await video.boundingBox();
        expect(bounds.x).toBeCloseTo(main.x, 0);
        expect(bounds.width).toBeCloseTo(main.width, 0);
        expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
        const input = page.locator('.auth-form input').first();
        await input.fill(name === 'login' ? 'visual@example.invalid' : 'Visual');
        await input.focus();
        const start = await input.boundingBox();
        await page.waitForTimeout(650);
        expect(await input.boundingBox()).toEqual(start);
        expect(await input.inputValue()).toBe(name === 'login' ? 'visual@example.invalid' : 'Visual');
        await page.getByRole('button', {name: 'Mettre le fond en pause', exact: true}).click();
        await expect.poll(() => video.evaluate(v => v.paused)).toBe(true);
        await page.getByRole('button', {name: 'Animer le fond', exact: true}).click();
        await expect.poll(() => video.evaluate(v => v.paused)).toBe(false);
        // Use a representative luminous frame for visual review, leaving controls visible.
        await video.evaluate(v => { v.pause(); v.currentTime = 2.2; });
        await page.waitForTimeout(150);
        await page.screenshot({path: path.join(output, `${name}-${theme}-${width}.png`), fullPage: true});
        console.log(JSON.stringify({page: name, theme, width, autoplay: true, confinedToFormPanel: true, stableInput: true, pauseResume: true, overflow: false}));
      }
      await page.emulateMedia({reducedMotion: 'reduce'});
      await expect(page.locator('[data-auth-video]')).toHaveCount(0);
      await expect(page.locator('[data-auth-background] img')).toBeVisible();
      expect(await page.locator('.auth-form').evaluate(e => getComputedStyle(e).animationName)).toBe('none');
      expect(errors).toEqual([]);
      await context.close();
    }
    for (const failure of ['autoplay', 'media']) {
      const context = await browser.newContext({viewport: {width: 375, height: 1000}, serviceWorkers: 'block'});
      if (failure === 'autoplay') await context.addInitScript(() => {
        HTMLMediaElement.prototype.play = () => {
          window.__authPlayBlocked = true;
          return Promise.reject(new DOMException('Playback blocked', 'NotAllowedError'));
        };
      });
      const page = await context.newPage();
      await page.route('**/api/v1/**', route => route.fulfill({status: 401, contentType: 'application/json', body: '{}'}));
      let requested = false;
      if (failure === 'media') await page.route('**/videos/auth-motion.mp4', route => { requested = true; return route.abort(); });
      await page.goto(base + '/login', {waitUntil: 'domcontentloaded'});
      if (failure === 'autoplay') await page.waitForFunction(() => window.__authPlayBlocked);
      else await expect.poll(() => requested).toBe(true);
      await expect(page.locator('[data-auth-video]')).toHaveCount(0);
      await expect(page.locator('[data-auth-background] img')).toBeVisible();
      await expect.poll(() => page.locator('[data-auth-background] img').evaluate(e => e.complete && e.naturalWidth > 0)).toBe(true);
      console.log('Fixed poster fallback passed:', failure);
      await context.close();
    }
  } finally { await browser.close(); }
}
main().catch(error => {console.error(error); process.exitCode = 1;});
