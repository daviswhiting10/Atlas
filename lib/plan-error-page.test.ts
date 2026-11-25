import { describe, expect, it, vi } from "vitest";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";

// The database connection drops mid-request: what Neon's driver threw in W4's fuzz run 111.
const { drop } = vi.hoisted(() => ({ drop: Object.assign(new Error("Connection terminated unexpectedly"), { code: "ECONNRESET" }) }));

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh() {}, push() {} }), usePathname: () => "/plan" }));
vi.mock("next/headers", () => ({ headers: () => new Headers(), cookies: () => ({ get: () => undefined }) }));
vi.mock("next/cache", () => ({ revalidatePath: () => {}, revalidateTag: () => {} }));
vi.mock("@/lib/auth", () => ({ auth: async () => null }));
vi.mock("@/lib/db/client", () => ({ prisma: {} }));
vi.mock("@/lib/actions/athlete", () => ({
  deleteMySession: async () => ({ ok: true }),
  planAddExercise: async () => ({ ok: true }),
  planAddWorkout: async () => ({ ok: true }),
  planRemoveExercise: async () => ({ ok: true }),
  planRemoveWorkout: async () => ({ ok: true }),
  planSetNote: async () => ({ ok: true }),
  planSetTargets: async () => ({ ok: true }),
  planSetWorkoutNote: async () => ({ ok: true }),
  planSwapExercise: async () => ({ ok: true }),
  reassignMySession: async () => ({ ok: true }),
  sessionSummary: async () => ({ ok: true }),
  setWorkoutSkipped: async () => ({ ok: true }),
}));
vi.mock("@/lib/report/load", () => ({ listReports: async () => [] }));
vi.mock("react", async (orig) => ({ ...(await orig<typeof import("react")>()), cache: <T,>(fn: T) => fn }));
vi.mock("@/lib/athlete/data", () => ({
  TZ_COOKIE: "tz",
  getAthlete: async () => ({ clientId: "c", workspaceId: "w", firstName: "Alex", isDemo: false, isGuest: false, isCoach: false, selfServe: false, prefs: {} }),
  getPlanOverview: async () => {
    throw drop;
  },
}));

describe("the Plan tab when the database connection drops", () => {
  it("the page throws (to its error screen) instead of drawing an empty plan", async () => {
    const { default: PlanPage } = await import("@/app/(client)/plan/page");
    await expect(PlanPage({})).rejects.toBe(drop);
  });

  it("the error screen says Couldn't load your plan, with Try again, inside the tab", async () => {
    const { default: PlanError } = await import("@/app/(client)/plan/error");
    const html = renderToStaticMarkup(h(PlanError, { error: drop, reset: () => {} }));
    expect(html).toContain("Couldn&#x27;t load your plan");
    expect(html).toContain("Try again");
    expect(html).toContain('role="alert"');
    // The tab's own card, like "No plan yet": not the full-screen generic error.
    expect(html).toContain("surface rise p-8");
    expect(html).not.toContain("That didn");
    expect(html).not.toContain("500");
  });
});
