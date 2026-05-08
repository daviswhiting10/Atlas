import { NextResponse } from "next/server";
import { z } from "zod";
import { withWorkspace } from "@/lib/api/middleware";
import { getClients, createClient } from "@/lib/db/clients";

const CreateClientSchema = z.object({
  fullName: z.string().min(1),
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().optional(),
  primaryGoal: z.string().optional(),
  status: z.enum(["PROSPECT", "ACTIVE", "AT_RISK", "CHURNED"]).optional(),
});

export const GET = withWorkspace(async (_req, { workspaceId }) => {
  const clients = await getClients(workspaceId);
  return NextResponse.json(clients);
});

export const POST = withWorkspace(async (req, { workspaceId }) => {
  const body = await req.json();
  const parsed = CreateClientSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const client = await createClient(workspaceId, {
    ...parsed.data,
    email: parsed.data.email || undefined,
  });
  return NextResponse.json(client, { status: 201 });
});
