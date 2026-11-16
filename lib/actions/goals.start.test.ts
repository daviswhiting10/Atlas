import { beforeEach, describe, expect, it, vi } from "vitest";

// The session, the timezone cookie and the database, simulated.
const env = vi.hoisted(() => ({ created: [] as Array<{ startDay: string; rules: { carriedThrough?: string; rules: Array<{ key: string; detail?: string }> } }>, active: false }));

vi.mock("next/headers", () => ({ cookies: () => ({ get: () => ({ value: "America/New_York" }) }) }));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));
vi.mock("@/lib/auth", () => ({ auth: async () => ({ user: { id: "u1" } }) }));
vi.mock("@/lib/athlete/identity", () => ({ athleteIdentity: async () => ({ clientId: "c1", workspaceId: "w1", isCoach: true }) }));
vi.mock("@/lib/goals/data", () => ({ sealNow: async () => undefined }));
vi.mock("@/lib/athlete/data", () => ({ TZ_COOKIE: "atlas-tz" }));
vi.mock("@/lib/db/client", () => ({
  prisma: {
    goal: {
      findFirst: async () => (env.active ? { id: "g0" } : null),
      create: async ({ data }: { data: (typeof env.created)[number] }) => {
        env.created.push(data);
        return { id: "g1" };
      },
    },
  },
}));

import { DEFAULT_DIET } from "@/lib/goals/templates";
import { startGoal } from "./goals";

// Sunday Nov 15 2026, mid-morning in New York.
beforeEach(() => {
  env.created.length = 0;
  env.active = false;
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-15T14:00:00Z"));
});

const base = { templateKey: "builtin:75hard" };

describe("startGoal", () => {
  it("starts on Nov 4 as Day 12, carrying Nov 4–14, and says so", async () => {
    expect(await startGoal({ ...base, startDay: "2026-11-04", shownDay: 12 })).toEqual({ ok: true, goalId: "g1", dayOfGoal: 12 });
    expect(env.created[0].startDay).toBe("2026-11-04");
    expect(env.created[0].rules.carriedThrough).toBe("2026-11-14");
  });

  it("refuses, and saves nothing, when the day the form showed doesn't match the day it sent", async () => {
    const r = await startGoal({ ...base, startDay: "2026-11-04", shownDay: 1 });
    expect(r).toEqual({ ok: false, error: "That start day makes today Day 12, not Day 1. Check the start day and tap Start again." });
    expect(env.created).toHaveLength(0);
  });

  it("starting today is Day 1 with nothing carried", async () => {
    expect(await startGoal({ ...base, startDay: "2026-11-15", shownDay: 1 })).toMatchObject({ ok: true, dayOfGoal: 1 });
    expect(env.created[0].rules.carriedThrough).toBeUndefined();
  });

  it("keeps the challenge's own six rules, whatever the request says about dropping or adding", async () => {
    expect(await startGoal({ ...base, startDay: "2026-11-15", shownDay: 1, drop: ["water", "workouts"], add: ["Meditate"] })).toMatchObject({ ok: true });
    expect(env.created[0].rules.rules.map((r) => r.key)).toEqual(["workouts", "outdoors", "water", "reading", "diet", "photo"]);
  });

  it("the diet says the default until the person writes their own, and a blank goes back to the default", async () => {
    await startGoal({ ...base, startDay: "2026-11-15", shownDay: 1 });
    await startGoal({ ...base, startDay: "2026-11-15", shownDay: 1, diet: "   " });
    await startGoal({ ...base, startDay: "2026-11-15", shownDay: 1, diet: "  Keto,   no sugar " });
    expect(env.created.map((c) => c.rules.rules.find((r) => r.key === "diet")?.detail)).toEqual([DEFAULT_DIET, DEFAULT_DIET, "Keto, no sugar"]);
    expect(env.created[2].rules.rules.filter((r) => r.detail).map((r) => r.key)).toEqual(["diet"]);
  });

  it("refuses a diet that is too long, and saves nothing", async () => {
    expect(await startGoal({ ...base, startDay: "2026-11-15", shownDay: 1, diet: "x".repeat(121) })).toMatchObject({ ok: false });
    expect(env.created).toHaveLength(0);
  });

  it("refuses a request without the shown day (an old copy of the page)", async () => {
    expect(await startGoal({ ...base, startDay: "2026-11-04" })).toMatchObject({ ok: false });
    expect(env.created).toHaveLength(0);
  });
});
