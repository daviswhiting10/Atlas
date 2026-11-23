import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { coachFormPrefs, DOORS, initialDoor, toggleDoor, type Door, type PlanStartInputs } from "./plan-start";
import { resolvePrefs } from "@/lib/plan/generator";

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

describe("the three rows", () => {
  it("opening a row opens it", () => expect(toggleDoor(null, "atlas")).toBe("atlas"));
  it("opening another closes the first", () => {
    let open: Door | null = null;
    open = toggleDoor(open, "import");
    expect(open).toBe("import");
    open = toggleDoor(open, "own");
    expect(open).toBe("own"); // one open at a time
    open = toggleDoor(open, "atlas");
    expect(open).toBe("atlas");
  });
  it("tapping the open row closes it, leaving nothing open", () => expect(toggleDoor("own", "own")).toBeNull());
  it("whatever is tapped, never more than one is open", () => {
    let open: Door | null = null;
    const taps: Door[] = ["import", "own", "own", "atlas", "import", "atlas", "atlas", "own"];
    for (const t of taps) {
      open = toggleDoor(open, t);
      expect(DOORS.filter((d) => d === open).length).toBeLessThanOrEqual(1);
    }
  });
  it("a ?tab= link opens its door", () => {
    expect(initialDoor("import")).toBe("import");
    expect(initialDoor("build")).toBe("atlas");
    expect(initialDoor("plan")).toBeNull();
    expect(initialDoor(null)).toBeNull();
  });
});

const base: PlanStartInputs = { goalText: "", goals: [], modifiers: [], experience: "intermediate", daysPerWeek: 3, minutes: 60, equipment: "gym", phases: ["foundation"] };

describe("Fine-tune: every input reaches the generator", () => {
  it("days a week", () => expect(coachFormPrefs({ ...base, daysPerWeek: 5 }).daysPerWeek).toBe(5));
  it("minutes a session", () => expect(coachFormPrefs({ ...base, minutes: 45 }).minutes).toBe(45));
  it("equipment", () => expect(coachFormPrefs({ ...base, equipment: "dumbbells" as never }).equipment).toBe("dumbbells"));
  it("length: the phases chosen set the plan's length (all three is the 12-week default)", () => {
    expect(resolvePrefs(coachFormPrefs({ ...base, phases: ["foundation"] })).phases).toEqual(["foundation"]);
    expect(resolvePrefs(coachFormPrefs({ ...base, phases: ["foundation", "build"] })).phases).toEqual(["foundation", "build"]);
    expect(resolvePrefs(coachFormPrefs({ ...base, phases: ["foundation", "build", "peak"] })).phases).toHaveLength(3);
  });
  it("experience", () => expect(coachFormPrefs({ ...base, experience: "advanced" }).experience).toBe("advanced"));
  it("the goal in their words", () => expect(coachFormPrefs({ ...base, goalText: "Lose 20 lb, bad left knee" }).goalText).toBe("Lose 20 lb, bad left knee"));
  it("goal chips: the first one decides the goal and each adds its conditioning or corrective work", () => {
    const g = coachFormPrefs({ ...base, goals: ["Strength"] });
    expect(g.goal).toBe(coachFormPrefs({ ...base, goals: ["Strength", "Fat Loss"] }).goal);
    expect(coachFormPrefs({ ...base, goals: ["Fat Loss"] }).goal).not.toBe(coachFormPrefs({ ...base, goals: ["Strength"] }).goal);
  });
  it("conditions and modifiers: injuries become conditions; Beginner and No Equipment set experience and equipment", () => {
    expect(coachFormPrefs({ ...base, modifiers: ["Knee Pain"] }).conditions).toContain("knee");
    expect(coachFormPrefs({ ...base, modifiers: ["Beginner"] }).experience).toBe("beginner");
    expect(coachFormPrefs({ ...base, modifiers: ["No Equipment"] }).equipment).toBe("bodyweight");
  });
});

describe("the Atlas form's wiring (static)", () => {
  const form = read("components/coach/CoachPlanForm.tsx");
  it("builds the generator's preferences with coachFormPrefs, from every input", () => {
    expect(form).toContain("coachFormPrefs(");
    for (const k of ["goalText", "goals", "modifiers", "experience", "daysPerWeek", "minutes", "equipment", "phases"]) expect(form).toMatch(new RegExp(`coachFormPrefs\\(\\{[^}]*\\b${k}\\b`));
  });
  it("hands those preferences, unchanged, to the same generate action", () => expect(form).toContain("generateDraftPlan({ clientId, prefs,"));
  it("every Fine-tune input is on the form in door mode", () => {
    for (const label of ["Goals", "Conditions and modifiers", "Experience", "Days per week", "Minutes per session", "Equipment", "Phases"]) expect(form).toContain(label);
  });
});

describe("the rows (static)", () => {
  // The rows live in one shared component, used by the coach's Plan tab and the athlete's empty Today.
  const start = read("components/plan/DoorRows.tsx");
  const detail = read("app/(dashboard)/clients/[id]/ClientDetail.tsx");
  it("each row is at least 44 px tall and shows an instant pressed state", () => {
    expect(start).toMatch(/min-h-\[(6\d|7\d)px\]/);
    expect(start).toContain("onPointerDown");
    expect(read("components/coach/PlanStart.tsx")).toContain("<DoorRows");
    expect(read("components/athlete/NoPlanCard.tsx")).toContain("<DoorRows");
  });
  it("there is no mic button, only room for one", () => {
    expect(start + read("components/coach/CoachPlanForm.tsx")).not.toMatch(/<Mic\b/);
    expect(read("components/coach/CoachPlanForm.tsx")).toContain("data-slot=\"mic\"");
  });
  it("the Plan tab shows the three rows, and the old stack of cards is gone", () => {
    expect(detail).toContain("<PlanStart");
    expect(detail).not.toContain("Build with Atlas");
    expect(detail).not.toContain("<AssignFromLibrary");
  });
  it("import keeps the context box and Week 1 started inside a collapsed Details", () => {
    const up = read("components/coach/SheetPlanUpload.tsx");
    expect(up).toMatch(/<details[^>]*>[\s\S]*Details[\s\S]*Context[\s\S]*Week 1 started[\s\S]*<\/details>/);
  });
});
