import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");

/** The finished screen shows at once; the saves and the finish go on behind it (finish-lag). */
describe("finish shows the finished screen at once", () => {
  it("the athlete logger sets the summary before it waits for the saves, and takes it back if the finish fails", () => {
    const src = read("components/athlete/WorkoutLogger.tsx");
    const fn = src.slice(src.indexOf("  function finish() {"), src.indexOf("  /** Finish tapped"));
    expect(fn.indexOf("setSummary({ minutes: localMinutes })")).toBeLessThan(fn.indexOf("await queue.current"));
    expect((fn.match(/setSummary\(null\)/g) ?? []).length).toBeGreaterThanOrEqual(3);
  });
  it("the coach logger sets finished before it waits for the saves, and takes it back if the finish fails", () => {
    const src = read("app/(dashboard)/clients/[id]/log/WorkoutLogger.tsx");
    const fn = src.slice(src.indexOf("async function handleCompleteSession"), src.indexOf("completeRef.current ="));
    expect(fn.indexOf("setFinished(true)")).toBeLessThan(fn.indexOf("await saveChain.current"));
    expect(fn).toContain("setFinished(false)");
  });
});
