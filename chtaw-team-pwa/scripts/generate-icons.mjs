import sharp from "sharp";
import { copyFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const original = new URL("../../src/assets/chtaw-logo.png", import.meta.url);
const publicLogo = new URL("../public/branding/chtaw-logo.png", import.meta.url);
await mkdir(new URL("../public/branding/", import.meta.url), { recursive: true });
await mkdir(new URL("../public/icons/", import.meta.url), { recursive: true });
await copyFile(original, publicLogo);
const originalPath = fileURLToPath(original);
const background = "#16062f";

// Use the official full logo for every public icon, including legacy URLs.
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
  ["app-v3-192", 192],
  ["app-v3-512", 512],
  ["apple-touch-v3", 180],
  ["notification-v3-192", 192],
  ["maskable-v3-512", 512],
]) {
  // A square of side 56% fits entirely inside Android's safe circle.
  const inset = Math.round(size * (name.startsWith("maskable") ? 0.22 : 0.06));
  await sharp(originalPath)
    .resize(size - inset * 2, size - inset * 2, { fit: "contain", background })
    .flatten({ background })
    .extend({ top: inset, bottom: inset, left: inset, right: inset, background })
    .removeAlpha()
    .png()
    .toFile(fileURLToPath(new URL("../public/icons/" + name + ".png", import.meta.url)));
}
// Android badges use only alpha: derive the silhouette from the official logo.
const alpha = await sharp(originalPath)
  .resize(84, 84, { fit: "contain", background: "#00000000" })
  .extend({ top: 6, bottom: 6, left: 6, right: 6, background: "#00000000" })
  .ensureAlpha().extractChannel("alpha").raw().toBuffer();
for (const version of ["v2", "v3"]) {
  await sharp({ create: { width: 96, height: 96, channels: 3, background: "#ffffff" } })
    .joinChannel(alpha, { raw: { width: 96, height: 96, channels: 1 } })
    .png().toFile(fileURLToPath(new URL(`../public/icons/notification-badge-${version}-96.png`, import.meta.url)));
}
