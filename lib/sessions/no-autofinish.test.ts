import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const files = ["components/athlete/WorkoutLogger.tsx", "app/(dashboard)/clients/[id]/log/WorkoutLogger.tsx"];

describe("no workout finishes by itself", () => {
  for (const f of files) {
    it(`${f} has no finish timer or countdown`, () => {
      const src = readFileSync(f, "utf8");
      expect(src).not.toMatch(/scheduleFinish|finishTimer|FINISH_DELAY_MS|setCountdown|Every set logged\. Finishing|All sets logged · finishing/);
    });
  }
});
