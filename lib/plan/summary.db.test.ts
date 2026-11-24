/**
 * The You card's light plan read gives exactly what the full plan overview gave, for every active plan on a dev database
 * (read only; never production):
 *   set -a; . ./.env.local; set +a; ATLAS_DB_TEST=1 npx vitest run lib/plan/summary.db.test.ts
 */
import { describe, expect, it } from "vitest";

const RUN = !!process.env.ATLAS_DB_TEST;

describe.skipIf(!RUN)("loadPlanSummary equals youPlan(loadPlanOverview) (dev database)", () => {
  it("for every active plan", async () => {
    const { prisma } = await import("@/lib/db/client");
    const { loadPlanOverview } = await import("./overview");
    const { loadPlanSummary } = await import("./summary");
    const { youPlan } = await import("@/lib/athlete/you-summary");
    const rows = await prisma.programAssignment.findMany({ where: { status: "ACTIVE" }, select: { clientId: true, workspaceId: true }, take: 150 });
    expect(rows.length).toBeGreaterThan(0);
    let n = 0;
    for (const r of rows) {
      const want = youPlan(await loadPlanOverview({ clientId: r.clientId, workspaceId: r.workspaceId, fallbackPrefs: null }));
      const got = await loadPlanSummary({ clientId: r.clientId, workspaceId: r.workspaceId, fallbackPrefs: null });
      expect(got).toEqual(want);
      n++;
    }
    console.log(`checked ${n} active plans`);
  }, 300_000);
});
