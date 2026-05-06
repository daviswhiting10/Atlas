import { NextResponse } from "next/server";
import { z } from "zod";
import { callAI, MODELS } from "@/lib/ai/client";
import { buildProgramPrompt } from "@/lib/ai/prompts/program";
import { getClient } from "@/lib/db/clients";
import { getTrainer } from "@/lib/db/trainer";
import { prisma } from "@/lib/db/client";

const Schema = z.object({
  clientId: z.string(),
  goal: z.string(),
  durationWeeks: z.number(),
  sessionsPerWeek: z.number(),
  sessionLength: z.number(),
  equipment: z.string(),
  notes: z.string().optional(),
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

  // Get AI summary from most recent intake if available
  const intakeSummary = client.intakeForms?.[0]?.aiSummary ?? null;

  const { system, user } = buildProgramPrompt({
    clientName: client.fullName,
    clientSummary: intakeSummary,
    goal: parsed.data.goal,
    durationWeeks: parsed.data.durationWeeks,
    sessionsPerWeek: parsed.data.sessionsPerWeek,
    sessionLength: parsed.data.sessionLength,
    equipment: parsed.data.equipment,
    notes: parsed.data.notes,
    trainerVoice: trainer?.voiceProfile ?? null,
  });

  // Programs are long — use Sonnet with higher token limit
  const result = await callAI({
    system,
    user,
    model: MODELS.sonnet,
    maxTokens: 4096,
  });

  return NextResponse.json({
    program: result.content,
    tokens: { in: result.inputTokens, out: result.outputTokens },
  });
}
