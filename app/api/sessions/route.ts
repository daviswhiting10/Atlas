import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/client";

const CreateSchema = z.object({
  clientId: z.string(),
  rawInput: z.string(),
  structuredNote: z.record(z.string(), z.unknown()),
  rpeAvg: z.number().nullable().optional(),
  date: z.string(),
});

export async function POST(req: Request) {
  const body = await req.json();
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { clientId, rawInput, structuredNote, rpeAvg, date } = parsed.data;
  const note = await prisma.sessionNote.create({
    data: {
      clientId,
      rawInput,
      structuredNote: JSON.stringify(structuredNote),
      rpeAvg: rpeAvg ?? null,
      date: new Date(date),
    },
  });
  return NextResponse.json(note, { status: 201 });
}
