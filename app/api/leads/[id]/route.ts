import { NextResponse } from "next/server";
import { z } from "zod";
import { withWorkspace } from "@/lib/api/middleware";
import { getLead, updateLead } from "@/lib/db/leads";

const UpdateSchema = z.object({
  fullName: z.string().min(1).optional(),
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().optional(),
  source: z.string().optional(),
  context: z.string().optional(),
  status: z
    .enum(["NEW", "CONTACTED", "REPLIED", "BOOKED", "CONVERTED", "DEAD"])
    .optional(),
});

export const GET = withWorkspace<{ id: string }>(
  async (_req, { workspaceId }, { params }) => {
    const { id } = await params;
    const lead = await getLead(id, workspaceId);
    if (!lead) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(lead);
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
    await updateLead(id, workspaceId, parsed.data);
    const updated = await getLead(id, workspaceId);
    return NextResponse.json(updated);
  }
);
