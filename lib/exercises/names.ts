/**
 * Exercise names as matching sees them. Two names with the same key are the
 * same exercise written differently: "1A DB RDL", "db rdl" and "Dumbbell
 * Romanian Deadlifts" all become "dumbbell romanian deadlift".
 *
 * Pure: no I/O.
 */

/** Gym shorthand, spelled out. */
const SHORT: Record<string, string> = {
  db: "dumbbell",
  dbs: "dumbbell",
  bb: "barbell",
  kb: "kettlebell",
  kbs: "kettlebell",
  sl: "single leg",
  sa: "one arm",
  rdl: "romanian deadlift",
  rdls: "romanian deadlift",
  ohp: "overhead press",
  bw: "bodyweight",
  // Spellings seen in coaches' sheets.
  glue: "glute",
  palloff: "pallof",
  hallow: "hollow",
  hexbar: "trap bar",
};

/** Words written as one or two ("pull up", "pull-up", "pullup"). */
const JOINED: Array<[RegExp, string]> = [
  [/\bpull ups?\b/g, "pullup"],
  [/\bpush ups?\b/g, "pushup"],
  [/\bchin ups?\b/g, "chinup"],
  [/\bsit ups?\b/g, "situp"],
  [/\bstep ups?\b/g, "stepup"],
  [/\bpull downs?\b/g, "pulldown"],
  [/\bpull aparts?\b/g, "pullapart"],
  [/\bdead lift\b/g, "deadlift"],
  [/\b(?:1|single) arm\b/g, "one arm"],
  [/\bhex bar\b/g, "trap bar"],
];

/** "Push-Ups", "rows", "presses" → one form. Short words ("abs") stay as they are. */
function singular(w: string): string {
  if (w.length <= 3 || w.endsWith("ss")) return w;
  if (w.endsWith("presses")) return w.slice(0, -2);
  if (w.endsWith("s")) return w.slice(0, -1);
  return w;
}

export function nameKey(name: string): string {
  let n = name
    .toLowerCase()
    // A spreadsheet's block label: "1A ", "3B. ", "2) " (not "1 arm row").
    .replace(/^\s*\d+(?:[a-z][.):]?|[.):])\s+/, "")
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  n = n
    .split(" ")
    .filter(Boolean)
    .map((w) => SHORT[w] ?? w)
    .join(" ");
  for (const [re, to] of JOINED) n = n.replace(re, to);
  return n.split(" ").filter(Boolean).map(singular).join(" ");
}

/** A name with a spreadsheet block label in front ("3A One-Arm Dumbbell Row"). */
export const hasBlockLabel = (name: string) => /^\s*\d+(?:[A-Za-z][.):]?|[.):])\s/.test(name);
