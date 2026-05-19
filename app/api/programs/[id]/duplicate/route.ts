import { NextResponse } from "next/server";
import { withWorkspace } from "@/lib/api/middleware";
import { duplicateProgram } from "@/lib/db/programs";

export const POST = withWorkspace<{ id: string }>(
  async (_req, { workspaceId }, { params }) => {
    const { id } = await params;
    const copy = await duplicateProgram(id, workspaceId);
    if (!copy) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(copy, { status: 201 });
  }
);
