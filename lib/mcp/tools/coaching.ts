import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { displayName } from "@/lib/plan/catalog";
import { localDay, safeTimeZone } from "@/lib/athlete/sessions";
import { ALL_ROLES } from "../auth";
import { loadSetRows } from "../data";
import { groupByExercise, muscleTrends, recommend, volumeByWeek } from "../derive";
import { ClientIdArg, TimeZoneArg } from "../schemas";
import { clientTool } from "../tool";
import { keyLifts, plannedRepsByExercise } from "./progress";

const DAY_MS = 86_400_000;

export const getTrainingRecommendations = clientTool({
  name: "get_training_recommendations",
  title: "Training recommendations",
  description:
    "What to do next on each key lift. Deterministic: every value comes from the progression engine, the plateau detector or the volume trend — no AI-written advice.",
  permission: "read",
  roles: ALL_ROLES,
  input: z.object({ clientId: ClientIdArg, timezone: TimeZoneArg }),
  async handler({ client }, args) {
    const tz = safeTimeZone(args.timezone);
    const [rows, plannedReps] = await Promise.all([
      loadSetRows(client, { since: new Date(Date.now() - 16 * 7 * DAY_MS) }),
      plannedRepsByExercise(client),
    ]);
    const histories = groupByExercise(rows, tz);
    const lifts = keyLifts(client, histories);
    const primaryMuscle = Object.fromEntries(rows.map((r) => [r.exerciseId, r.primaryMuscles[0]]));

    return {
      client: client.fullName,
      goal: client.primaryGoal ?? "general",
      sources: ["progression engine (lib/progression.ts)", "plateau detector (lib/progress/plateau.ts)", "weekly volume by muscle"],
      recommendations: recommend(lifts, {
        today: localDay(new Date(), tz),
        goal: client.primaryGoal ?? "general",
        plannedReps,
        muscleTrend: muscleTrends(volumeByWeek(rows, tz)),
        primaryMuscle,
      }),
    };
  },
});

export const getUserFitnessProfile = clientTool({
  name: "get_user_fitness_profile",
  title: "Fitness profile",
  description:
    "A client's profile: goal, status, key lifts, the latest intake summary with any health red flags, the latest assessment, and recent milestones. Contains health information.",
  permission: "read",
  roles: ALL_ROLES,
  input: z.object({ clientId: ClientIdArg, timezone: TimeZoneArg }),
  async handler({ client }, args) {
    const tz = safeTimeZone(args.timezone);
    // Re-read with the scope in the query: this is the most sensitive read in the server.
    const profile = await prisma.clientProfile.findFirst({
      where: { id: client.id, workspaceId: client.workspaceId, deletedAt: null },
      select: {
        fullName: true,
        primaryGoal: true,
        status: true,
        goalTargets: true,
        createdAt: true,
        intakeForms: { orderBy: { createdAt: "desc" }, take: 1, select: { createdAt: true, aiSummary: true, redFlags: true } },
        assessments: { orderBy: { createdAt: "desc" }, take: 1, select: { createdAt: true, type: true, findings: true, referralFlag: true, referralReason: true } },
        milestones: { orderBy: { achievedAt: "desc" }, take: 5, select: { title: true, description: true, achievedAt: true } },
      },
    });
    if (!profile) return null;

    const lifts = client.keyLiftIds.length
      ? await prisma.exercise.findMany({
          where: { id: { in: client.keyLiftIds }, OR: [{ workspaceId: null }, { workspaceId: client.workspaceId }] },
          select: { id: true, name: true, slug: true },
        })
      : [];
    const intake = profile.intakeForms[0];
    const assessment = profile.assessments[0];

    return {
      name: profile.fullName,
      primaryGoal: profile.primaryGoal,
      status: profile.status,
      clientSince: localDay(profile.createdAt, tz),
      keyLifts: lifts.map((e) => ({ exerciseId: e.id, exercise: displayName(e.slug, e.name) })),
      goalTargets: profile.goalTargets,
      latestIntake: intake ? { date: localDay(intake.createdAt, tz), summary: intake.aiSummary, redFlags: intake.redFlags } : null,
      latestAssessment: assessment
        ? { date: localDay(assessment.createdAt, tz), type: assessment.type, findings: assessment.findings, referralFlag: assessment.referralFlag, referralReason: assessment.referralReason }
        : null,
      recentMilestones: profile.milestones.map((m) => ({ title: m.title, description: m.description, date: localDay(m.achievedAt, tz) })),
    };
  },
});
