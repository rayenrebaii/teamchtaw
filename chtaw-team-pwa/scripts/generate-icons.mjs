import sharp from "sharp";
import { copyFile, mkdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const original = new URL("../../src/assets/chtaw-logo.png", import.meta.url);
const publicLogo = new URL("../public/branding/chtaw-logo.png", import.meta.url);
await mkdir(new URL("../public/branding/", import.meta.url), { recursive: true });
await mkdir(new URL("../public/icons/", import.meta.url), { recursive: true });
await copyFile(original, publicLogo);
const logo = await readFile(original);
const background = "#16062f";

// Preserve the complete supplied logo; pad to square instead of cropping it.
for (const [name, size] of [
  ["icon-192", 192],
  ["icon-512", 512],
  ["apple-touch-icon", 180],
]) {
  await sharp(logo)
    .resize(size, size, { fit: "contain", background })
    .png()
    .toFile(fileURLToPath(new URL("../public/icons/" + name + ".png", import.meta.url)));
}
const inset = await sharp(logo).resize(344, 344, { fit: "contain", background }).png().toBuffer();
await sharp({ create: { width: 512, height: 512, channels: 4, background } })
  .composite([{ input: inset, left: 84, top: 84 }])
  .png()
  .toFile(fileURLToPath(new URL("../public/icons/maskable-512.png", import.meta.url)));
await copyFile(
  new URL("../public/icons/icon-192.png", import.meta.url),
  new URL("../../public/team-chtaw-icon.png", import.meta.url),
);
