import { NextResponse } from "next/server";
import { z } from "zod";
import { withWorkspace } from "@/lib/api/middleware";
import { callAI, MODELS } from "@/lib/ai/client";
import { buildIntakePrompt } from "@/lib/ai/prompts/intake";
import { getClient } from "@/lib/db/clients";
import { loadMethodology } from "@/lib/ai/methodology-loader";
import { prisma } from "@/lib/db/client";

const Schema = z.object({
  clientId: z.string(),
  formData: z.record(z.string(), z.string()),
});

export const POST = withWorkspace(async (req, { workspaceId, userId }) => {
  const body = await req.json();
  const parsed = Schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const [client, methodology] = await Promise.all([
    getClient(parsed.data.clientId, workspaceId),
    loadMethodology(workspaceId, "intake"),
  ]);
  if (!client) {
    return NextResponse.json({ error: "Client not found" }, { status: 404 });
  }

  const { system, user } = buildIntakePrompt({
    formData: parsed.data.formData,
    clientName: client.fullName,
    methodology,
  });

  const result = await callAI({
    system,
    user,
    model: MODELS.sonnet,
    maxTokens: 1024,
    feature: "intake-extract",
    workspaceId,
    userId,
  });

  let extracted: {
    aiSummary: string;
    redFlags: Array<{ issue: string; severity: string; recommendedAction: string }>;
    parsedData: Record<string, unknown>;
  };

  try {
    const cleaned = result.content.replace(/^```json\n?|\n?```$/g, "").trim();
    extracted = JSON.parse(cleaned);
  } catch {
    return NextResponse.json(
      { error: "AI returned invalid JSON", raw: result.content },
      { status: 500 }
    );
  }

  const intakeForm = await prisma.intakeForm.create({
    data: {
      clientId: parsed.data.clientId,
      sourceType: "web-form",
      parsedData: extracted.parsedData as object,
      aiSummary: extracted.aiSummary,
      redFlags: extracted.redFlags as object,
    },
  });

  // Update client primaryGoal if extracted
  if (extracted.parsedData?.primaryGoal) {
    await prisma.clientProfile.updateMany({
      where: { id: parsed.data.clientId, workspaceId },
      data: { primaryGoal: extracted.parsedData.primaryGoal as string },
    });
  }

  return NextResponse.json({
    intakeFormId: intakeForm.id,
    aiSummary: extracted.aiSummary,
    redFlags: extracted.redFlags,
    tokens: { in: result.inputTokens, out: result.outputTokens },
  });
});
