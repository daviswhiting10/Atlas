import { NextResponse } from "next/server";
import { z } from "zod";
import { withWorkspace } from "@/lib/api/middleware";
import { callAI, MODELS } from "@/lib/ai/client";
import { buildOutreachPrompt } from "@/lib/ai/prompts/outreach";
import { getClient } from "@/lib/db/clients";
import { getTrainer } from "@/lib/db/trainer";
import { loadMethodology } from "@/lib/ai/methodology-loader";

const Schema = z.object({
  clientId: z.string(),
  purpose: z.string(),
  channel: z.enum(["email", "sms", "dm"]),
  context: z.string().optional(),
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
    loadMethodology(workspaceId, "outreach"),
  ]);

  if (!client) {
    return NextResponse.json({ error: "Client not found" }, { status: 404 });
  }

  const voiceProfile = trainer?.voiceProfile;
  const trainerVoice =
    typeof voiceProfile === "string"
      ? voiceProfile
      : voiceProfile
        ? JSON.stringify(voiceProfile)
        : null;

  const { system, user } = buildOutreachPrompt({
    clientName: client.fullName,
    clientStatus: client.status,
    primaryGoal: client.primaryGoal,
    recentContext: parsed.data.context,
    purpose: parsed.data.purpose,
    channel: parsed.data.channel,
    trainerVoice,
    methodology,
  });

  const result = await callAI({
    system,
    user,
    model: MODELS.haiku,
    maxTokens: 512,
    feature: "outreach-generate",
    workspaceId,
    userId,
  });

  return NextResponse.json({
    draft: result.content.trim(),
    tokens: { in: result.inputTokens, out: result.outputTokens },
  });
});
