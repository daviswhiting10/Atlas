import { NextResponse } from "next/server";
import { z } from "zod";
import { getLeads, createLead } from "@/lib/db/leads";

const CreateLeadSchema = z.object({
  fullName: z.string().min(1),
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().optional(),
  source: z.string().min(1),
  context: z.string().optional(),
});

export async function GET() {
  const leads = await getLeads();
  return NextResponse.json(leads);
}

export async function POST(req: Request) {
  const body = await req.json();
  const parsed = CreateLeadSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const lead = await createLead({
    ...parsed.data,
    email: parsed.data.email || undefined,
  });
  return NextResponse.json(lead, { status: 201 });
}
