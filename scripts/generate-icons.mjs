import sharp from "sharp";
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, "../public/icons");
mkdirSync(outDir, { recursive: true });

// The app's own mark (components/athlete/Logo.tsx): Dusk teal with the dark rising line. Full-bleed and opaque:
// iOS and Android round the corners themselves, and a transparent corner would show black. The line sits in the
// middle half of the tile, clear of any mask.
const TEAL = "#7cc7bd";
const INK = "#121615";
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" fill="${TEAL}"/>
  <g transform="translate(121 121) scale(15)" fill="none">
    <path d="M2.5 13.5 7 9l3 2.5 5.5-7" stroke="${INK}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
    <circle cx="15.5" cy="4.5" r="1.6" fill="${INK}"/>
  </g>
</svg>`;

const buf = Buffer.from(svg);

for (const size of [512, 192, 180]) {
  await sharp(buf)
    .resize(size, size)
    .flatten({ background: TEAL })
    .png()
    .toFile(path.join(outDir, `icon-${size}.png`));
  console.log(`  icon-${size}.png`);
}

console.log("Icons generated in public/icons/");
