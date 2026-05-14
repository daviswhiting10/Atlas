import { NextResponse } from "next/server";
import { withWorkspace } from "@/lib/api/middleware";
import { assignProgram } from "@/lib/db/programs";
import { AssignProgramSchema } from "@/lib/validations/program";
import { prisma } from "@/lib/db/client";

export const POST = withWorkspace<{ id: string }>(
  async (req, { workspaceId }, { params }) => {
    const { id: programId } = await params;
    const body = await req.json();
    const parsed = AssignProgramSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    // Verify client belongs to this workspace
    const client = await prisma.clientProfile.findFirst({
      where: { id: parsed.data.clientId, workspaceId, deletedAt: null },
      select: { id: true },
    });
    if (!client) {
      return NextResponse.json({ error: "Client not found" }, { status: 404 });
    }

    const assignment = await assignProgram(
      workspaceId,
      programId,
      parsed.data.clientId,
      new Date(parsed.data.startDate),
      parsed.data.name
    );

    return NextResponse.json(assignment, { status: 201 });
  }
);
