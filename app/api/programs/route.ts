import { NextResponse } from "next/server";
import { withWorkspace } from "@/lib/api/middleware";
import { getPrograms, upsertProgram } from "@/lib/db/programs";
import { ProgramBodySchema } from "@/lib/validations/program";

export const GET = withWorkspace(async (_req, { workspaceId }) => {
  const programs = await getPrograms(workspaceId);
  return NextResponse.json(programs);
});

export const POST = withWorkspace(async (req, { workspaceId }) => {
  const body = await req.json();
  const parsed = ProgramBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  try {
    const program = await upsertProgram(workspaceId, parsed.data);
    return NextResponse.json(program, { status: 201 });
  } catch (err) {
    console.error("[POST /api/programs]", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: { formErrors: [message], fieldErrors: {} } }, { status: 500 });
  }
});
