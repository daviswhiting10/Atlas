import { NextResponse } from "next/server";
import { z } from "zod";
import { withWorkspace } from "@/lib/api/middleware";
import { getClient, updateClient, deleteClient } from "@/lib/db/clients";

const UpdateSchema = z.object({
  fullName: z.string().min(1).optional(),
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().optional(),
  primaryGoal: z.string().optional(),
  status: z.enum(["PROSPECT", "ACTIVE", "AT_RISK", "CHURNED"]).optional(),
});

export const GET = withWorkspace<{ id: string }>(
  async (_req, { workspaceId }, { params }) => {
    const { id } = await params;
    const client = await getClient(id, workspaceId);
    if (!client) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(client);
  }
);

export const PATCH = withWorkspace<{ id: string }>(
  async (req, { workspaceId }, { params }) => {
    const { id } = await params;
    const body = await req.json();
    const parsed = UpdateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }
    await updateClient(id, workspaceId, parsed.data);
    const updated = await getClient(id, workspaceId);
    return NextResponse.json(updated);
  }
);

export const DELETE = withWorkspace<{ id: string }>(
  async (_req, { workspaceId }, { params }) => {
    const { id } = await params;
    await deleteClient(id, workspaceId);
    return NextResponse.json({ ok: true });
  }
);
