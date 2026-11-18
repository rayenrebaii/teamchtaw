import sharp from "sharp";
import { copyFile, mkdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const original = new URL("../../src/assets/chtaw-logo.png", import.meta.url);
const publicLogo = new URL("../public/branding/chtaw-logo.png", import.meta.url);
await mkdir(new URL("../public/branding/", import.meta.url), { recursive: true });
await mkdir(new URL("../public/icons/", import.meta.url), { recursive: true });
await copyFile(original, publicLogo);
const mark = await readFile(new URL("../public/branding/notification-mark.svg", import.meta.url), "utf8");
const foreground = mark.replace(/<svg[^>]*>/, "").replace(/<\/svg>\s*$/, "");
const icon = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512"><rect width="512" height="512" fill="#7C3AED"/>${foreground}</svg>`);

// A compact motion emblem stays legible at notification sizes. The full wordmark
// remains unchanged inside the app. Every launcher/icon pixel is opaque purple.
for (const [name, size] of [
  ["icon-192", 192],
  ["icon-512", 512],
  ["apple-touch-icon", 180],
  ["app-v2-192", 192],
  ["app-v2-512", 512],
  ["apple-touch-v2", 180],
  ["notification-v2-192", 192],
  ["maskable-v2-512", 512],
  ["maskable-512", 512],
]) {
  await sharp(icon)
    .resize(size, size)
    .removeAlpha()
    .png()
    .toFile(fileURLToPath(new URL("../public/icons/" + name + ".png", import.meta.url)));
}
// Android masks badges by alpha: a solid background would become a white disc.
// Use a tighter viewBox than the launcher safe zone so the status-bar mark is legible.
const badge = mark.replace('viewBox="0 0 512 512"', 'viewBox="110 76 288 328"');
await sharp(Buffer.from(badge)).resize(96, 96).png().toFile(fileURLToPath(new URL("../public/icons/notification-badge-v2-96.png", import.meta.url)));
