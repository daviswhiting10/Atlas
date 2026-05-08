import { NextResponse } from "next/server";
import { z } from "zod";
import { withWorkspace } from "@/lib/api/middleware";
import { prisma } from "@/lib/db/client";

const CreateSchema = z.object({
  clientId: z.string(),
  rawInput: z.string(),
  structuredNote: z.record(z.string(), z.unknown()),
  rpeAvg: z.number().nullable().optional(),
  date: z.string(),
});

export const POST = withWorkspace(async (req, { workspaceId }) => {
  const body = await req.json();
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { clientId, rawInput, structuredNote, rpeAvg, date } = parsed.data;

  // Verify clientId belongs to this workspace
  const client = await prisma.clientProfile.findFirst({
    where: { id: clientId, workspaceId, deletedAt: null },
    select: { id: true },
  });
  if (!client) {
    return NextResponse.json({ error: "Client not found" }, { status: 404 });
  }

  const [note] = await Promise.all([
    prisma.sessionNote.create({
      data: {
        clientId,
        rawInput,
        structuredNote: structuredNote as object,
        rpeAvg: rpeAvg ?? null,
        date: new Date(date),
      },
    }),
    prisma.clientProfile.updateMany({
      where: { id: clientId, workspaceId },
      data: { lastContactAt: new Date() },
    }),
  ]);
  return NextResponse.json(note, { status: 201 });
});
