import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db/client";
import { GUEST_EMAIL_DOMAIN } from "@/lib/guest";
import { athleteIdentity } from "@/lib/athlete/identity";
import { IMPORTS_PER_DAY, canImportPlan } from "@/lib/athlete/empty-state";
import { previewFromGrid } from "@/lib/athlete/plan-import";
import { callAI, callAIVision, MODELS, type ImageInput } from "@/lib/ai/client";
import { buildProgramPagesPrompt, buildProgramSheetPrompt } from "@/lib/ai/prompts/program-import";
import { MAX_PDF_PAGES, PdfError, isPdf, pdfToImages } from "@/lib/programs/pdf-pages";
import { PHOTO_TYPES } from "@/lib/programs/screenshot-program";
import { MAX_UPLOAD_BYTES, tooBigMessage } from "@/lib/athlete/upload-limits";
import { readGrid } from "@/lib/programs/sheet-plan";
import { contextWarnings, type PlanContext } from "@/lib/programs/plan-context";
import { summarizeSheetImport } from "@/lib/programs/sheet-summary";
import { saveSheetPlan } from "@/lib/programs/save-sheet-plan";
import { tidyCsv } from "@/lib/programs/sheet";
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
  if (!form) return NextResponse.json({ error: "Choose a PDF, a spreadsheet or screenshots of the plan." }, { status: 400 });
  const files = Array.from(form.entries()).filter(([k, v]) => k.startsWith("file") && v instanceof File).map(([, v]) => v as File);
  const csv = typeof form.get("csv") === "string" ? (form.get("csv") as string) : "";
  if (files.length === 0 && !csv) return NextResponse.json({ error: "Choose a PDF, a spreadsheet or screenshots of the plan." }, { status: 400 });
  const bytes = files.reduce((n, f) => n + f.size, 0);
  if (bytes > MAX_UPLOAD_BYTES) return NextResponse.json({ error: tooBigMessage(bytes, files.some((f) => f.type === "application/pdf")) }, { status: 413 });

  if (!burst(who.userId)) return NextResponse.json({ error: "One at a time: wait a moment and try again." }, { status: 429 });
  if ((await readsToday(who.userId)) >= IMPORTS_PER_DAY) {
    return NextResponse.json({ error: `That's ${IMPORTS_PER_DAY} plans read today. Try again tomorrow, or build it with Atlas now.` }, { status: 429 });
  }

  // A spreadsheet (CSV, made in the browser) or images (a PDF's pages, or screenshots): either way into the same grid,
  // so each week keeps its own sets, reps and weights.
  const feature = csv ? "athlete-plan-import-sheet" : "athlete-plan-import";
  const warnings: string[] = [];
  let reply: string;
  try {
    if (csv) {
      const tidy = tidyCsv(csv);
      if (tidy.length < 10) return NextResponse.json({ error: "That sheet looks empty." }, { status: 400 });
      const { system, user } = buildProgramSheetPrompt(tidy, undefined);
      reply = (await callAI({ system, user, model: MODELS.sonnet, maxTokens: 16000, feature, workspaceId: who.workspaceId, userId: who.userId })).content;
    } else {
      const images: ImageInput[] = [];
      for (const f of files) {
        const bytes = new Uint8Array(await f.arrayBuffer());
        if (f.type === "application/pdf" || isPdf(bytes)) {
          const pdf = await pdfToImages(bytes);
          images.push(...pdf.images);
          if (pdf.truncated) warnings.push(`Read the first ${MAX_PDF_PAGES} of ${pdf.pages} pages.`);
        } else if (PHOTO_TYPES.includes(f.type)) {
          images.push({ base64: Buffer.from(bytes).toString("base64"), mediaType: f.type as ImageInput["mediaType"] });
        } else {
          return NextResponse.json({ error: "Choose a PDF, a spreadsheet or screenshots of the plan." }, { status: 400 });
        }
      }
      if (images.length > MAX_PDF_PAGES) images.length = MAX_PDF_PAGES;
      const { system, user } = buildProgramPagesPrompt(images.length);
      reply = (await callAIVision({ system, user, images, model: MODELS.sonnet, maxTokens: 16000, feature, workspaceId: who.workspaceId, userId: who.userId })).content;
    }
  } catch (err) {
    if (err instanceof PdfError) return NextResponse.json({ error: err.message }, { status: 400 });
    console.error("[athlete plan-import] read failed:", err);
    return NextResponse.json({ error: "Couldn't read the plan right now. Please try again." }, { status: 502 });
  }
  const grid = readGrid(reply);
  if (!grid) return NextResponse.json({ error: "Couldn't find a plan in that. Check it lists exercises with sets and reps." }, { status: 422 });
  const summary = summarizeSheetImport({ grid, context: START_FRESH, weekOneStart: null, today: new Date() });
  return NextResponse.json({
    grid,
    readAs: summary.readAs,
    preview: previewFromGrid(grid, START_FRESH),
    warnings: [...warnings, ...contextWarnings(START_FRESH, { days: summary.daysPerWeek }, "sheet")],
  });
}

async function save(req: Request, who: { userId: string; workspaceId: string; clientId: string; name: string }) {
  const parsed = Save.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Read the plan again, then save." }, { status: 400 });
  const start = new Date(`${parsed.data.startDate}T00:00:00`);

  try {
    const grid = readGrid(JSON.stringify(parsed.data.grid));
    if (!grid) return NextResponse.json({ error: "Read the plan again, then save." }, { status: 400 });
    const { assignmentId } = await saveSheetPlan({
      workspaceId: who.workspaceId,
      clientId: who.clientId,
      grid,
      name: grid.programName || "My plan",
      goals: [],
      weekOneStart: start,
      context: START_FRESH,
      history: false,
      loadsAsTargets: true,
    });
    // It is the plan now; an earlier one is finished (its history stays).
    await prisma.programAssignment.update({ where: { id: assignmentId }, data: { status: "ACTIVE" } });
    await prisma.programAssignment.updateMany({ where: { clientId: who.clientId, workspaceId: who.workspaceId, status: "ACTIVE", NOT: { id: assignmentId } }, data: { status: "COMPLETED" } });
  } catch (err) {
    console.error("[athlete plan-import] save failed:", err);
    return NextResponse.json({ error: "Read the plan, but couldn't save it. Please try again." }, { status: 500 });
  }
  revalidatePath("/today");
  revalidatePath("/plan");
  return NextResponse.json({ ok: true });
}
