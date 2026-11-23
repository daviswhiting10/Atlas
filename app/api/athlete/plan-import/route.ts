import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db/client";
import { GUEST_EMAIL_DOMAIN } from "@/lib/guest";
import { athleteIdentity } from "@/lib/athlete/identity";
import { IMPORTS_PER_DAY, canImportPlan } from "@/lib/athlete/empty-state";
import { previewFromGrid } from "@/lib/athlete/plan-import";
import { CHOOSE_A_FILE, PlanFileError, planFileFromForm, readPlanFile } from "@/lib/programs/read-plan-file";
import { foundInFile } from "@/lib/programs/extract";
import { readGrid } from "@/lib/programs/sheet-plan";
import { contextWarnings, type PlanContext } from "@/lib/programs/plan-context";
import { summarizeSheetImport } from "@/lib/programs/sheet-summary";
import { saveSheetPlan } from "@/lib/programs/save-sheet-plan";
import { rateLimiter } from "@/lib/password";
import { revalidatePath } from "next/cache";

export const maxDuration = 120;

/**
 * A plan file is the athlete's own plan: its weights are targets for each week, not weeks already done, so every week
 * is still to do (the coach's import reads a filled-in load as a session done).
 */
const START_FRESH: PlanContext = { durationWeeks: null, trainingDays: null, startAtWeek: 1 };
/** The features that call the reader, for counting a person's reads. */
const READ_FEATURES = ["athlete-plan-import", "athlete-plan-import-sheet"];
/** Two reads running at once from one person is a double tap, not a plan. */
const burst = rateLimiter(2, 60_000);

const Day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const Save = z.object({ step: z.literal("save"), startDate: Day, grid: z.unknown() });

/** Who is asking: a self-serve athlete who may import, else the reason they may not. */
async function importer() {
  const session = await auth();
  const identity = await athleteIdentity(session?.user);
  if (!session?.user?.id || !identity) return { error: NextResponse.json({ error: "Sign in to import a plan." }, { status: 401 }) };
  const profile = await prisma.clientProfile.findUnique({ where: { id: identity.clientId }, select: { goalTargets: true, fullName: true } });
  const selfServe = !!(profile?.goalTargets as { athlete?: unknown } | null)?.athlete;
  const isGuest = (session.user.email ?? "").endsWith(`@${GUEST_EMAIL_DOMAIN}`);
  if (!canImportPlan({ selfServe, isCoach: identity.isCoach, isGuest })) {
    const why = isGuest ? "Save your account first: importing a plan is for accounts." : "Your plan comes from your coach.";
    return { error: NextResponse.json({ error: why }, { status: 403 }) };
  }
  return { userId: session.user.id, ...identity, name: profile?.fullName ?? "My" };
}

/** A person's reads in the last day, counted from the usage log so it holds across servers and restarts. */
const readsToday = (userId: string) => prisma.usageLog.count({ where: { userId, feature: { in: READ_FEATURES }, createdAt: { gte: new Date(Date.now() - 24 * 3_600_000) } } });

/**
 * A self-serve athlete's own plan from a file, in two steps (the coach's import is the same two steps):
 *  read: a PDF (its pages become images), photos, or a spreadsheet's CSV is read into a plan. Nothing is saved.
 *  save: the plan as read comes back, is saved to the athlete's own library and becomes the live plan.
 */
export async function POST(req: Request) {
  const who = await importer();
  if ("error" in who) return who.error;

  if ((req.headers.get("content-type") ?? "").includes("application/json")) return save(req, who);
  return read(req, who);
}

async function read(req: Request, who: { userId: string; workspaceId: string; name: string }) {
  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: CHOOSE_A_FILE }, { status: 400 });
  try {
    const file = planFileFromForm(form);
    if (!burst(who.userId)) return NextResponse.json({ error: "One at a time: wait a moment and try again." }, { status: 429 });
    if ((await readsToday(who.userId)) >= IMPORTS_PER_DAY) {
      return NextResponse.json({ error: `That's ${IMPORTS_PER_DAY} plans read today. Try again tomorrow, or build it with Atlas now.` }, { status: 429 });
    }
    // A spreadsheet or images (a PDF's pages, screenshots): the same grid, so each week keeps its own numbers.
    const { grid, warnings } = await readPlanFile(file, { workspaceId: who.workspaceId, userId: who.userId, feature: file.csv ? "athlete-plan-import-sheet" : "athlete-plan-import" });
    const summary = summarizeSheetImport({ grid, context: START_FRESH, weekOneStart: null, today: new Date() });
    return NextResponse.json({
      grid,
      found: foundInFile(grid),
      readAs: summary.readAs,
      preview: previewFromGrid(grid, START_FRESH),
      warnings: [...warnings, ...contextWarnings(START_FRESH, { days: summary.daysPerWeek }, "sheet")],
    });
  } catch (err) {
    if (err instanceof PlanFileError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
}

async function save(req: Request, who: { userId: string; workspaceId: string; clientId: string; name: string }) {
  const parsed = Save.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Read the plan again, then save." }, { status: 400 });
  const start = new Date(`${parsed.data.startDate}T00:00:00`);

  try {
    const grid = readGrid(JSON.stringify(parsed.data.grid));
    if (!grid) return NextResponse.json({ error: "Read the plan again, then save." }, { status: 400 });
    await saveSheetPlan({
      workspaceId: who.workspaceId,
      clientId: who.clientId,
      grid,
      name: grid.programName || "My plan",
      goals: [],
      weekOneStart: start,
      context: START_FRESH,
      history: false,
      loadsAsTargets: true,
      // Live now (and an earlier plan finished) in the same step.
      status: "ACTIVE",
    });
  } catch (err) {
    console.error("[athlete plan-import] save failed:", err);
    return NextResponse.json({ error: "Read the plan, but couldn't save it. Please try again." }, { status: 500 });
  }
  revalidatePath("/today");
  revalidatePath("/plan");
  return NextResponse.json({ ok: true });
}
