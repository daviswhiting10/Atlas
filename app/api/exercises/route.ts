import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db/client";
import { MovementPattern } from "@/app/generated/prisma/client";

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role === "CLIENT") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const q = url.searchParams.get("q")?.trim() ?? "";
  const pattern = url.searchParams.get("pattern") ?? undefined;
  const equipment = url.searchParams.get("equipment") ?? undefined;

  const exercises = await prisma.exercise.findMany({
    where: {
      // "atlas-" entries belong to the plan generator's own catalog; hiding
      // them keeps the coach's picker free of near-duplicates.
      NOT: { slug: { startsWith: "atlas-" } },
      // The shared library, plus exercises private to this coach's workspace.
      OR: [{ workspaceId: null }, ...(session.user.workspaceId ? [{ workspaceId: session.user.workspaceId }] : [])],
      ...(q && { name: { contains: q, mode: "insensitive" } }),
      ...(pattern && { movementPattern: pattern as never }),
      ...(equipment && { equipment }),
    },
    select: {
      id: true,
      name: true,
      movementPattern: true,
      equipment: true,
      primaryMuscles: true,
      gifUrl: true,
    },
    orderBy: { name: "asc" },
    take: 50,
  });

  return NextResponse.json(exercises);
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role === "CLIENT") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!session.user.workspaceId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const name = typeof body.name === "string" ? body.name.trim().slice(0, 120) : "";
  if (!name) {
    return NextResponse.json({ error: "Give the exercise a name." }, { status: 400 });
  }
  // Pattern and equipment are optional: worked out from the name when not given.
  const movementPattern: MovementPattern = Object.values(MovementPattern).includes(body.movementPattern) ? body.movementPattern : guessPattern(name);
  const equipment = typeof body.equipment === "string" && body.equipment.trim() ? body.equipment.trim().slice(0, 60) : guessEquipment(name);

  // Generate unique slug from name + timestamp
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")
    + "-" + Date.now();

  const exercise = await prisma.exercise.create({
    data: {
      name,
      slug,
      movementPattern,
      equipment,
      primaryMuscles: [],
      secondaryMuscles: [],
      instructions: [],
      // Private to this workspace: one coach's custom exercise never appears in anyone else's library.
      workspaceId: session.user.workspaceId ?? null,
    },
    select: { id: true, name: true, movementPattern: true, equipment: true },
  });

  return NextResponse.json(exercise, { status: 201 });
}

/** A movement pattern from an exercise's name. It only steers load steps (lower body moves in bigger jumps). */
function guessPattern(name: string): MovementPattern {
  const n = name.toLowerCase();
  if (/squat|leg press|step.?up/.test(n)) return MovementPattern.SQUAT;
  if (/dead ?lift|rdl|hinge|swing|good morning|hip thrust|bridge/.test(n)) return MovementPattern.HINGE;
  if (/lunge|split/.test(n)) return MovementPattern.LUNGE;
  if (/carry/.test(n)) return MovementPattern.CARRY;
  if (/overhead|shoulder press|military|ohp/.test(n)) return MovementPattern.VERTICAL_PUSH;
  if (/bench|push.?up|chest|press|dip/.test(n)) return MovementPattern.HORIZONTAL_PUSH;
  if (/pull.?up|chin|lat |pulldown|pull-down/.test(n)) return MovementPattern.VERTICAL_PULL;
  if (/row|face pull|pull.?apart/.test(n)) return MovementPattern.HORIZONTAL_PULL;
  if (/plank|pallof|dead ?bug|bird ?dog/.test(n)) return MovementPattern.ANTI_ROTATION;
  if (/twist|chop|rotation/.test(n)) return MovementPattern.ROTATION;
  return MovementPattern.LOCOMOTION;
}

function guessEquipment(name: string): string {
  const n = name.toLowerCase();
  if (/barbell|\bbb\b/.test(n)) return "barbell";
  if (/dumbbell|\bdb\b/.test(n)) return "dumbbell";
  if (/kettlebell|\bkb\b/.test(n)) return "kettlebell";
  if (/band/.test(n)) return "band";
  if (/cable/.test(n)) return "cable";
  if (/machine|leg press|pulldown/.test(n)) return "machine";
  if (/push.?up|plank|bodyweight|\bbw\b|pull.?up|chin/.test(n)) return "bodyweight";
  return "other";
}
