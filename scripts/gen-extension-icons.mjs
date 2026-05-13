/**
 * Resize `scripts/wave-icon-source.png` to extension icon sizes + favicons.
 * Run from repo root: node scripts/gen-extension-icons.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import pngToIco from 'png-to-ico';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const src = path.join(__dirname, 'wave-icon-source.png');
const iconsDir = path.join(root, 'apps/extension/icons');
const extRoot = path.join(root, 'apps/extension');
const desktopPublic = path.join(root, 'apps/desktop/public');

if (!fs.existsSync(src)) {
  console.error('Missing', src, '— add a square master PNG first.');
  process.exit(1);
}

const base512 = sharp(src).resize(512, 512, { fit: 'cover' });

const sizes = [16, 32, 48, 128];
for (const size of sizes) {
  const out = path.join(iconsDir, `icon${size}.png`);
  await base512.clone().resize(size, size).png({ compressionLevel: 9 }).toFile(out);
  const st = fs.statSync(out);
  console.log('wrote', path.relative(root, out), st.size, 'bytes');
}

const icon32Buf = await base512.clone().resize(32, 32).png({ compressionLevel: 9 }).toBuffer();
const icoBuf = await pngToIco([icon32Buf]);
const extFav = path.join(extRoot, 'favicon.ico');
fs.writeFileSync(extFav, icoBuf);
console.log('wrote', path.relative(root, extFav), fs.statSync(extFav).size, 'bytes');

if (!fs.existsSync(desktopPublic)) fs.mkdirSync(desktopPublic, { recursive: true });
const deskFav = path.join(desktopPublic, 'favicon.ico');
fs.writeFileSync(deskFav, icoBuf);
console.log('wrote', path.relative(root, deskFav), fs.statSync(deskFav).size, 'bytes');
