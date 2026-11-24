import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh() {}, push() {} }), usePathname: () => "/demo", }));
vi.mock("@/lib/auth", () => ({ auth: async () => null }));
vi.mock("@/lib/db/client", () => ({ prisma: {} }));
vi.mock("next/cache", () => ({ revalidatePath: () => {}, revalidateTag: () => {} }));
vi.mock("next/headers", () => ({ headers: () => new Headers(), cookies: () => ({ get: () => undefined }) }));
vi.mock("react", async (orig) => ({ ...(await orig<typeof import("react")>()), cache: <T,>(fn: T) => fn }));

const root = join(__dirname, "..", "..");
const files = (dir: string): string[] =>
  readdirSync(join(root, dir)).flatMap((f) => {
    const p = join(dir, f);
    return statSync(join(root, p)).isDirectory() ? files(p) : /\.(ts|tsx)$/.test(f) && !f.endsWith(".test.ts") ? [p] : [];
  });

describe("the demo reads no database", () => {
  it("nothing under app/demo or lib/demo imports Prisma or @/lib/db", () => {
    const all = [...files("app/demo"), ...files("lib/demo"), ...files("components/demo")];
    expect(all.length).toBeGreaterThanOrEqual(8);
    // A type-only import is erased at build time; any other import of the database or a server action that reads it fails.
    const real = (src: string) => src.split("\n").filter((l) => /^import /.test(l) && !/^import type /.test(l)).join("\n");
    for (const f of all) expect(real(readFileSync(join(root, f), "utf8")), f).not.toMatch(/@\/lib\/db|@prisma|generated\/prisma|@\/lib\/actions\/(athlete|coach-plan|goals|account)"/);
  });
});

describe("the sample athlete", () => {
  it("is the spec's Alex: Upper / Lower week 20 of 24, 81 sessions over 26 weeks, bench 135 → 180, squat 195, deadlift 265", async () => {
    const s = await import("./sample");
    expect(s.DEMO_PLAN).toMatchObject({ name: "Upper / Lower", totalWeeks: 24, currentWeek: 20 });
    expect(s.DEMO_PLAN.nextUp?.name).toBe("Upper A");
    expect(s.DEMO_SESSIONS).toHaveLength(81);
    expect(s.DEMO_CALENDAR.kind).toBe("grid");
    const lift = (n: string) => s.DEMO_PROGRESS.exercises.find((e) => e.name === n)!.series;
    expect(lift("Bench Press").map((p) => p.weight)).toEqual([135, 135, 140, 125, 145, 150, 150, 135, 155, 160, 160, 145, 165, 170, 170, 150, 175, 180, 180]);
    expect(lift("Back Squat").at(-1)?.weight).toBe(195);
    expect(lift("Deadlift").at(-1)?.weight).toBe(265);
    expect(s.DEMO_BODY_WEIGHT[0].lb).toBe(188);
    expect(s.DEMO_BODY_WEIGHT.at(-1)?.lb).toBe(180);
  });

  it("today's workout is half done: bench 175×8, 175×8, 180×7 with set 4 at 185 waiting; the row done; 20 sets in all", async () => {
    const s = await import("./sample");
    const l = s.demoLoggerData(s.DEMO_PLAN.nextUp!.id)!;
    const bench = l.exercises[0];
    expect(bench.sets.map((x) => [x.weight, x.reps, x.done])).toEqual([[175, 8, true], [175, 8, true], [180, 7, true], [185, null, false]]);
    expect(l.exercises[1].sets.every((x) => x.done)).toBe(true);
    expect(l.exercises.slice(2).every((e) => e.sets.every((x) => !x.done))).toBe(true);
    expect(l.exercises.reduce((n, e) => n + e.sets.length, 0)).toBe(20);
  });
});

describe("week notes in the demo", () => {
  it("Today shows week 20's note; Plan shows it and the weeks to come", async () => {
    const s = await import("./sample");
    const { TodayScreen } = await import("@/components/athlete/TodayScreen");
    const { WeekNotesList } = await import("@/components/plan/WeekNoteCard");
    const today = renderToStaticMarkup(h(TodayScreen, { athlete: s.DEMO_ATHLETE, plan: s.DEMO_PLAN, goal: null, base: "/demo" }));
    expect(today).toContain("Week 20 note · Coach Jess");
    expect(today).toContain("Deload week next");
    expect(today).not.toContain("Bench back to 185");
    expect(today).toContain('href="/demo/workouts/');
    const plan = renderToStaticMarkup(h(WeekNotesList, { notes: s.DEMO_PLAN.weekNotes, currentWeek: s.DEMO_PLAN.currentWeek }));
    expect(plan).toContain("Deload week next");
    expect(plan).toContain("Week 21");
    expect(plan).toContain("Bench back to 185 for 4 × 6. Add 5 lb if all four land.");
  });
});

describe("saves stay in memory; Reset restores exactly the sample", () => {
  it("a tick is kept for this tab, Reset empties it, and nothing is sent anywhere", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const { demoActions } = await import("./actions");
    const { demoStore } = await import("./store");
    const s = await import("./sample");
    const l = s.demoLoggerData(s.DEMO_PLAN.nextUp!.id)!;
    const set4 = l.exercises[0].sets[3];
    const res = await demoActions.saveSet({ assignedWorkoutId: l.id, aweId: l.exercises[0].aweId, setNumber: 4, weight: 185, reps: 6, done: true, setLogId: null });
    expect(res.workoutLogId).toMatch(/^demo-log-/);
    expect(demoStore.getSet(l.id, l.exercises[0].aweId, 4)).toEqual({ weight: 185, reps: 6, done: true });
    await demoActions.finishWorkout({ assignedWorkoutId: l.id });
    expect(demoStore.isFinished(l.id)).toBe(true);
    demoStore.reset();
    expect(demoStore.size()).toBe(0);
    expect(demoStore.getSet(l.id, l.exercises[0].aweId, 4)).toBeUndefined();
    // The sample itself never changes.
    expect(s.demoLoggerData(l.id)!.exercises[0].sets[3]).toEqual(set4);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
  it("changing the plan isn't part of the demo", async () => {
    const { demoActions } = await import("./actions");
    expect(await demoActions.planRemoveExercise({ aweId: "a", workoutId: "w" })).toMatchObject({ ok: false });
  });
});

describe("Exit", () => {
  it("goes back to a page on this site, never off-site and never into the demo", async () => {
    const { exitTo } = await import("./exit");
    expect(exitTo("/you")).toBe("/you");
    expect(exitTo("/plan?view=all")).toBe("/plan?view=all");
    expect(exitTo(null)).toBe("/");
    for (const bad of ["https://evil.example", "//evil.example", "/\\evil.example", "javascript:alert(1)", "/demo", "/demo/plan", "you"]) expect(exitTo(bad), bad).toBe("/");
  });
});

describe("the way in", () => {
  it("/demo is open signed in or out; the Me ⋯ menu links to it with where you came from", async () => {
    const { decide } = await import("@/lib/auth/route-policy");
    expect(decide("/demo", null)).toEqual({ kind: "next" });
    expect(decide("/demo/workouts/x", null)).toEqual({ kind: "next" });
    expect(decide("/demo", { role: "CLIENT", needsPassword: false, guest: false })).toEqual({ kind: "next" });
    expect(decide("/demo", { role: "TRAINER", needsPassword: false, guest: false })).toEqual({ kind: "next" });
    const menu = readFileSync(join(root, "components/nav/HeaderActions.tsx"), "utf8");
    expect(menu).toContain("/demo?from=${encodeURIComponent(pathname)}");
  });
});
