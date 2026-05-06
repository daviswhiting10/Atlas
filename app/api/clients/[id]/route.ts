import { NextResponse } from "next/server";
import { z } from "zod";
import { getClient, updateClient, deleteClient } from "@/lib/db/clients";

const UpdateSchema = z.object({
  fullName: z.string().min(1).optional(),
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().optional(),
  primaryGoal: z.string().optional(),
  status: z.enum(["PROSPECT", "ACTIVE", "AT_RISK", "CHURNED"]).optional(),
});

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const client = await getClient(id);
  if (!client) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(client);
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();
  const parsed = UpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const client = await updateClient(id, parsed.data);
  return NextResponse.json(client);
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await deleteClient(id);
  return NextResponse.json({ ok: true });
}
