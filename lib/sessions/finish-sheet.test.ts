import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { FINISH_LABELS, finishAction, markPrompt, unloggedText } from "./finish";

const read = (p: string) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");

describe("finish sheet", () => {
  it("reads the same on both sides", () => {
    expect(`${unloggedText(3)}. ${markPrompt(3)}`).toBe("3 sets not logged. Mark them as done and finish?");
    expect(`${unloggedText(1)}. ${markPrompt(1)}`).toBe("1 set not logged. Mark it as done and finish?");
    expect(FINISH_LABELS).toEqual({ mark: "Mark remaining and finish", partial: "Finish with only what I logged", cancel: "Cancel" });
  });
  it("keeps the one-tap path when every set is logged, and does nothing with nothing logged", () => {
    expect(finishAction([[true, true], [true]])).toEqual({ kind: "now" });
    expect(finishAction([[false], [false]])).toEqual({ kind: "none" });
    expect(finishAction([[true], [false, false]])).toEqual({ kind: "confirm", unlogged: 2 });
  });
  it("both loggers use the one sheet and 'mark remaining' includes sets with no prescription", () => {
    for (const f of ["components/athlete/WorkoutLogger.tsx", "app/(dashboard)/clients/[id]/log/WorkoutLogger.tsx"]) {
      const src = read(f);
      expect(src).toContain("<FinishSheet");
      expect(src).toContain('"check") }))'); // bulkIndices without the 'loggable' filter: blanks are marked too
    }
  });
});
