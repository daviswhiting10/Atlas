import { NextResponse } from "next/server";
import { z } from "zod";
import { getLead, updateLead } from "@/lib/db/leads";

const UpdateSchema = z.object({
  fullName: z.string().min(1).optional(),
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().optional(),
  source: z.string().optional(),
  context: z.string().optional(),
  status: z.enum(["new", "contacted", "replied", "booked", "converted", "dead"]).optional(),
});

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const lead = await getLead(id);
  if (!lead) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(lead);
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();
  const parsed = UpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const lead = await updateLead(id, parsed.data);
  return NextResponse.json(lead);
}
