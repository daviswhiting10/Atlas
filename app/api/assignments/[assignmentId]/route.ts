import { NextResponse } from "next/server";
import { withWorkspace } from "@/lib/api/middleware";
import { getAssignment } from "@/lib/db/programs";
import { prisma } from "@/lib/db/client";

export const GET = withWorkspace<{ assignmentId: string }>(
  async (_req, { workspaceId }, { params }) => {
    const { assignmentId } = await params;
    const assignment = await getAssignment(assignmentId, workspaceId);
    if (!assignment) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(assignment);
  }
);

export const PATCH = withWorkspace<{ assignmentId: string }>(
  async (req, { workspaceId }, { params }) => {
    const { assignmentId } = await params;
    const body = await req.json();

    const updated = await prisma.programAssignment.updateMany({
      where: { id: assignmentId, workspaceId },
      data: {
        ...(body.status && { status: body.status }),
        ...(body.name && { name: body.name }),
        updatedAt: new Date(),
      },
    });

    if (updated.count === 0) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  }
);
