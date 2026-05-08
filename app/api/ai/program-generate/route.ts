import { NextResponse } from "next/server";
import { z } from "zod";
import { withWorkspace } from "@/lib/api/middleware";
import { callAI, MODELS } from "@/lib/ai/client";
import { buildProgramPrompt } from "@/lib/ai/prompts/program";
import { getClient } from "@/lib/db/clients";
import { getTrainer } from "@/lib/db/trainer";
import { loadMethodology } from "@/lib/ai/methodology-loader";

const Schema = z.object({
  clientId: z.string(),
  goal: z.string(),
  durationWeeks: z.number(),
  sessionsPerWeek: z.number(),
  sessionLength: z.number(),
  equipment: z.string(),
  notes: z.string().optional(),
});

export const POST = withWorkspace(async (req, { workspaceId, userId }) => {
  const body = await req.json();
  const parsed = Schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const [client, trainer, methodology] = await Promise.all([
    getClient(parsed.data.clientId, workspaceId),
    getTrainer(workspaceId),
    loadMethodology(workspaceId, "program"),
  ]);

  if (!client) {
    return NextResponse.json({ error: "Client not found" }, { status: 404 });
  }

  const intakeSummary = client.intakeForms?.[0]?.aiSummary ?? null;

  const voiceProfile = trainer?.voiceProfile;
  const trainerVoice =
    typeof voiceProfile === "string"
      ? voiceProfile
      : voiceProfile
        ? JSON.stringify(voiceProfile)
        : null;

  const { system, user } = buildProgramPrompt({
    clientName: client.fullName,
    clientSummary: intakeSummary,
    goal: parsed.data.goal,
    durationWeeks: parsed.data.durationWeeks,
    sessionsPerWeek: parsed.data.sessionsPerWeek,
    sessionLength: parsed.data.sessionLength,
    equipment: parsed.data.equipment,
    notes: parsed.data.notes,
    trainerVoice,
    methodology,
  });

  const result = await callAI({
    system,
    user,
    model: MODELS.sonnet,
    maxTokens: 4096,
    feature: "program-generate",
    workspaceId,
    userId,
  });

  return NextResponse.json({
    program: result.content,
    tokens: { in: result.inputTokens, out: result.outputTokens },
  });
});
