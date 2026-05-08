import { NextResponse } from "next/server";
import { withWorkspace } from "@/lib/api/middleware";
import { callAI, MODELS } from "@/lib/ai/client";
import { getClient } from "@/lib/db/clients";
import { prisma } from "@/lib/db/client";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfParse = require("pdf-parse");

const SYSTEM = `You are Atlas, an AI assistant for a personal trainer named Davis Whiting (NASM CPT, NASM CNC).

Your task: analyze a client intake document (extracted from PDF) and return:
1. A concise 1-2 paragraph client narrative (who this person is, what they need, key context for programming)
2. An array of red flags that need action

## Red flag triggers (flag IMMEDIATELY with high severity and PT/MD referral):
- Uncontrolled hypertension or recent cardiac event
- Chest pain at rest or during activity
- Dizziness/syncope
- Recent surgery (<6 weeks) without medical clearance
- Undiagnosed acute pain, especially neurological symptoms (numbness, tingling, weakness)
- Any PAR-Q+ "yes" answer

## Output
Return ONLY valid JSON:
{
  "aiSummary": "string — 1-2 paragraph client narrative in trainer-facing voice",
  "redFlags": [
    {
      "issue": "string",
      "severity": "high" | "medium" | "low",
      "recommendedAction": "string"
    }
  ],
  "parsedData": {
    "primaryGoal": "string",
    "trainingAge": "string",
    "keyInjuries": ["array"],
    "parqPositive": false,
    "sleepHours": null,
    "stressLevel": null
  }
}`;

export const POST = withWorkspace(async (req, { workspaceId, userId }) => {
  const formData = await req.formData();
  const clientId = formData.get("clientId");
  const file = formData.get("file");

  if (typeof clientId !== "string" || !clientId) {
    return NextResponse.json({ error: "clientId required" }, { status: 400 });
  }
  if (!(file instanceof Blob)) {
    return NextResponse.json({ error: "file required" }, { status: 400 });
  }

  const client = await getClient(clientId, workspaceId);
  if (!client) {
    return NextResponse.json({ error: "Client not found" }, { status: 404 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  let pdfText: string;
  try {
    const parsed = await pdfParse(buffer);
    pdfText = parsed.text.trim();
  } catch {
    return NextResponse.json({ error: "Failed to parse PDF" }, { status: 422 });
  }

  if (!pdfText) {
    return NextResponse.json({ error: "PDF appears to be empty or image-only" }, { status: 422 });
  }

  const result = await callAI({
    system: SYSTEM,
    user: `Client name: ${client.fullName}\n\nIntake document:\n${pdfText.slice(0, 8000)}`,
    model: MODELS.sonnet,
    maxTokens: 1024,
    feature: "intake-pdf",
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
      clientId,
      sourceType: "pdf",
      parsedData: extracted.parsedData as object,
      aiSummary: extracted.aiSummary,
      redFlags: extracted.redFlags as object,
    },
  });

  if (extracted.parsedData?.primaryGoal) {
    await prisma.clientProfile.updateMany({
      where: { id: clientId, workspaceId },
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
