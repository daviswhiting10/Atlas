import { NextResponse } from "next/server";
import { z } from "zod";
import { withWorkspace } from "@/lib/api/middleware";
import { getLeads, createLead } from "@/lib/db/leads";

const CreateLeadSchema = z.object({
  fullName: z.string().min(1),
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().optional(),
  source: z.string().min(1),
  context: z.string().optional(),
});

export const GET = withWorkspace(async (_req, { workspaceId }) => {
  const leads = await getLeads(workspaceId);
  return NextResponse.json(leads);
});

export const POST = withWorkspace(async (req, { workspaceId }) => {
  const body = await req.json();
  const parsed = CreateLeadSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const lead = await createLead(workspaceId, {
    ...parsed.data,
    email: parsed.data.email || undefined,
  });
  return NextResponse.json(lead, { status: 201 });
});
