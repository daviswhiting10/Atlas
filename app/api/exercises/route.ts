import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db/client";
import { MovementPattern } from "@/app/generated/prisma/client";

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const q = url.searchParams.get("q")?.trim() ?? "";
  const pattern = url.searchParams.get("pattern") ?? undefined;
  const equipment = url.searchParams.get("equipment") ?? undefined;

  const exercises = await prisma.exercise.findMany({
    where: {
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

  const body = await req.json();
  const { name, movementPattern, equipment } = body;

  if (!name || !movementPattern || !equipment) {
    return NextResponse.json({ error: "name, movementPattern, and equipment are required" }, { status: 400 });
  }

  if (!Object.values(MovementPattern).includes(movementPattern)) {
    return NextResponse.json({ error: "Invalid movementPattern" }, { status: 400 });
  }

  // Generate unique slug from name + timestamp
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")
    + "-" + Date.now();

  const exercise = await prisma.exercise.create({
    data: {
      name,
      slug,
      movementPattern: movementPattern as MovementPattern,
      equipment,
      primaryMuscles: [],
      secondaryMuscles: [],
      instructions: [],
      workspaceId: null, // global — available to all clients
    },
    select: { id: true, name: true, movementPattern: true, equipment: true },
  });

  return NextResponse.json(exercise, { status: 201 });
}
