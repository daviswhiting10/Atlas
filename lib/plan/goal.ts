/**
 * Reads a goal written in the athlete's own words — pure, deterministic,
 * no model call.
 *
 * "I want bigger glutes but my knees are bad" becomes structured facts the
 * generator can act on: a training goal, areas to emphasise, and conditions
 * to work around. Every fact comes from a visible keyword rule, so the same
 * sentence always produces the same plan and each choice can be explained
 * back to the athlete.
 */

export type GoalKind = "muscle" | "strength" | "fat_loss" | "general";
export type Area = "chest" | "back" | "shoulders" | "arms" | "legs" | "glutes" | "core";
export type Condition = "lower_back" | "knee" | "shoulder" | "post_rehab";

export const AREAS: Record<Area, string> = {
  chest: "chest",
  back: "back",
  shoulders: "shoulders",
  arms: "arms",
  legs: "legs",
  glutes: "glutes",
  core: "core",
};

export const CONDITIONS: Record<Condition, { label: string; blurb: string }> = {
  lower_back: { label: "Lower back safe", blurb: "No loaded spinal flexion: supported rows, hip thrusts and leg press replace deadlifts and bent-over rows." },
  knee: { label: "Knee pain", blurb: "Less deep knee bend under load: hip-dominant work replaces lunges and leg extensions." },
  shoulder: { label: "Shoulder restrictions", blurb: "Nothing pressed overhead: incline and neutral-grip pressing replace it." },
  post_rehab: { label: "Post-rehab", blurb: "Higher reps, lighter loads, no extra sets: rebuilding tolerance before intensity." },
};

export type GoalReading = {
  /** null when the text doesn't say; the quick pick decides. */
  goal: GoalKind | null;
  emphasis: Area[];
  conditions: Condition[];
  /** Wants stamina or work capacity as well as lifting. */
  conditioning: boolean;
  /** Plain-language list of what was understood, for the athlete to check. */
  understood: string[];
};

type Rule<T> = { value: T; pattern: RegExp };

// Order matters only for `goal`: the first rule with the most matches wins,
// ties go to the earlier rule.
const GOAL_RULES: Rule<GoalKind>[] = [
  { value: "strength", pattern: /\b(strong(er)?|strength|power\s?lift\w*|1\s?rm|one[- ]rep|max(es)?|pr\b|heav(y|ier)|lift more|\d{3}\s?(lb|lbs|pounds?)?\s?(bench|squat|deadlift)|(bench|squat|deadlift)\s?\d{3}|explosive|athletic|vertical|sprint)\b/gi },
  { value: "fat_loss", pattern: /\b(lose|losing|lost|fat|weight\s?loss|lean(er)?|cut(ting)?|shred\w*|slim\w*|drop\s?\d+|burn|tone[d]?\s?up|get\s?in\s?shape|belly)\b/gi },
  { value: "muscle", pattern: /\b(muscle|muscular|size|mass|hypertrophy|bulk\w*|bigger|build|grow\w*|gain\w*|jacked|tone[d]?|definition|physique|aesthetic\w*|bodybuild\w*)\b/gi },
  { value: "general", pattern: /\b(fit(ness)?|health(y|ier)?|active|general|feel better|energy|longevity|mobility|maintain|stay in shape|consisten\w*|habit)\b/gi },
];

const AREA_RULES: Rule<Area>[] = [
  { value: "glutes", pattern: /\b(glute\w*|booty|butt|hips?|posterior)\b/i },
  { value: "legs", pattern: /\b(legs?|quads?|hamstrings?|lower body|squat\w*|calves|thighs?)\b/i },
  { value: "chest", pattern: /\b(chest|pecs?|bench\w*|push[- ]?ups?)\b/i },
  { value: "back", pattern: /\b(back|lats?|pull[- ]?ups?|chin[- ]?ups?|rows?|posture|deadlift\w*)\b/i },
  { value: "shoulders", pattern: /\b(shoulders?|delts?|overhead press|ohp)\b/i },
  { value: "arms", pattern: /\b(arms?|biceps?|triceps?|guns)\b/i },
  { value: "core", pattern: /\b(core|abs?|abdominals?|six[- ]?pack|midsection|waist)\b/i },
];

// An area named next to pain or injury is something to protect, not to emphasise.
const HURT = "(pain\\w*|hurt\\w*|bad|sore|injur\\w*|tweak\\w*|ach(e|es|ing|y)|issue\\w*|problem\\w*|surgery|rehab\\w*|recover\\w*|restrict\\w*|careful)";
const near = (part: string) => new RegExp(`\\b(${HURT}\\W+(\\w+\\W+){0,3}${part}|${part}\\W+(\\w+\\W+){0,3}${HURT})\\b`, "i");

const CONDITION_RULES: Rule<Condition>[] = [
  { value: "lower_back", pattern: near("(lower back|low back|back|spine|disc|sciatica)") },
  { value: "knee", pattern: near("(knees?|acl|mcl|meniscus|patella\\w*)") },
  { value: "shoulder", pattern: near("(shoulders?|rotator cuff|labrum)") },
  { value: "post_rehab", pattern: /\b(post[- ]?rehab|rehab\w*|physio\w*|physical therapy|after surgery|post[- ]?op|coming back from|returning from|recovering from)\b/i },
];

const CONDITIONING = /\b(endurance|stamina|cardio|conditioning|work capacity|gas tank|hike|hiking|run(ning|ner)?|5k|10k|marathon|sport|season|soccer|basketball|football|hockey|tennis|keep up with)\b/i;

// The area a condition protects: never emphasised when the condition is present.
const PROTECTS: Partial<Record<Condition, Area>> = { shoulder: "shoulders" };

const GOAL_PHRASE: Record<GoalKind, string> = {
  muscle: "building muscle",
  strength: "getting stronger",
  fat_loss: "losing fat",
  general: "general fitness",
};

export function interpretGoal(text: string | null | undefined): GoalReading {
  const t = (text ?? "").trim().slice(0, 400);
  if (!t) return { goal: null, emphasis: [], conditions: [], conditioning: false, understood: [] };

  let goal: GoalKind | null = null;
  let best = 0;
  for (const rule of GOAL_RULES) {
    const hits = t.match(rule.pattern)?.length ?? 0;
    if (hits > best) {
      best = hits;
      goal = rule.value;
    }
  }

  const conditions = CONDITION_RULES.filter((r) => r.pattern.test(t)).map((r) => r.value);
  // "My back hurts" names the back as a problem, not as a goal.
  const hurtAreas = new Set<Area>();
  if (conditions.includes("lower_back")) hurtAreas.add("back");
  if (conditions.includes("knee")) hurtAreas.add("legs");
  for (const c of conditions) {
    const area = PROTECTS[c];
    if (area) hurtAreas.add(area);
  }
  // "Coming back from…" and "get back to…" are not about the back.
  const forAreas = t.replace(/\b(coming|come|came|get|getting|got|going|go)\s+back\b|\bback\s+(to|into|in|from|on)\b/gi, " ");
  const emphasis = AREA_RULES.filter((r) => r.pattern.test(forAreas) && !hurtAreas.has(r.value))
    .map((r) => r.value)
    .slice(0, 3);
  const conditioning = CONDITIONING.test(t);

  const understood: string[] = [];
  if (goal) understood.push(GOAL_PHRASE[goal]);
  if (emphasis.length > 0) understood.push(`extra work for ${emphasis.map((a) => AREAS[a]).join(" and ")}`);
  if (conditioning) understood.push("a conditioning finisher each session");
  for (const c of conditions) understood.push(CONDITIONS[c].label.toLowerCase());

  return { goal, emphasis, conditions, conditioning, understood };
}
