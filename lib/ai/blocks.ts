// Sonnet 5.5 thinks by default: a thinking block comes first and eats max_tokens, so a short
// answer can come back empty. Our prompts want the answer only, so turn it off (Haiku has no such mode).
export function noThinking(model: string, sonnet: string) {
  return (model === sonnet ? { thinking: { type: "between_tools" } } : {}) as Record<string, never>;
}

/** The reply's text: the first text block, whatever comes before it. */
export function firstText(blocks: { type: string; text?: string }[]): string {
  return blocks.find((b) => b.type === "text")?.text ?? "";
}
