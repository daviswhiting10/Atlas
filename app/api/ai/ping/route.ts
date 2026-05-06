import { NextResponse } from "next/server";
import { callAI, MODELS } from "@/lib/ai/client";
import { loadMethodology, getMethodologyHash } from "@/lib/ai/methodology-loader";

export async function GET() {
  const methodology = loadMethodology();
  const methodologyHash = getMethodologyHash();

  const result = await callAI({
    model: MODELS.haiku,
    system: "You are Atlas, an AI-native personal trainer OS. Respond in JSON only.",
    user: 'Confirm you are online. Return: {"status": "ok", "message": "one sentence confirming Atlas AI is live"}',
    maxTokens: 100,
  });

  return NextResponse.json({
    status: "ok",
    ai: JSON.parse(result.content),
    tokens: { in: result.inputTokens, out: result.outputTokens },
    model: result.model,
    methodology: {
      filesLoaded: methodology.length > 0,
      hash: methodologyHash || null,
      note: methodology.length === 0
        ? "No methodology content yet — placeholder files detected. Add content to /methodology/*.md"
        : "Methodology loaded",
    },
  });
}
