import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/client";

export async function GET() {
  const programs = await prisma.program.findMany({
    orderBy: { createdAt: "desc" },
    include: { client: { select: { id: true, fullName: true } } },
  });
  return NextResponse.json(programs);
}

const CreateSchema = z.object({
  clientId: z.string(),
  name: z.string(),
  goal: z.string(),
  durationWeeks: z.number(),
  structure: z.string(),
  notes: z.string().optional(),
});

export async function POST(req: Request) {
  const body = await req.json();
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const program = await prisma.program.create({ data: parsed.data });
  return NextResponse.json(program, { status: 201 });
}
