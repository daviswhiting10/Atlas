import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");
const loggers = {
  athlete: read("components/athlete/WorkoutLogger.tsx"),
  coach: read("app/(dashboard)/clients/[id]/log/WorkoutLogger.tsx"),
};

/** Ticking a set shows the check and nothing else. These are the things that used to fire on a tick. */
describe.each(Object.entries(loggers))("%s logger: a tick is quiet", (_, src) => {
  it("has no toast for a logged set, a record or a new best", () => {
    expect(src).not.toMatch(/toast[^\n]*Set \$\{[^}]*\} logged/);
    expect(src).not.toMatch(/New best/);
    expect(src).not.toMatch(/recordLabel\([^)]*\)\}: \$\{ex\.name\}/);
  });
  it("has no toast about saving or being offline", () => {
    expect(src).not.toMatch(/didn't save/);
    expect(src).not.toMatch(/You're offline\. Sets save/);
    expect(src).not.toMatch(/toast\.dismiss\("offline"\)/);
  });
  it("marks an unsaved set with the one shared dot, and nothing else", () => {
    expect(src).toContain("UnsavedDot");
    expect(src).toContain("STUCK_MS");
  });
  it("the check doesn't animate in", () => {
    expect(src).not.toMatch(/Check className=\{cn\("h-6 w-6", s\.done && "pop"\)/);
  });
});

describe("the record mark", () => {
  it("is a ring on the check, not a line added under the row (no layout shift)", () => {
    expect(loggers.athlete).toContain("RECORD_RING");
    expect(loggers.athlete).not.toMatch(/fade-in tnum ml-7 mt-1\.5/);
  });
});
