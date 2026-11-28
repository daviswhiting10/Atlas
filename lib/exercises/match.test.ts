import { describe, expect, it } from "vitest";
import { bestMatch, nameMatch } from "./match";

const c = (name: string, sets: number) => ({ id: name, name, sets });

describe("bestMatch: a written name against what the person has logged", () => {
  it("Bench Press lands on their Barbell Bench Press", () => {
    expect(bestMatch("Bench Press", [c("Barbell Bench Press", 40), c("Back Squat", 30)])?.name).toBe("Barbell Bench Press");
    expect(bestMatch("bench presses", [c("1A Barbell Bench Press", 4)])?.name).toBe("1A Barbell Bench Press");
  });

  it("Bench Press never takes the dumbbell bench, even with more sets", () => {
    expect(bestMatch("Bench Press", [c("Dumbbell Bench Press", 90), c("Barbell Bench Press", 12)])?.name).toBe("Barbell Bench Press");
    expect(bestMatch("Bench Press", [c("Dumbbell Bench Press", 90)])).toBeNull();
    // Written with the implement, it goes there.
    expect(bestMatch("DB Bench Press", [c("Dumbbell Bench Press", 9), c("Barbell Bench Press", 90)])?.name).toBe("Dumbbell Bench Press");
  });

  it("Squat lands on their Back Squat; Front Squat is a different lift", () => {
    expect(bestMatch("Squat", [c("Back Squat", 60), c("Front Squat", 20)])?.name).toBe("Back Squat");
    expect(bestMatch("Squat", [c("Front Squat", 20)])).toBeNull();
    expect(bestMatch("Barbell Squat", [c("Back Squat", 5)])?.name).toBe("Back Squat");
  });

  it("among genuine matches, the most logged sets wins", () => {
    expect(bestMatch("Squat", [c("Back Squat", 10), c("Barbell Back Squat", 50)])?.name).toBe("Barbell Back Squat");
  });

  it("the exact name beats a same-lift name with more sets", () => {
    expect(bestMatch("Bench Press", [c("Barbell Bench Press", 80), c("Bench Press", 3)])?.name).toBe("Bench Press");
    expect(bestMatch("RDL", [c("Romanian Deadlift", 3), c("Barbell Romanian Deadlift", 30)])?.name).toBe("Romanian Deadlift");
  });

  it("a broad word never grabs a lift", () => {
    expect(bestMatch("Press", [c("Bench Press", 50), c("Overhead Press", 20)])).toBeNull();
    expect(bestMatch("Bench Press", [c("Incline Bench Press", 50)])).toBeNull();
    expect(bestMatch("Barbell", [c("Barbell Bench Press", 50)])).toBeNull();
    expect(bestMatch("Back Extension", [c("Extension", 5)])).toBeNull();
  });

  it("a name with no history has no match (the caller falls through to the workspace, then the library)", () => {
    expect(bestMatch("Hip Thrust", [c("Barbell Bench Press", 40), c("Back Squat", 30)])).toBeNull();
    expect(bestMatch("Hip Thrust", [])).toBeNull();
  });

  it("nameMatch: same name 2, same lift 1, else 0", () => {
    expect(nameMatch("Pull-ups", "Pullup")).toBe(2);
    expect(nameMatch("OHP", "Standing Overhead Press")).toBe(1);
    expect(nameMatch("Deadlift", "Conventional Deadlift")).toBe(1);
    expect(nameMatch("Deadlift", "Romanian Deadlift")).toBe(0);
    expect(nameMatch("", "Bench Press")).toBe(0);
  });
});
