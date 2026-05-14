import { NextResponse } from "next/server";
import { withWorkspace } from "@/lib/api/middleware";
import { getProgram, upsertProgram, softDeleteProgram } from "@/lib/db/programs";
import { ProgramBodySchema } from "@/lib/validations/program";

export const GET = withWorkspace<{ id: string }>(
  async (_req, { workspaceId }, { params }) => {
    const { id } = await params;
    const program = await getProgram(id, workspaceId);
    if (!program) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(program);
  }
);

export const PATCH = withWorkspace<{ id: string }>(
  async (req, { workspaceId }, { params }) => {
    const { id } = await params;
    const existing = await getProgram(id, workspaceId);
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const body = await req.json();
    const parsed = ProgramBodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const program = await upsertProgram(workspaceId, parsed.data, id);
    return NextResponse.json(program);
  }
);

export const DELETE = withWorkspace<{ id: string }>(
  async (_req, { workspaceId }, { params }) => {
    const { id } = await params;
    await softDeleteProgram(id, workspaceId);
    return NextResponse.json({ ok: true });
  }
);
