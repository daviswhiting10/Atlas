import { NextResponse } from "next/server";
import { withWorkspace } from "@/lib/api/middleware";
import { callAI, MODELS } from "@/lib/ai/client";
import { loadMethodology } from "@/lib/ai/methodology-loader";

export const GET = withWorkspace(async (_req, { workspaceId, userId }) => {
  const methodology = await loadMethodology(workspaceId);

  const result = await callAI({
    model: MODELS.haiku,
    system: "You are Atlas, an AI-native personal trainer OS. Respond in JSON only.",
    user: 'Confirm you are online. Return: {"status": "ok", "message": "one sentence confirming Atlas AI is live"}',
    maxTokens: 100,
    feature: "ping",
    workspaceId,
    userId,
  });

  let ai: unknown;
  try {
    ai = JSON.parse(result.content.replace(/^```json\n?|\n?```$/g, "").trim());
  } catch {
    ai = { raw: result.content };
  }

  return NextResponse.json({
    status: "ok",
    ai,
    tokens: { in: result.inputTokens, out: result.outputTokens },
    latencyMs: result.latencyMs,
    model: result.model,
    methodology: {
      loaded: methodology.length > 0,
      note:
        methodology.length === 0
          ? "No methodology in DB yet — run: npm run seed:methodology"
          : "Methodology loaded from DB",
    },
  });
});
