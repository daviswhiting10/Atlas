import { NextResponse } from "next/server";
import { z } from "zod";
import { withWorkspace } from "@/lib/api/middleware";
import { callAI, MODELS } from "@/lib/ai/client";
import { buildSessionPrompt } from "@/lib/ai/prompts/session";
import { getClient } from "@/lib/db/clients";
import { loadMethodology } from "@/lib/ai/methodology-loader";

const Schema = z.object({
  clientId: z.string(),
  rawInput: z.string().min(1),
});

export const POST = withWorkspace(async (req, { workspaceId, userId }) => {
  const body = await req.json();
  const parsed = Schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const [client, methodology] = await Promise.all([
    getClient(parsed.data.clientId, workspaceId),
    loadMethodology(workspaceId, "session"),
  ]);
  if (!client) {
    return NextResponse.json({ error: "Client not found" }, { status: 404 });
  }

  const { system, user } = buildSessionPrompt({
    rawInput: parsed.data.rawInput,
    clientName: client.fullName,
    methodology,
  });

  const result = await callAI({
    system,
    user,
    model: MODELS.sonnet,
    maxTokens: 1024,
    feature: "session-structure",
    workspaceId,
    userId,
  });

  let structuredNote: unknown;
  try {
    const cleaned = result.content.replace(/^```json\n?|\n?```$/g, "").trim();
    structuredNote = JSON.parse(cleaned);
  } catch {
    return NextResponse.json(
      { error: "AI returned invalid JSON", raw: result.content },
      { status: 500 }
    );
  }

  return NextResponse.json({
    structuredNote,
    tokens: { in: result.inputTokens, out: result.outputTokens },
  });
});
