import { describe, expect, it, vi } from "vitest";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { PlanOverview } from "@/lib/plan/overview";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh() {}, push() {} }), usePathname: () => "/today" }));
// TodayScreen's empty states import server actions; nothing here signs in or reads a database.
vi.mock("@/lib/auth", () => ({ auth: async () => null }));
vi.mock("@/lib/db/client", () => ({ prisma: {} }));
vi.mock("next/cache", () => ({ revalidatePath: () => {}, revalidateTag: () => {} }));
vi.mock("next/headers", () => ({ headers: () => new Headers(), cookies: () => ({ get: () => undefined }) }));
vi.mock("react", async (orig) => ({ ...(await orig<typeof import("react")>()), cache: <T,>(fn: T) => fn }));

const w1 = { id: "w1", name: "Upper A", week: 20, date: "2026-11-23", status: "PLANNED", note: null, history: [], exercises: [], estMinutes: 50 };
const plan = (weekNotes: PlanOverview["weekNotes"]): PlanOverview =>
  ({ id: "p", name: "Upper / Lower", status: "ACTIVE", startDate: "2026-07-01", totalWeeks: 24, currentWeek: 20, generated: false, lighterWeeks: false, prefs: null, goalText: null, note: null, weekNotes, blocks: [], rationale: [], workouts: [w1], nextUp: w1, done: 0, rx: {} }) as unknown as PlanOverview;
const athlete = { firstName: "Alex", isDemo: false, isGuest: false, isCoach: false, selfServe: false, prefs: {} as never };

describe("the current week's note on Today, for real plans", () => {
  it("shows the note for the plan's current week, and not the others", async () => {
    const { TodayScreen } = await import("@/components/athlete/TodayScreen");
    const html = renderToStaticMarkup(h(TodayScreen, { athlete, goal: null, plan: plan([{ week: 20, title: "Deload week next", text: "Same weights, half the sets.", by: "Coach Jess" }, { week: 22, text: "Bench back to 185." }]) }));
    expect(html).toContain("Week 20 note · Coach Jess");
    expect(html).toContain("Deload week next");
    expect(html).not.toContain("Bench back to 185.");
  });
  it("no note for this week: nothing renders", async () => {
    const { TodayScreen } = await import("@/components/athlete/TodayScreen");
    expect(renderToStaticMarkup(h(TodayScreen, { athlete, goal: null, plan: plan([{ week: 22, text: "later" }]) }))).not.toContain("Week 22 note");
    expect(renderToStaticMarkup(h(TodayScreen, { athlete, goal: null, plan: plan([]) }))).not.toContain("Week 20 note");
  });
  it("links stay inside the base (the demo passes /demo)", async () => {
    const { TodayScreen } = await import("@/components/athlete/TodayScreen");
    const html = renderToStaticMarkup(h(TodayScreen, { athlete, goal: null, plan: plan([]), base: "/demo" }));
    expect(html).toContain('href="/demo/workouts/w1"');
    expect(html).not.toMatch(/href="\/workouts/);
  });
  it("Plan: the current week's note, then the weeks to come", async () => {
    const { WeekNotesList } = await import("@/components/plan/WeekNoteCard");
    const html = renderToStaticMarkup(h(WeekNotesList, { currentWeek: 20, notes: [{ week: 20, text: "Now" }, { week: 21, text: "Next" }, { week: 19, text: "Past" }] }));
    expect(html).toContain("Week 20 note");
    expect(html).toContain("Coming weeks");
    expect(html).toContain("Next");
    expect(html).not.toContain("Past");
    expect(renderToStaticMarkup(h(WeekNotesList, { currentWeek: 20, notes: [] }))).toBe("");
  });
});

describe("Progress: body weight", () => {
  it("draws the section from plain points; nothing with none", async () => {
    const { BodyWeightSection } = await import("@/components/athlete/BodyWeightSection");
    const html = renderToStaticMarkup(h(BodyWeightSection, { points: [{ day: "2026-06-01", lb: 188 }, { day: "2026-11-20", lb: 180 }] }));
    expect(html).toContain("Body weight");
    expect(html).toContain("180");
    expect(html).toContain("−8 lb since Jun 1");
    expect(renderToStaticMarkup(h(BodyWeightSection, { points: [] }))).toBe("");
  });
});
