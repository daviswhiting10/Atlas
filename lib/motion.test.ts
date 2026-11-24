import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
const num = (re: RegExp) => Number(css.match(re)?.[1]);

describe("screen and tab entrance", () => {
  it("finishes within about 300 ms, stagger included", () => {
    const dur = num(/\.rise \{ animation: rise (\d+)ms/);
    const delays = Array.from(css.matchAll(/^\.rise-\d \{ animation-delay: (\d+)ms/gm)).map((m) => Number(m[1]));
    expect(delays).toHaveLength(5);
    expect(dur).toBeLessThanOrEqual(300);
    expect(dur + Math.max(...delays)).toBeLessThanOrEqual(300);
  });
  it("keeps the slow staggered version for the landing page only; the Finish screen shows at once", () => {
    expect(num(/\.rise-intro \{ animation: rise (\d+)ms/)).toBe(520);
    const users = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
    expect(users("app/page.tsx")).toContain("rise-intro");
    expect(users("components/athlete/WorkoutLogger.tsx")).not.toContain("rise-intro");
  });
  it("respects prefers-reduced-motion: no duration and no delay (nothing waits hidden)", () => {
    const block = css.slice(css.indexOf("@media (prefers-reduced-motion: reduce) {"));
    expect(block).toMatch(/animation-duration: 0\.01ms !important/);
    expect(block).toMatch(/animation-delay: 0ms !important/);
  });
});
