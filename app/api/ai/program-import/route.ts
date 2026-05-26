import { NextResponse } from "next/server";
import { withWorkspace } from "@/lib/api/middleware";
import { callAIVision, MODELS } from "@/lib/ai/client";
import { buildProgramImportPrompt } from "@/lib/ai/prompts/program-import";
import { prisma } from "@/lib/db/client";
import { MovementPattern } from "@/app/generated/prisma/client";

// ─── Types matching ProgramBuilder's internal state ─────────────────────────

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
};

// ─── Exercise resolver ───────────────────────────────────────────────────────

// Returns the DB exercise id for a given name, creating it if it doesn't exist.
async function resolveExercise(name: string): Promise<{ id: string; name: string }> {
  // 1) exact match
  let ex = await prisma.exercise.findFirst({
    where: { name: { equals: name, mode: "insensitive" } },
    select: { id: true, name: true },
  });
  if (ex) return ex;

  // 2) contains match (pick the closest / first alphabetically)
  ex = await prisma.exercise.findFirst({
    where: { name: { contains: name, mode: "insensitive" } },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
  if (ex) return ex;

  // 3) create a new global exercise
  const slug =
    name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") +
    "-" +
    Date.now();
  const created = await prisma.exercise.create({
    data: {
      name,
      slug,
      movementPattern: MovementPattern.LOCOMOTION, // placeholder — user can edit
      equipment: "other",
      primaryMuscles: [],
      secondaryMuscles: [],
      instructions: [],
      workspaceId: null,
    },
    select: { id: true, name: true },
  });
  return created;
}

// ─── Route ───────────────────────────────────────────────────────────────────

export const POST = withWorkspace(async (req, { workspaceId, userId }) => {
  const formData = await req.formData();
  const imageFile = formData.get("image") as File | null;
  const notes = (formData.get("notes") as string | null) ?? undefined;

  if (!imageFile) {
    return NextResponse.json({ error: "image is required" }, { status: 400 });
  }

  // Validate type
  const allowed = ["image/png", "image/jpeg", "image/gif", "image/webp"] as const;
  type AllowedType = (typeof allowed)[number];
  if (!allowed.includes(imageFile.type as AllowedType)) {
    return NextResponse.json(
      { error: "Image must be PNG, JPEG, GIF, or WebP" },
      { status: 400 }
    );
  }

  // Convert to base64
  const arrayBuffer = await imageFile.arrayBuffer();
  const base64 = Buffer.from(arrayBuffer).toString("base64");

  // Step 1: Parse image with Claude Vision
  const { system, user } = buildProgramImportPrompt(notes);
  let rawContent: string;
  try {
    const result = await callAIVision({
      system,
      user,
      imageBase64: base64,
      mediaType: imageFile.type as AllowedType,
      model: MODELS.sonnet,
      maxTokens: 4096,
      feature: "program-import",
      workspaceId,
      userId,
    });
    rawContent = result.content;
  } catch (err) {
    console.error("[program-import] AI call failed:", err);
    return NextResponse.json({ error: "AI parsing failed" }, { status: 500 });
  }

  // Step 2: Parse JSON from AI response
  let parsed: ParsedProgram;
  try {
    // Strip potential markdown fences in case the model adds them anyway
    const cleaned = rawContent
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```\s*$/, "")
      .trim();
    parsed = JSON.parse(cleaned) as ParsedProgram;
  } catch {
    console.error("[program-import] JSON parse failed. Raw:", rawContent.slice(0, 500));
    return NextResponse.json(
      { error: "Could not parse AI response as JSON", raw: rawContent },
      { status: 422 }
    );
  }

  // Step 3: Resolve all exercise names → DB ids
  // Collect all unique exercise names first to avoid duplicate DB calls
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
      const resolved = await resolveExercise(name);
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

        // Build prescribed sets
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

  const programState = {
    name: parsed.programName || "Imported Program",
    description: parsed.description || "",
    durationWeeks: parsed.durationWeeks || 1,
    goals: [] as string[],
    conditions: [] as string[],
    days,
  };

  return NextResponse.json({ program: programState });
});
