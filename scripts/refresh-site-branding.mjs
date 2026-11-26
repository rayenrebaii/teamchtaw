// Derive every public icon from the approved Team Chtaw logo.
import { createRequire } from "node:module";
const sharp = createRequire(new URL("../chtaw-team-pwa/package.json", import.meta.url))("sharp");
import { writeFile, readFile } from "node:fs/promises";
const source = new URL("../src/assets/team-chtaw-logo.png", import.meta.url);
const input = await readFile(source);
const sizes = [16, 32, 48];
const images = [];
for (const size of [...sizes, 192]) {
  const png = await sharp(input)
    .resize(size, size, { fit: "contain", background: "#100322" })
    .png()
    .toBuffer();
  await writeFile(
    new URL(
      `../public/${size === 192 ? "favicon.png" : `favicon-${size}x${size}.png`}`,
      import.meta.url,
    ),
    png,
  );
  if (size !== 192) images.push(png);
  else await writeFile(new URL("../public/team-chtaw-icon.png", import.meta.url), png);
}
const header = Buffer.alloc(6 + 16 * images.length);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(images.length, 4);
let offset = header.length;
images.forEach((png, index) => {
  const entry = 6 + index * 16;
  header[entry] = sizes[index];
  header[entry + 1] = sizes[index];
  header.writeUInt16LE(1, entry + 4);
  header.writeUInt16LE(32, entry + 6);
  header.writeUInt32LE(png.length, entry + 8);
  header.writeUInt32LE(offset, entry + 12);
  offset += png.length;
});
await writeFile(
  new URL("../public/favicon.ico", import.meta.url),
  Buffer.concat([header, ...images]),
);
