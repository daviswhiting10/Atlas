import { NextResponse } from "next/server";
import { withWorkspace } from "@/lib/api/middleware";
import { prisma } from "@/lib/db/client";

export const GET = withWorkspace(async (req) => {
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
});
