import { NextResponse } from "next/server";
import { z } from "zod";
import { callAI, MODELS } from "@/lib/ai/client";
import { buildOutreachPrompt } from "@/lib/ai/prompts/outreach";
import { getClient } from "@/lib/db/clients";
import { getTrainer } from "@/lib/db/trainer";

const Schema = z.object({
  clientId: z.string(),
  purpose: z.string(),
  channel: z.enum(["email", "sms", "dm"]),
  context: z.string().optional(),
});

export async function POST(req: Request) {
  const body = await req.json();
  const parsed = Schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const [client, trainer] = await Promise.all([
    getClient(parsed.data.clientId),
    getTrainer(),
  ]);

  if (!client) {
    return NextResponse.json({ error: "Client not found" }, { status: 404 });
  }

  const { system, user } = buildOutreachPrompt({
    clientName: client.fullName,
    clientStatus: client.status,
    primaryGoal: client.primaryGoal,
    recentContext: parsed.data.context,
    purpose: parsed.data.purpose,
    channel: parsed.data.channel,
    trainerVoice: trainer?.voiceProfile ?? null,
  });

  // Use Haiku for short outreach messages — fast and cheap
  const result = await callAI({ system, user, model: MODELS.haiku, maxTokens: 512 });

  return NextResponse.json({
    draft: result.content.trim(),
    tokens: { in: result.inputTokens, out: result.outputTokens },
  });
}
