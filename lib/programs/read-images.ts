import { callAIVision, MODELS, type ImageInput } from "@/lib/ai/client";
import { buildProgramImportPrompt } from "@/lib/ai/prompts/program-import";
import { resolveExercise } from "@/lib/programs/resolve-exercise";
import { NO_CONTEXT, contextFromModel, contextFromText, contextWarnings, describeReadAs, mergeContext } from "@/lib/programs/plan-context";
import type { ImportedProgram } from "@/lib/programs/screenshot-program";

// ─── What the vision reader returns ───────────────────────────────────────

type ParsedExercise = {
  name: string;
  sets: number;
  repMin: number;
  repMax: number;
  unit: "reps" | "secs";
  loadNote: string;
  tempo: string;
  restSeconds: number | null;
  notes: string;
};

type ParsedSection = { name: string; exercises: ParsedExercise[] };
type ParsedDay = { name: string; dayOfWeek: number; sections: ParsedSection[] };
type ParsedProgram = {
  programName: string;
  description: string;
  durationWeeks: number;
  days: ParsedDay[];
  context?: unknown;
};


export class ReadError extends Error {
  constructor(message: string, readonly status: number, readonly raw?: string) {
    super(message);
  }
}

/**
 * Read photos (screenshots, or the pages of a PDF rendered to images) of a plan into a program, in the shape the
 * program builder uses. Shared by the coach's photo import and the athlete's own import. Nothing is saved.
 */
export async function readProgramFromImages({
  images,
  notes,
  workspaceId,
  userId,
  feature = "program-import",
}: {
  images: ImageInput[];
  notes?: string;
  workspaceId: string;
  userId: string;
  feature?: string;
}): Promise<{ program: ImportedProgram; readAs: string; warnings: string[] }> {
  // Step 1: Parse all images in one Vision call
  const { system, user } = buildProgramImportPrompt(images.length, notes);
  let rawContent: string;
  try {
    const result = await callAIVision({
      system,
      user,
      images,
      model: MODELS.sonnet,
      maxTokens: 8192,
      feature,
      workspaceId,
      userId,
    });
    rawContent = result.content;
  } catch (err) {
    console.error("[program-import] AI call failed:", err);
    throw new ReadError("AI parsing failed", 500);
  }

  // Step 2: Parse JSON
  let parsed: ParsedProgram;
  try {
    const cleaned = rawContent
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```\s*$/, "")
      .trim();
    parsed = JSON.parse(cleaned) as ParsedProgram;
  } catch {
    console.error("[program-import] JSON parse failed. Raw:", rawContent.slice(0, 500));
    throw new ReadError("Could not parse AI response as JSON", 422, rawContent);
  }

  // Step 3: Resolve all unique exercise names → DB ids
  const allNames = new Set<string>();
  for (const day of parsed.days) {
    for (const section of day.sections) {
      for (const ex of section.exercises) {
        allNames.add(ex.name);
      }
    }
  }

  const nameToId = new Map<string, { id: string; name: string }>();
  await Promise.all(
    Array.from(allNames).map(async (name) => {
      const resolved = await resolveExercise(name, workspaceId);
      nameToId.set(name, resolved);
    })
  );

  // Step 4: Build ProgramBuilder-compatible state
  let _keyCounter = 0;
  function key() { return `k${++_keyCounter}`; }

  const days = parsed.days.map((day, dIdx) => ({
    _key: key(),
    name: day.name,
    dayOfWeek: Math.max(1, Math.min(7, day.dayOfWeek)),
    order: dIdx + 1,
    open: true,
    sections: day.sections.map((section) => ({
      _key: key(),
      name: section.name,
      open: true,
      exercises: section.exercises.map((ex, eIdx) => {
        const resolved = nameToId.get(ex.name)!;
        const numSets = Math.max(1, ex.sets);
        const prescribedSets = Array.from({ length: numSets }, (_, i) => ({
          setNumber: i + 1,
          weight: null as number | null,
          isBodyweight: false,
          repMin: ex.repMin,
          repMax: ex.repMax,
          unit: ex.unit ?? "reps",
          rpe: null as number | null,
          restSeconds: ex.restSeconds ?? null,
          notes: [ex.loadNote, ex.tempo].filter(Boolean).join(" | ") || "",
        }));
        return {
          _key: key(),
          exerciseId: resolved.id,
          exerciseName: resolved.name,
          order: eIdx + 1,
          prescribedSets,
          notes: ex.notes ?? "",
        };
      }),
    })),
  }));

  // The coach's note beats what the screenshot suggests.
  const context = notes?.trim() ? mergeContext(contextFromText(notes), contextFromModel(parsed.context)) : NO_CONTEXT;
  const durationWeeks = context.durationWeeks ?? Math.max(1, Math.round(parsed.durationWeeks || 1));

  const programState = {
    name: parsed.programName || "Imported Program",
    description: parsed.description || "",
    durationWeeks,
    goals: [] as string[],
    conditions: [] as string[],
    days,
  };

  return {
    program: programState as ImportedProgram,
    readAs: describeReadAs({ weeks: durationWeeks, days: days.length }),
    warnings: contextWarnings(context, { days: days.length }, "screenshot"),
  };
}
