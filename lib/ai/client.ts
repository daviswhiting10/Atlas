import Anthropic from "@anthropic-ai/sdk";

if (!process.env.ANTHROPIC_API_KEY) {
  throw new Error("ANTHROPIC_API_KEY is not set in environment variables.");
}

export const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export const MODELS = {
  // Default for generation tasks
  sonnet: "claude-sonnet-4-6",
  // Cheap classification / scoring calls
  haiku: "claude-haiku-4-5-20251001",
} as const;

export type CallAIParams = {
  system: string;
  user: string;
  model?: (typeof MODELS)[keyof typeof MODELS];
  maxTokens?: number;
  stream?: boolean;
};

export type CallAIResult = {
  content: string;
  inputTokens: number;
  outputTokens: number;
  model: string;
};

/**
 * Core AI call wrapper — handles errors, logs token usage, no streaming.
 * For streaming use callAIStream instead.
 */
export async function callAI({
  system,
  user,
  model = MODELS.sonnet,
  maxTokens = 4096,
}: Omit<CallAIParams, "stream">): Promise<CallAIResult> {
  const response = await anthropic.messages.create({
    model,
    max_tokens: maxTokens,
    system,
    messages: [{ role: "user", content: user }],
  });

  const content =
    response.content[0].type === "text" ? response.content[0].text : "";

  // Cost visibility — log per call so we can see what features cost
  console.log(
    `[AI] model=${model} in=${response.usage.input_tokens} out=${response.usage.output_tokens}`
  );

  return {
    content,
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
    model,
  };
}

/**
 * Streaming variant — yields text chunks. Use for long generation (programs).
 */
export async function* callAIStream({
  system,
  user,
  model = MODELS.sonnet,
  maxTokens = 8192,
}: Omit<CallAIParams, "stream">): AsyncGenerator<string> {
  const stream = anthropic.messages.stream({
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
