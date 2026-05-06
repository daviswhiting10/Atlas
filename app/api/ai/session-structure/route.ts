import { NextResponse } from "next/server";
import { z } from "zod";
import { callAI, MODELS } from "@/lib/ai/client";
import { buildSessionPrompt } from "@/lib/ai/prompts/session";
import { getClient } from "@/lib/db/clients";

const Schema = z.object({
  clientId: z.string(),
  rawInput: z.string().min(1),
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

  const { system, user } = buildSessionPrompt({
    rawInput: parsed.data.rawInput,
    clientName: client.fullName,
  });

  const result = await callAI({ system, user, model: MODELS.sonnet, maxTokens: 1024 });

  let structuredNote: unknown;
  try {
    // Strip markdown code fences if present
    const cleaned = result.content.replace(/^```json\n?|\n?```$/g, "").trim();
    structuredNote = JSON.parse(cleaned);
  } catch {
    return NextResponse.json(
      { error: "AI returned invalid JSON", raw: result.content },
      { status: 500 }
    );
  }

  return NextResponse.json({ structuredNote, tokens: { in: result.inputTokens, out: result.outputTokens } });
}
