// Public assets only. No account, credentials, push subscription or notification is used.
const fs = require('node:fs/promises');
const path = require('node:path');
const assert = require('node:assert/strict');
const { createRequire } = require('node:module');
const root = path.resolve(__dirname, '../chtaw-team-pwa');
const sharp = createRequire(path.join(root, 'package.json'))('sharp');
const published = process.argv[2] === 'production';
async function asset(name) {
  const bytes = await fs.readFile(path.join(root, 'public', name));
  if (published) {
    const response = await fetch('https://teamchtaw-pwa.vercel.app/' + name, { cache: 'no-store', signal: AbortSignal.timeout(30000) });
    assert.equal(response.status, 200, 'Public asset missing: ' + name);
    const actual = Buffer.from(await response.arrayBuffer());
    if (name.endsWith('.png')) assert.ok(actual.equals(bytes), 'Published image differs: ' + name);
    else assert.equal(actual.toString('utf8').replaceAll('\r\n', '\n'), bytes.toString('utf8').replaceAll('\r\n', '\n'), 'Published text differs: ' + name);
    return actual;
  }
  return bytes;
}
async function main() {
  const manifest = JSON.parse((await asset('manifest.webmanifest')).toString());
  const paths = new Set([...manifest.icons.map(icon => icon.src.slice(1)), 'icons/apple-touch-v2.png', 'icons/notification-v2-192.png']);
  for (const name of paths) {
    const bytes = await asset(name);
    const { data, info } = await sharp(bytes).raw().toBuffer({ resolveWithObject: true });
    assert.equal(info.channels, 3, 'Main icons must be opaque RGB.');
    const declared = manifest.icons.find(icon => icon.src === '/' + name);
    if (declared) assert.equal(declared.sizes, `${info.width}x${info.height}`);
    for (const pixel of [0, info.width - 1, (info.height - 1) * info.width, info.width * info.height - 1]) {
      assert.deepEqual([...data.subarray(pixel * 3, pixel * 3 + 3)], [124, 58, 237], 'Icon corner must be purple.');
    }
    if (name.includes('maskable')) for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) {
      const i = (y * info.width + x) * 3;
      if (data[i] > 200 && data[i + 1] > 200 && data[i + 2] > 200)
        assert.ok(Math.hypot(x - (info.width - 1) / 2, y - (info.height - 1) / 2) <= info.width * .4, 'White mark outside Android safe circle.');
    }
  }
  const { data, info } = await sharp(await asset('icons/notification-badge-v2-96.png')).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  assert.equal(info.width, 96); assert.equal(info.height, 96);
  let ink = 0;
  for (let i = 0; i < data.length; i += 4) if (data[i + 3]) { ink++; assert.deepEqual([...data.subarray(i, i + 3)], [255, 255, 255], 'Badge must use white ink.'); }
  assert.ok(ink > 1000 && ink < 96 * 96 / 2, 'Badge must be legible and have transparent space.');
  for (const pixel of [0, 95, 95 * 96, 96 * 96 - 1]) assert.equal(data[pixel * 4 + 3], 0, 'Badge corner must be transparent.');
  const worker = (await asset('sw.js')).toString();
  assert.ok(worker.includes('chtaw-public-v10'));
  assert.ok(worker.includes('icon: "/icons/notification-v2-192.png", badge: "/icons/notification-badge-v2-96.png"'));
  console.log(JSON.stringify({ destination: published ? 'production public assets' : 'local assets', opaquePurpleIcons: paths.size, badgeInkPixels: ink, monochromeTransparentBadge: true, maskableSafeZone: true, worker: 'v10' }));
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
