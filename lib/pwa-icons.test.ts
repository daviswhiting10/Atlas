import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";

const pub = path.join(process.cwd(), "public");
const manifest = JSON.parse(readFileSync(path.join(pub, "manifest.json"), "utf8")) as { icons: Array<{ src: string; sizes: string }> };

describe("the Home Screen icon", () => {
  it("every manifest icon exists at its size", async () => {
    for (const icon of manifest.icons) {
      const meta = await sharp(path.join(pub, icon.src)).metadata();
      expect(`${meta.width}x${meta.height}`, icon.src).toBe(icon.sizes);
    }
  });

  it("is opaque and Dusk teal at the corner, so a rounded mask never shows black", async () => {
    const { data, info } = await sharp(path.join(pub, "icons/icon-180.png")).raw().toBuffer({ resolveWithObject: true });
    expect(info.channels).toBe(3);
    expect(Array.from(data.slice(0, 3))).toEqual([0x7c, 0xc7, 0xbd]);
  });
});
