import { NextResponse } from "next/server";
import { withWorkspace } from "@/lib/api/middleware";
import { callAIVision, MODELS, type ImageInput } from "@/lib/ai/client";
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

const ALLOWED_TYPES = [
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
] as const;
type AllowedType = (typeof ALLOWED_TYPES)[number];

// ─── Exercise resolver ───────────────────────────────────────────────────────

async function resolveExercise(name: string): Promise<{ id: string; name: string }> {
  // 1) exact match
  let ex = await prisma.exercise.findFirst({
    where: { name: { equals: name, mode: "insensitive" } },
    select: { id: true, name: true },
  });
  if (ex) return ex;

  // 2) contains match
  ex = await prisma.exercise.findFirst({
    where: { name: { contains: name, mode: "insensitive" } },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
  if (ex) return ex;

  // 3) auto-create as a global exercise
  const slug =
    name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") +
    "-" +
    Date.now();
  return prisma.exercise.create({
    data: {
      name,
      slug,
      movementPattern: MovementPattern.LOCOMOTION, // placeholder
      equipment: "other",
      primaryMuscles: [],
      secondaryMuscles: [],
      instructions: [],
      workspaceId: null,
    },
    select: { id: true, name: true },
  });
}

// ─── Route ───────────────────────────────────────────────────────────────────

export const POST = withWorkspace(async (req, { workspaceId, userId }) => {
  const formData = await req.formData();
  const notes = (formData.get("notes") as string | null) ?? undefined;

  // Collect images — sent as image0, image1, image2 … from the client
  const images: ImageInput[] = [];
  let idx = 0;
  while (true) {
    const file = formData.get(`image${idx}`) as File | null;
    if (!file) break;
    if (!ALLOWED_TYPES.includes(file.type as AllowedType)) {
      return NextResponse.json(
        { error: `image${idx}: must be PNG, JPEG, GIF, or WebP` },
        { status: 400 }
      );
    }
    const buf = await file.arrayBuffer();
    images.push({
      base64: Buffer.from(buf).toString("base64"),
      mediaType: file.type as AllowedType,
    });
    idx++;
  }

  if (images.length === 0) {
    return NextResponse.json({ error: "At least one image is required" }, { status: 400 });
  }

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
      feature: "program-import",
      workspaceId,
      userId,
    });
    rawContent = result.content;
  } catch (err) {
    console.error("[program-import] AI call failed:", err);
    return NextResponse.json({ error: "AI parsing failed" }, { status: 500 });
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
    return NextResponse.json(
      { error: "Could not parse AI response as JSON", raw: rawContent },
      { status: 422 }
    );
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
