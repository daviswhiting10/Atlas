/**
 * What a coach types in "Additional context" when importing a plan, read
 * into the few things that change how the plan is built:
 *
 *   "This a 4 week block. 2 days legs, 2 days upper body. Start fresh so we
 *    can just pick up on week 1."
 *     → { durationWeeks: 4, trainingDays: 4, startAtWeek: 1 }
 *
 * Common phrasing is read here by rule, so it doesn't depend on the model.
 * The model reads the same text too (see the import prompts) and fills in
 * anything the rules didn't catch. The coach's words beat what the file
 * suggests.
 *
 * Pure: no I/O.
 */

export type PlanContext = {
  /** How long the block runs. */
  durationWeeks: number | null;
  /** Training days a week the coach expects. */
  trainingDays: number | null;
  /** The week the client is on now. 1 = start fresh; 3 = weeks 1–2 are done. */
  startAtWeek: number | null;
};

export const NO_CONTEXT: PlanContext = { durationWeeks: null, trainingDays: null, startAtWeek: null };

const WORDS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8,
  nine: 9, ten: 10, eleven: 11, twelve: 12, first: 1, second: 2, third: 3, fourth: 4,
};
const N = `(\\d{1,2}|${Object.keys(WORDS).join("|")})`;
const num = (s: string) => WORDS[s] ?? parseInt(s, 10);
const within = (v: number | null | undefined, lo: number, hi: number) =>
  typeof v === "number" && Number.isInteger(v) && v >= lo && v <= hi ? v : null;

/** The context, read by rule. Anything it can't find is null. */
export function contextFromText(text: string | null | undefined): PlanContext {
  if (!text?.trim()) return NO_CONTEXT;
  const t = text.toLowerCase().replace(/[–—]/g, "-");

  // "4 week block", "4-week", "six weeks", "6 wks". Not "week 4": the number comes first.
  const weeks = t.match(new RegExp(`\\b${N}[\\s-]*(?:weeks?|wks?)\\b`));

  // "4 days a week", "4x a week", "4 times per week", or a split: "2 days legs, 2 days upper".
  const perWeek = t.match(new RegExp(`\\b${N}\\s*(?:x|times|days?|sessions?|workouts?)\\s*(?:a|per|/|each)\\s*week\\b`));
  const dayParts = Array.from(t.matchAll(new RegExp(`\\b${N}[\\s-]*days?\\b(?!\\s*(?:off|rest|of rest))`, "g"))).map((m) => num(m[1]));
  const days = perWeek ? num(perWeek[1]) : dayParts.length > 0 ? dayParts.reduce((a, b) => a + b, 0) : null;

  // "start fresh", "from scratch", "start over" → week 1. "pick up on week 3", "we're on week 3" → 3.
  const onWeek = t.match(
    new RegExp(
      `\\b(?:start(?:ing)?|pick(?:ing)?\\s+(?:it\\s+)?up|begin(?:ning)?|resume|continue|we'?re|they'?re|(?:he|she)'?s|currently|now)\\s+(?:back\\s+)?(?:on|at|from|with|in|into)?\\s*(?:the\\s+)?(?:week\\s*${N}|(\\d{1,2}(?:st|nd|rd|th)|first|second|third|fourth)\\s+week)\\b`
    )
  );
  const fresh = /\b(start(ing)?\s+(fresh|over|from\s+(scratch|the\s+(top|beginning)))|fresh\s+start|from\s+scratch|clean\s+slate|ignore\s+(the\s+)?(logged|filled|old|previous|past)\b)/.test(t);
  const startAt = onWeek ? num(onWeek[1] ?? onWeek[2]) : fresh ? 1 : null;

  return {
    durationWeeks: within(weeks ? num(weeks[1]) : null, 1, 52),
    trainingDays: within(days, 1, 7),
    startAtWeek: within(startAt, 1, 52),
  };
}

/** The model's reading (its "context" object), kept only where it's sane. */
export function contextFromModel(raw: unknown): PlanContext {
  if (!raw || typeof raw !== "object") return NO_CONTEXT;
  const c = raw as Record<string, unknown>;
  return {
    durationWeeks: within(c.durationWeeks as number, 1, 52),
    trainingDays: within(c.trainingDays as number, 1, 7),
    startAtWeek: within(c.startAtWeek as number, 1, 52),
  };
}

/** Rules first; the model fills in what the rules didn't find. */
export function mergeContext(rules: PlanContext, model: PlanContext): PlanContext {
  return {
    durationWeeks: rules.durationWeeks ?? model.durationWeeks,
    trainingDays: rules.trainingDays ?? model.trainingDays,
    startAtWeek: rules.startAtWeek ?? model.startAtWeek,
  };
}

/** The "context" object from a model's JSON reply, if it has one. */
export function modelContextFromReply(reply: string): PlanContext {
  try {
    const json = JSON.parse(reply.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim());
    return contextFromModel(json?.context);
  } catch {
    return NO_CONTEXT;
  }
}

/** What both import prompts tell the model about the coach's note. */
export function contextPromptSection(notes: string | undefined): string {
  if (!notes?.trim()) return "";
  return `

## The coach's context
The coach added a note (in the user message). It is authoritative: where it disagrees with what the file suggests (how many weeks, how many days, which week they're on), follow the note.
Also add a top-level "context" field to your JSON with what the note says, null for anything it doesn't say:
"context": { "durationWeeks": number | null, "trainingDays": number | null, "startAtWeek": number | null }
- durationWeeks: how long the block runs ("4 week block" → 4).
- trainingDays: training days a week ("2 days legs, 2 days upper" → 4).
- startAtWeek: the week the client is on now. "Start fresh" or "pick up on week 1" → 1; "they're on week 3" → 3.`;
}

/** The plain-words line shown after an import: "4 weeks · 4 days a week · starting at week 1". */
export function describeReadAs(p: { weeks: number; days: number; startAtWeek?: number | null }): string {
  const parts = [`${p.weeks} week${p.weeks === 1 ? "" : "s"}`, `${p.days} day${p.days === 1 ? "" : "s"} a week`];
  if (p.startAtWeek) parts.push(`starting at week ${p.startAtWeek}`);
  return parts.join(" · ");
}

/** Where the note and the file disagree in a way the note can't settle by itself. */
export function contextWarnings(ctx: PlanContext, found: { days: number }, what: "screenshot" | "sheet"): string[] {
  const out: string[] = [];
  if (ctx.trainingDays != null && ctx.trainingDays !== found.days) {
    out.push(
      `Your note says ${ctx.trainingDays} days a week, but the ${what} shows ${found.days}. Add the missing day${Math.abs(ctx.trainingDays - found.days) === 1 ? "" : "s"} or edit the plan.`
    );
  }
  return out;
}
