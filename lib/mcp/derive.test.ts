import { describe, expect, it } from "vitest";
import { e1RM } from "@/lib/progress/math";
import { groupByExercise, muscleTrends, personalRecords, plateauReport, recommend, summarizeSession, trendOf, volumeByWeek, type DerivedSet } from "./derive";

let logSeq = 0;
/** One set. Sets sharing a `log` id belong to the same session. */
function set(over: Partial<DerivedSet> & { day: string }): DerivedSet {
  return {
    exerciseId: "bench",
    exerciseName: "Bench Press",
    movementPattern: "HORIZONTAL_PUSH",
    primaryMuscles: ["chest"],
    secondaryMuscles: [],
    setNumber: 1,
    weight: 150,
    bandColor: null,
    reps: 8,
    rpe: 7,
    completed: true,
    workoutLogId: over.workoutLogId ?? `log_${over.day}_${over.exerciseId ?? "bench"}_${logSeq++}`,
    date: new Date(over.day + "T18:00:00Z"),
    deload: false,
    ...over,
  };
}
const session = (day: string, sets: Array<Partial<DerivedSet>>, over: Partial<DerivedSet> = {}) => {
  const workoutLogId = `log_${day}_${over.exerciseId ?? "bench"}`;
  return sets.map((s, i) => set({ day, workoutLogId, setNumber: i + 1, ...over, ...s }));
};

describe("groupByExercise", () => {
  it("groups sets into sessions per exercise, oldest first, on the caller's calendar day", () => {
    const rows = [
      ...session("2026-11-09", [{ reps: 8 }, { reps: 7 }]),
      ...session("2026-11-02", [{ reps: 8 }]),
      // 01:30 UTC on the 11th is the evening of the 10th in New York.
      set({ day: "2026-11-11", date: new Date("2026-11-11T01:30:00Z"), exerciseId: "squat", exerciseName: "Back Squat" }),
    ];
    const grouped = groupByExercise(rows, "America/New_York");
    const bench = grouped.find((g) => g.exerciseId === "bench")!;
    expect(bench.sessions.map((s) => [s.date, s.sets.length])).toEqual([["2026-11-02", 1], ["2026-11-09", 2]]);
    expect(grouped.find((g) => g.exerciseId === "squat")!.sessions[0].date).toBe("2026-11-10");
  });
});

describe("personalRecords", () => {
  it("derives max weight and max estimated 1RM from the sets, with their dates", () => {
    const rows = [
      ...session("2026-10-01", [{ weight: 185, reps: 3 }]),
      ...session("2026-10-08", [{ weight: 160, reps: 10 }]),
      ...session("2026-10-15", [{ weight: 150, reps: 8 }]),
    ];
    const [pr] = personalRecords(groupByExercise(rows, "UTC"));
    expect(pr.maxWeight).toEqual({ lb: 185, reps: 3, date: "2026-10-01" });
    // 160 × 10 estimates higher than 185 × 3, so the two records come from different days.
    expect(pr.maxE1RM).toMatchObject({ fromWeight: 160, fromReps: 10, date: "2026-10-08" });
    expect(pr.maxE1RM!.lb).toBeCloseTo(e1RM(160, 10), 1);
  });

  it("ignores sets that were not completed", () => {
    const rows = [...session("2026-10-01", [{ weight: 150, reps: 8 }, { weight: 300, reps: 1, completed: false }])];
    expect(personalRecords(groupByExercise(rows, "UTC"))[0].maxWeight!.lb).toBe(150);
  });

  it("reports best reps for an exercise that was never loaded", () => {
    const rows = session("2026-10-01", [{ weight: null, reps: 12 }, { weight: null, reps: 15 }], { exerciseId: "pullup", exerciseName: "Pull-Up" });
    expect(personalRecords(groupByExercise(rows, "UTC"))[0]).toMatchObject({ maxWeight: null, maxE1RM: null, maxReps: { reps: 15, date: "2026-10-01" } });
  });
});

describe("volumeByWeek", () => {
  const rows = [
    ...session("2026-11-02", [{ weight: 100, reps: 10 }, { weight: 100, reps: 10 }]), // Monday
    ...session("2026-11-08", [{ weight: null, reps: 12 }], { exerciseId: "pullup", primaryMuscles: ["lats"] }), // Sunday, same week
    ...session("2026-11-09", [{ weight: 100, reps: 10 }, { weight: null, bandColor: "red", reps: 15 }]), // next Monday
  ];
  const weeks = volumeByWeek(rows, "UTC");

  it("buckets by Monday-start week and splits by primary muscle", () => {
    expect(weeks.map((w) => w.week)).toEqual(["2026-11-02", "2026-11-09"]);
    expect(weeks[0]).toMatchObject({ tonnageLb: 2000, sets: 3 });
    expect(weeks[0].byMuscle).toEqual({ chest: { tonnageLb: 2000, sets: 2 }, lats: { tonnageLb: 0, sets: 1 } });
  });

  it("counts bodyweight and band sets as sets with no tonnage, and says how many", () => {
    expect(weeks[0].unloadedSets).toBe(1);
    expect(weeks[1]).toMatchObject({ tonnageLb: 1000, sets: 2, unloadedSets: 1 });
  });
});

describe("trendOf", () => {
  it("compares the later half with the earlier half, with a ±5% dead band", () => {
    expect(trendOf([10, 10, 12, 12])).toBe("rising");
    expect(trendOf([12, 12, 10, 10])).toBe("falling");
    expect(trendOf([10, 10, 10, 10.3])).toBe("flat");
    expect(trendOf([10, 12, 14])).toBe("insufficient_data");
  });

  it("is computed per muscle from weekly set counts", () => {
    const weeks = [1, 1, 3, 3].map((n, i) => ({
      week: `2026-10-${String(5 + i * 7).padStart(2, "0")}`,
      tonnageLb: 0,
      sets: n,
      unloadedSets: 0,
      byMuscle: { chest: { tonnageLb: 0, sets: n }, lats: { tonnageLb: 0, sets: 2 } },
    }));
    expect(muscleTrends(weeks)).toEqual({ chest: "rising", lats: "flat" });
  });
});

describe("plateauReport and recommend", () => {
  const today = "2026-11-10";
  const flat = [
    ...session("2026-10-27", [{ weight: 150, reps: 8, rpe: 9 }]),
    ...session("2026-11-03", [{ weight: 150, reps: 8, rpe: 9 }]),
    ...session("2026-11-09", [{ weight: 150, reps: 8, rpe: 9 }]),
  ];

  it("summarises a session", () => {
    const [h] = groupByExercise(session("2026-11-09", [{ weight: 150, reps: 8 }, { weight: 150, reps: 6 }, { weight: 140, reps: 10 }]), "UTC");
    expect(summarizeSession(h.sessions[0])).toMatchObject({ sets: 3, topWeight: 150, repsAtTop: 8, volumeLb: 150 * 8 + 150 * 6 + 140 * 10 });
  });

  it("raises confidence when the progression engine has also been saying 'hold'", () => {
    const [h] = groupByExercise(flat, "UTC");
    // RPE 9 at prescribed reps → the engine holds each time.
    const report = plateauReport(h, { today, goal: "hypertrophy", plannedReps: 8 });
    expect(report).toMatchObject({ plateaued: true, holdStreak: 3, confidence: "high" });
  });

  it("does not count a lighter-week session", () => {
    const rows = [
      ...session("2026-10-20", [{ weight: 145, reps: 8 }]),
      ...session("2026-10-27", [{ weight: 150, reps: 8 }]),
      ...session("2026-11-03", [{ weight: 150, reps: 6 }], { deload: true }),
      ...session("2026-11-09", [{ weight: 150, reps: 8 }]),
    ];
    const report = plateauReport(groupByExercise(rows, "UTC")[0], { today, goal: "general" });
    expect(report.sessionsConsidered).toBe(3);
    expect(report.plateaued).toBe(false);
  });

  it("builds each recommendation only from the engine, the plateau check and the volume trend", () => {
    const histories = groupByExercise(flat, "UTC");
    const [rec] = recommend(histories, {
      today,
      goal: "hypertrophy",
      plannedReps: { bench: 8 },
      muscleTrend: { chest: "falling" },
      primaryMuscle: { bench: "chest" },
    });
    expect(Object.keys(rec).sort()).toEqual(
      ["action", "exercise", "exerciseId", "plateaued", "reasoning", "suggestedReps", "suggestedWeightLb", "volumeTrend"].sort()
    );
    expect(rec).toMatchObject({ exerciseId: "bench", action: "hold", suggestedWeightLb: 150, plateaued: true, volumeTrend: "falling" });
    expect(rec.reasoning).toContain("RPE 9.0");
  });

  it("is reproducible for the same data", () => {
    const opts = { today, goal: "hypertrophy", plannedReps: { bench: 8 }, muscleTrend: {}, primaryMuscle: {} };
    expect(recommend(groupByExercise(flat, "UTC"), opts)).toEqual(recommend(groupByExercise(flat, "UTC"), opts));
  });

  it("measures the next step against the last normal session, not a lighter week", () => {
    const rows = [
      ...session("2026-11-02", [{ weight: 150, reps: 8, rpe: 7 }]),
      ...session("2026-11-09", [{ weight: 150, reps: 5, rpe: 6 }], { deload: true }),
    ];
    const [rec] = recommend(groupByExercise(rows, "UTC"), { today, goal: "hypertrophy", plannedReps: { bench: 8 }, muscleTrend: {}, primaryMuscle: {} });
    expect(rec.action).toBe("progress"); // from 150 × 8 @ RPE 7, not the easy 150 × 5
  });
});
