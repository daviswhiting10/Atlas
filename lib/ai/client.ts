import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/db/client";

let _client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!_client) {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error(
        "ANTHROPIC_API_KEY is not set. Add it to .env.local and restart the server."
      );
    }
    _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return _client;
}

export const MODELS = {
  sonnet: "claude-sonnet-4-6",
  haiku: "claude-haiku-4-5-20251001",
} as const;

export type CallAIParams = {
  system: string;
  user: string;
  model?: (typeof MODELS)[keyof typeof MODELS];
  maxTokens?: number;
  // Usage tracking — provide both or neither
  feature?: string;
  workspaceId?: string;
  userId?: string;
};

export type CallAIResult = {
  content: string;
  inputTokens: number;
  outputTokens: number;
  model: string;
  latencyMs: number;
};

function estimateCostCents(
  model: string,
  inputTokens: number,
  outputTokens: number
): number {
  const pricing: Record<string, { in: number; out: number }> = {
    "claude-haiku-4-5-20251001": { in: 0.8, out: 4.0 },
    "claude-sonnet-4-6": { in: 3.0, out: 15.0 },
    "claude-opus-4-6": { in: 15.0, out: 75.0 },
  };
  const p = pricing[model] ?? { in: 3.0, out: 15.0 };
  return Math.round(
    ((inputTokens * p.in + outputTokens * p.out) / 1_000_000) * 100
  );
}

export async function callAI({
  system,
  user,
  model = MODELS.sonnet,
  maxTokens = 4096,
  feature,
  workspaceId,
  userId,
}: CallAIParams): Promise<CallAIResult> {
  const start = Date.now();

  const response = await getClient().messages.create({
    model,
    max_tokens: maxTokens,
    system,
    messages: [{ role: "user", content: user }],
  });

  const content =
    response.content[0].type === "text" ? response.content[0].text : "";
  const latencyMs = Date.now() - start;

  console.log(
    `[AI] model=${model} in=${response.usage.input_tokens} out=${response.usage.output_tokens} latency=${latencyMs}ms`
  );

  // Fire-and-forget — a DB hiccup must never fail an AI generation
  if (workspaceId) {
    prisma.usageLog
      .create({
        data: {
          workspaceId,
          feature: feature ?? "unknown",
          model,
          inputTokens: response.usage.input_tokens,
          outputTokens: response.usage.output_tokens,
          costCents: estimateCostCents(
            model,
            response.usage.input_tokens,
            response.usage.output_tokens
          ),
          latencyMs,
          userId: userId ?? null,
        },
      })
      .catch((err: unknown) => console.error("[UsageLog] Write failed:", err));
  }

  return {
    content,
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
    model,
    latencyMs,
  };
}

// ─── Vision call ─────────────────────────────────────────────────────────────

export type ImageInput = {
  base64: string;
  mediaType: "image/png" | "image/jpeg" | "image/gif" | "image/webp";
};

export type CallAIVisionParams = {
  system: string;
  user: string;
  /** One or more images. For multiple images each is sent as an image block
   *  followed by a short label text block so the model knows the order. */
  images: ImageInput[];
  model?: (typeof MODELS)[keyof typeof MODELS];
  maxTokens?: number;
  feature?: string;
  workspaceId?: string;
  userId?: string;
};

export async function callAIVision({
  system,
  user,
  images,
  model = MODELS.sonnet,
  maxTokens = 4096,
  feature,
  workspaceId,
  userId,
}: CallAIVisionParams): Promise<CallAIResult> {
  const start = Date.now();

  // Build content blocks: for each image emit [image_block, label_text], then
  // append the main user instruction at the end.
  // Use the SDK's own ContentBlockParam so media_type stays a literal union.
  const content: Anthropic.Messages.ContentBlockParam[] = [];
  images.forEach((img, i) => {
    content.push({
      type: "image",
      source: { type: "base64", media_type: img.mediaType, data: img.base64 },
    });
    if (images.length > 1) {
      content.push({ type: "text", text: `[Screenshot ${i + 1} of ${images.length}]` });
    }
  });
  content.push({ type: "text", text: user });

  const response = await getClient().messages.create({
    model,
    max_tokens: maxTokens,
    system,
    messages: [{ role: "user", content }],
  });

  const text =
    response.content[0].type === "text" ? response.content[0].text : "";
  const latencyMs = Date.now() - start;

  console.log(
    `[AI:vision] model=${model} in=${response.usage.input_tokens} out=${response.usage.output_tokens} latency=${latencyMs}ms`
  );

  if (workspaceId) {
    prisma.usageLog
      .create({
        data: {
          workspaceId,
          feature: feature ?? "unknown",
          model,
          inputTokens: response.usage.input_tokens,
          outputTokens: response.usage.output_tokens,
          costCents: estimateCostCents(
            model,
            response.usage.input_tokens,
            response.usage.output_tokens
          ),
          latencyMs,
          userId: userId ?? null,
        },
      })
      .catch((err: unknown) => console.error("[UsageLog] Write failed:", err));
  }

  return {
    content: text,
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
    model,
    latencyMs,
  };
}

export async function* callAIStream({
  system,
  user,
  model = MODELS.sonnet,
  maxTokens = 8192,
}: CallAIParams): AsyncGenerator<string> {
  const stream = getClient().messages.stream({
    model,
    max_tokens: maxTokens,
    system,
    messages: [{ role: "user", content: user }],
  });

  for await (const event of stream) {
    if (
      event.type === "content_block_delta" &&
      event.delta.type === "text_delta"
    ) {
      yield event.delta.text;
    }
  }
}
