import { NextResponse } from "next/server";
import { z } from "zod";
import { withWorkspace } from "@/lib/api/middleware";
import { prisma } from "@/lib/db/client";

const CreateSchema = z.object({
  clientId: z.string(),
  name: z.string(),
  goal: z.string(),
  durationWeeks: z.number(),
  markdownBlob: z.string().optional(),
  structure: z.unknown().optional(),
  notes: z.string().optional(),
});

export const GET = withWorkspace(async (_req, { workspaceId }) => {
  const programs = await prisma.program.findMany({
    where: {
      deletedAt: null,
      client: { workspaceId },
    },
    orderBy: { createdAt: "desc" },
    include: {
      client: { select: { id: true, fullName: true } },
    },
  });
  return NextResponse.json(programs);
});

export const POST = withWorkspace(async (req, { workspaceId }) => {
  const body = await req.json();
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  // Verify clientId belongs to this workspace
  const client = await prisma.clientProfile.findFirst({
    where: { id: parsed.data.clientId, workspaceId, deletedAt: null },
    select: { id: true },
  });
  if (!client) {
    return NextResponse.json({ error: "Client not found" }, { status: 404 });
  }

  const program = await prisma.program.create({
    data: {
      clientId: parsed.data.clientId,
      name: parsed.data.name,
      goal: parsed.data.goal,
      durationWeeks: parsed.data.durationWeeks,
      markdownBlob: parsed.data.markdownBlob,
      structure: parsed.data.structure ?? undefined,
    },
  });
  return NextResponse.json(program, { status: 201 });
});
