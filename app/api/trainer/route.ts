import { NextResponse } from "next/server";
import { z } from "zod";
import { getTrainer, upsertTrainer } from "@/lib/db/trainer";

const UpsertSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  voiceProfile: z.string().optional(),
});

export async function GET() {
  const trainer = await getTrainer();
  return NextResponse.json(trainer ?? null);
}

export async function POST(req: Request) {
  const body = await req.json();
  const parsed = UpsertSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const trainer = await upsertTrainer(parsed.data);
  return NextResponse.json(trainer);
}
