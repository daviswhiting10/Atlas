import { NextResponse } from "next/server";
import { z } from "zod";
import { callAI, MODELS } from "@/lib/ai/client";
import { buildIntakePrompt } from "@/lib/ai/prompts/intake";
import { getClient } from "@/lib/db/clients";
import { prisma } from "@/lib/db/client";

const Schema = z.object({
  clientId: z.string(),
  formData: z.record(z.string(), z.string()),
});

export async function POST(req: Request) {
  const body = await req.json();
  const parsed = Schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const client = await getClient(parsed.data.clientId);
  if (!client) {
    return NextResponse.json({ error: "Client not found" }, { status: 404 });
  }

  const { system, user } = buildIntakePrompt({
    formData: parsed.data.formData,
    clientName: client.fullName,
  });

  const result = await callAI({ system, user, model: MODELS.sonnet, maxTokens: 1024 });

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

  // Persist to IntakeForm
  const intakeForm = await prisma.intakeForm.create({
    data: {
      clientId: parsed.data.clientId,
      rawFilePath: "web-form",
      parsedData: JSON.stringify(extracted.parsedData),
      aiSummary: extracted.aiSummary,
      redFlags: JSON.stringify(extracted.redFlags),
    },
  });

  // Update client primaryGoal if extracted
  if (extracted.parsedData?.primaryGoal) {
    await prisma.client.update({
      where: { id: parsed.data.clientId },
      data: { primaryGoal: extracted.parsedData.primaryGoal as string },
    });
  }

  return NextResponse.json({
    intakeFormId: intakeForm.id,
    aiSummary: extracted.aiSummary,
    redFlags: extracted.redFlags,
    tokens: { in: result.inputTokens, out: result.outputTokens },
  });
}
