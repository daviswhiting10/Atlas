import { cookies } from "next/headers";
import { prisma } from "@/lib/db/client";
import { ROSTER } from "@/lib/db/roster";
import { TZ_COOKIE, loadProgress, safeTimeZone, type ProgressData } from "@/lib/athlete/data";
import { loadPlanOverview } from "@/lib/plan/overview";
import { GOALS, resolvePrefs, type FocusMetric } from "@/lib/plan/generator";

/** Map the coach's free-form primary goal onto the metric charts lead with. */
const metricForGoal = (goal: string | null): FocusMetric =>
  goal === "performance" || goal === "strength" ? "e1rm" : goal === "weight_loss" ? "reps" : "weight";

export type ClientProgress = {
  client: { id: string; fullName: string; firstName: string };
  data: ProgressData;
  metric: FocusMetric;
};

/**
 * One client's progress for the coach: the same read model the athlete's
 * Progress screen uses, scoped to the coach's workspace. Null when the
 * client isn't one of theirs.
 */
export async function loadClientProgress(clientId: string, workspaceId: string): Promise<ClientProgress | null> {
  const client = await prisma.clientProfile.findFirst({
    where: { id: clientId, workspaceId, deletedAt: null, ...ROSTER },
    select: { id: true, fullName: true, primaryGoal: true },
  });
  if (!client) return null;

  const plan = await loadPlanOverview({ clientId: client.id, workspaceId });
  const data = await loadProgress({
    clientId: client.id,
    workspaceId,
    plan,
    selfServe: false,
    timeZone: safeTimeZone(cookies().get(TZ_COOKIE)?.value),
  });
  const goal = plan?.prefs ? GOALS[resolvePrefs(plan.prefs).goal] : null;
  return {
    client: { id: client.id, fullName: client.fullName, firstName: client.fullName.split(" ")[0] },
    data,
    metric: goal?.metric ?? metricForGoal(client.primaryGoal),
  };
}
