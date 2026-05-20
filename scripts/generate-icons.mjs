import sharp from "sharp";
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, "../public/icons");
mkdirSync(outDir, { recursive: true });

// Atlas lightning-bolt icon — dark background, white Zap shape
// Points derived from Lucide Zap (24×24 viewBox), scaled to 512×512 with 15% padding
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="108" fill="#0a0a0a"/>
  <polygon points="271,107 122,286 256,286 241,405 390,226 256,226" fill="white"/>
</svg>`;

const buf = Buffer.from(svg);

for (const size of [512, 192, 180]) {
  await sharp(buf)
    .resize(size, size)
    .png()
    .toFile(path.join(outDir, `icon-${size}.png`));
  console.log(`  icon-${size}.png`);
}

console.log("Icons generated in public/icons/");
