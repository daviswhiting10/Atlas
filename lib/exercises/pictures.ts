/**
 * A picture for an exercise, from free-exercise-db (public domain, the Unlicense):
 * two photos per exercise, the start and end of the movement, shown
 * alternating so it reads like a short clip.
 *
 * Exercises seeded from that library carry their own image link. Everything
 * else (a coach's own names like "1A DB RDL", sheet imports) is matched to the
 * library by name, here, when it's shown. Nothing is written back.
 *
 * Matching is deliberately cautious: no picture beats the wrong picture.
 */

import LIBRARY from "@/data/exercise-library.json";

export type Picture = {
  name: string;
  /** Photos, shown alternating. Empty for a video. */
  frames: string[];
  /** A coach's own short clip. */
  video?: string;
  /** The coach uploaded it (as opposed to the library). */
  own?: boolean;
};

type Entry = { n: string; k: string; f: number; c: string; e: string | null };

// Served from jsDelivr's mirror of the GitHub repo: a CDN, not raw GitHub.
const BASE = "https://cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@main/exercises";

const framesFor = (key: string, count: number) => Array.from({ length: Math.min(Math.max(count, 1), 2) }, (_, i) => `${BASE}/${encodeURIComponent(key)}/${i}.jpg`);

/** Gym shorthand and spellings, mapped to the library's words. */
const WORDS: Array<[RegExp, string]> = [
  [/\bdb\b/g, "dumbbell"],
  [/\bbb\b/g, "barbell"],
  [/\bkb\b/g, "kettlebell"],
  [/\bsl\b/g, "single leg"],
  [/\bsa\b/g, "one arm"],
  [/\brdl\b/g, "romanian deadlift"],
  [/\bohp\b/g, "overhead press"],
  [/\bbw\b/g, "bodyweight"],
  [/\b(hex|trap) ?bar\b/g, "trapbar"],
  [/\bone[- ]?arm\b|\b1[- ]?arm\b|\bsingle[- ]arm\b/g, "onearm"],
  [/\bone[- ]?leg(ged)?\b|\bsingle[- ]?leg\b/g, "singleleg"],
  [/\bpush[- ]?ups?\b/g, "pushup"],
  [/\bpull[- ]?ups?\b/g, "pullup"],
  [/\bchin[- ]?ups?\b/g, "chinup"],
  [/\bsit[- ]?ups?\b/g, "situp"],
  [/\bstep[- ]?ups?\b/g, "stepup"],
  [/\bpull[- ]?downs?\b/g, "pulldown"],
  [/\bpull[- ]?aparts?\b/g, "pullapart"],
  [/\bpull[- ]?through\b/g, "pullthrough"],
  [/\bdead[- ]?lifts?\b/g, "deadlift"],
  [/\bglue\b/g, "glute"],
  [/\bhallow\b/g, "hollow"],
  [/\binverse row\b/g, "inverted row"],
  [/\bfarm(er'?s?)? (carry|walk)\b/g, "farmers walk"],
  [/\bpall?off\b/g, "pallof"],
  [/\bmed ball\b/g, "medicine ball"],
  [/\bextensions\b/g, "extension"],
  [/\bcurls\b/g, "curl"],
  [/\braises\b/g, "raise"],
  [/\blunges\b/g, "lunge"],
  [/\bsquats\b/g, "squat"],
  [/\brows\b/g, "row"],
  [/\bswings\b/g, "swing"],
  [/\bpresses\b/g, "press"],
  [/\bbridges?\b/g, "bridge"],
  [/\bropes\b/g, "rope"],
  [/\bwalks\b/g, "walk"],
  [/\bbanded\b/g, "band"],
  [/\bland ?mine\b/g, "landmine"],
];

/** Words that say how, not what. */
const STOP = new Set(["with", "w", "the", "on", "and", "or", "to", "of", "a", "an", "in", "for", "iso", "isometric", "hold", "partial", "light", "heavy", "moderate", "standing", "seated", "medium", "grip", "version", "position", "style", "machine", "bench"]);

/** Library entries that share a common word but are a different exercise. */
const NEVER = new Set(["Air Bike"]); // a bicycle crunch, not the fan bike

/**
 * Exercises the library has nothing close to, checked by the coach: any name
 * with one of these gets no picture rather than a near miss.
 */
const NO_PICTURE = /\b(nordic|ghd|partner|suitcase|landmine|land mine)\b|standing 1-arm cable/i;

/** Names the library uses for common gym terms. */
const ALIASES: Record<string, string> = {
  "recumbent bike": "Recumbent Bike",
  "assault bike": "Bicycling, Stationary",
  "fan bike": "Bicycling, Stationary",
  "stationary bike": "Bicycling, Stationary",
  bike: "Bicycling, Stationary",
  "incline treadmill walk": "Walking, Treadmill",
  "treadmill walk": "Walking, Treadmill",
  "farmers walk": "Farmer's Walk",
  "kettlebell swing": "One-Arm Kettlebell Swings",
  "two kettlebell swing": "One-Arm Kettlebell Swings",
  "glute bridge": "Single Leg Glute Bridge",
  "side plank": "Side Bridge",
  "band pullapart": "Band Pull Apart",
  "lateral band walk": "Monster Walk",
  "banded walk": "Monster Walk",
  "banded lateral walk": "Monster Walk",
  "lat pulldown": "Wide-Grip Lat Pulldown",
  "wide pulldown": "Wide-Grip Lat Pulldown",
  "trapbar deadlift": "Trap Bar Deadlift",
  "romanian deadlift": "Romanian Deadlift",
  "singleleg romanian deadlift": "Kettlebell One-Legged Deadlift",
  "dumbbell romanian deadlift": "Romanian Deadlift",
  "battle rope": "Battling Ropes",
  "back extension": "Hyperextensions (Back Extensions)",
  "hamstring curl": "Lying Leg Curls",
  "leg curl": "Lying Leg Curls",
  "stability ball hamstring curl": "Ball Leg Curl",
  "leg extension": "Leg Extensions",
  "goblet box squat": "Goblet Squat",
  "bodyweight box squat": "Box Squat",
  "medicine ball slam": "Overhead Slam",
  "triceps pushdown": "Triceps Pushdown",
  "dumbbell hip thrust": "Barbell Hip Thrust",
  "hip thrust": "Barbell Hip Thrust",
  "dumbbell chest press": "Dumbbell Bench Press",
  "incline dumbbell chest press": "Incline Dumbbell Press",
  "pullup": "Pullups",
  "overhand pullup": "Pullups",
  "assisted pullup": "Band Assisted Pull-Up",
  "hanging knee raise": "Hanging Leg Raise",
  "standing calf raise": "Standing Calf Raises",
  "split squat": "Split Squats",
  "front foot elevated split squat": "Split Squats",
  "reverse lunge": "Dumbbell Rear Lunge",
  "dumbbell reverse lunge": "Dumbbell Rear Lunge",
  "walking lunge": "Bodyweight Walking Lunge",
  "barbell romanian deadlift": "Romanian Deadlift",
  "lying hamstring curl": "Lying Leg Curls",
  "band hamstring curl": "Lying Leg Curls",
  "overhead triceps extension": "Cable Rope Overhead Triceps Extension",
  "chest supported row": "Dumbbell Incline Row",
  "chest supported dumbbell row": "Dumbbell Incline Row",
  "onearm row": "One-Arm Dumbbell Row",
  "3 point dumbbell row": "One-Arm Dumbbell Row",
  "point dumbbell row": "One-Arm Dumbbell Row",
  "band walk": "Monster Walk",
  "battling rope": "Battling Ropes",
  "leg raise": "Flat Bench Lying Leg Raise",
  pallof: "Pallof Press",
  "worlds greatest": "World's Greatest Stretch",
  "world s greatest": "World's Greatest Stretch",
  "dead bug": "Dead Bug",
  plank: "Plank",
  "front plank": "Plank",
  pullthrough: "Pull Through",
  "cable pullthrough": "Pull Through",
  "donkey kick": "Glute Kickback",
};

function words(raw: string, query = true): string[] {
  let s = raw.toLowerCase();
  s = s.replace(/\(.*?\)/g, " "); // "(DB/KB)", "(20 yd)"
  if (query) s = s.split(/\s[—–-]\s|:/)[0]; // "Wall Sit — partial", "Foam Roll: lats"
  s = s.replace(/^\s*\d+[a-z]\s+/, " "); // "1A ", "2B "
  for (const [re, to] of WORDS) s = s.replace(re, to);
  return s
    .replace(/[^a-z0-9 ]+/g, " ")
    .split(/\s+/)
    .filter((w) => w && !STOP.has(w) && !/^\d+$/.test(w));
}

const ENTRIES = (LIBRARY as Entry[]).filter((e) => !NEVER.has(e.n));
const BY_NAME = new Map(ENTRIES.map((e) => [e.n, e]));
const INDEX = ENTRIES.map((e) => ({ e, w: new Set(words(e.n, false)) }));
const ALIAS = new Map(Object.entries(ALIASES).map(([k, v]) => [words(k).join(" "), v]));
// Longest first, so "lying hamstring curl" wins over "hamstring curl".
const ALIAS_KEYS = Array.from(ALIAS.keys()).sort((a, b) => b.length - a.length);

/** The library entry for a name, or null when nothing is close enough. */
function match(name: string): Entry | null {
  if (NO_PICTURE.test(name)) return null;
  const w = words(name);
  if (w.length === 0) return null;
  const key = w.join(" ");
  const alias = ALIAS.get(key);
  if (alias && BY_NAME.has(alias)) return BY_NAME.get(alias)!;
  // A known phrase inside the name: "Heel Elevated Goblet Box Squat ISO".
  const padded = ` ${key} `;
  const inside = ALIAS_KEYS.find((k) => padded.includes(` ${k} `));
  if (inside && BY_NAME.has(ALIAS.get(inside)!)) return BY_NAME.get(ALIAS.get(inside)!)!;

  const q = new Set(w);
  let best: { e: Entry; score: number } | null = null;
  for (const { e, w: lw } of INDEX) {
    if (lw.size === 0) continue;
    let common = 0;
    lw.forEach((x) => {
      if (q.has(x)) common++;
    });
    if (common === 0) continue;
    // Every word of the library name must be in ours ("Goblet Squat" fits "Heel Elevated
    // Goblet Squat"), and ours mostly covered by it.
    if (common < lw.size) continue;
    // A one-word library name ("Plank", "Pushups") only matches a one-word name.
    if (lw.size === 1 && q.size > 1) continue;
    const score = common / q.size;
    if (score < 0.5) continue;
    if (!best || score > best.score || (score === best.score && e.n.length < best.e.n.length)) best = { e, score };
  }
  if (best) return best.e;

  // Try again with the qualifiers stripped down to the last two words ("… Goblet Squat").
  if (w.length > 2) {
    const tail = w.slice(-2).join(" ");
    const a = ALIAS.get(tail);
    if (a && BY_NAME.has(a)) return BY_NAME.get(a)!;
    const exact = INDEX.find(({ w: lw }) => lw.size === 2 && Array.from(lw).join(" ") === tail);
    if (exact) return exact.e;
  }
  return null;
}

const cache = new Map<string, Picture | null>();

/**
 * The picture for an exercise. A stored library link wins; otherwise the
 * name is matched to the library.
 */
export function pictureFor(ex: { name: string; gifUrl?: string | null }): Picture | null {
  const stored = ex.gifUrl?.match(/free-exercise-db\/(?:main|refs\/heads\/main)\/exercises\/([^/]+)\/\d\.jpg$/) ?? ex.gifUrl?.match(/free-exercise-db@main\/exercises\/([^/]+)\/\d\.jpg$/);
  if (stored) {
    const key = decodeURIComponent(stored[1]);
    const e = ENTRIES.find((x) => x.k === key);
    return { name: e?.n ?? ex.name, frames: framesFor(key, e?.f ?? 2) };
  }
  if (ex.gifUrl) return { name: ex.name, frames: [ex.gifUrl] };

  if (cache.has(ex.name)) return cache.get(ex.name)!;
  const e = match(ex.name);
  const pic = e ? { name: e.n, frames: framesFor(e.k, e.f) } : null;
  cache.set(ex.name, pic);
  return pic;
}

/** For tests and tuning. */
export const _match = (name: string) => match(name)?.n ?? null;
