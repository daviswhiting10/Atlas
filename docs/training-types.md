# Training types: templates as data, four built interfaces

Status: design, not built. Written 2026-11-15 against `main` at `0dc0cd4`; the user's decisions are folded in (last section). Builds on
[goals-layer.md](goals-layer.md), [archive-and-chapters.md](archive-and-chapters.md),
[generator-v2.md](generator-v2.md) and [mcp-roadmap.md](mcp-roadmap.md).

## The idea

A person picks something well known (75 Hard, Murph, a marathon plan, plain
lifting), and Atlas gives them a logging screen that fits it. Four interfaces are
built once, by hand: a **checklist**, **strength sets**, a **scored workout** and an
**endurance** log. Everything else is a **template**: plain data that says what
the sessions are, when they happen, how a result is scored and which interface
logs it. The AI writes and configures templates from a sentence ("I want to do
Murph", "build me a marathon plan for April 26"). It never writes UI code, and
nothing it writes is ever executed.

Every result is an ordinary **session** (`WorkoutLog`, with `SetLog` rows when there
are parts). Goals read sessions, and so do the heatmap, chapters, timeline and records.
Nothing new keeps its own history. Records stay derived, as `lib/history/records.ts`
already does for lifts.

**Four opinions that shape the rest:**

1. **Interfaces are few and fixed; templates are many and cheap.** A new kind of
   training is a template unless it needs a field none of the four interfaces has.
   That is the bar for writing UI.
2. **The model chooses and configures; code computes.** The AI fills in a schema:
   enums, numbers and short labels. It never writes formulas, expressions, HTML or
   code. Schedules (a marathon's weeks) are expanded by deterministic code from a
   few parameters. Scores, paces and records are computed by code. This is the
   same line generator-v2 draws ("numbers come from code").
3. **A built-in beats a generated one.** "I want to do Murph" matches the built-in
   Murph and asks two questions (vest or not, today or a date). The model only
   drafts a new template when nothing in the library fits.
4. **One session, one canonical number.** A scored session stores the display
   form ("20 rounds + 3") *and* one sortable number (603 reps). Records are a
   `MAX`/`MIN` over that number for one benchmark and one variant. No per-benchmark
   record tables.

## 1. The four interfaces

Each is a React component that takes a **session spec** (from the template) and
saves through one server action. Which fields show is decided by enums in the
spec, never by markup in it.

| Interface | Used for | What the person enters | What it saves |
|---|---|---|---|
| **checklist** | 75 Hard, habit challenges, "100 push-ups a day" | Ticks; one-tap workout rows (built: the 75 Hard card) | `GoalCheckIn` rows; set-less sessions with minutes |
| **sets** | Lifting, 5×5, any coach plan | Weight × reps per set; seconds for timed holds | `WorkoutLog` + `SetLog` (built: the logger and Log a workout) |
| **scored** | Murph, Fran, Cindy, any "for time" or AMRAP | The result (`mm:ss`, or rounds + reps, or a load), Rx or scaled, optionally reps per part | `WorkoutLog` with a score, plus one `SetLog` per part |
| **endurance** | Runs, rides, rows, swims, walks, races, intervals | Activity, distance, time (`h:mm:ss`); pace is computed; elevation and effort optional | `WorkoutLog` with distance and elapsed time |

What a scored or endurance session shows before logging comes from the spec.
Murph lists its parts and the vest choice. A plan run shows "Long run · 14 km ·
easy pace". A time cap shows only if the spec has one.

**Not in v1 for any interface:** live timers, GPS, watch imports, heart rate, splits.
These are the most-asked-for extras, and every one of them is a device-integration
project. Typing the result in after the fact is what Log a workout already does,
and it's enough to start.

## 2. Data model (additive only)

One migration, all nullable columns and one new table. No existing column changes
meaning; every current query keeps working. It goes through the usual process:
backup, rehearsal branch, before/after fingerprint, then the code.

### `WorkoutLog`: what a session was, and how it scored

```prisma
model WorkoutLog {
  // ...existing fields unchanged...

  /// The template (and version) this session followed: "builtin:murph@1", "tpl_<id>". Null for plain logging.
  templateKey  String?
  /// Which session of the template: "murph", or a plan slot like "w07-sat-long". Null for plain logging.
  sessionKey   String?
  /// Set only when the result is comparable over time: "murph", "fran", "5k", "marathon".
  benchmarkKey String?
  /// "rx" | "scaled" | a template-defined variant key ("vest", "no_vest"). Records never mix variants.
  variant      String?
  /// The result as shown: { "type": "time", "seconds": 2531 } or { "type": "rounds_reps", "rounds": 20, "reps": 3 }.
  score        Json?
  /// One sortable number for the score, in canonical units (seconds, total reps, lb, metres).
  scoreValue   Float?
  /// Hit the time cap without finishing. Shown, never a record.
  capped       Boolean  @default(false)

  /// Endurance: "run" | "ride" | "row" | "swim" | "walk" | "hike" | "ski" | "other".
  activity     String?
  distanceM    Float?
  elapsedSec   Int?
  elevationM   Float?

  @@index([clientId, benchmarkKey])
}
```

- **`durationMin` is still filled in, rounded down.** On save, `durationMin = floor(elapsedSec / 60)`,
  and the same for a scored time. 75 Hard stays strict: a workout counts only if its
  recorded duration is 45 minutes or more, so a 44:59 Murph is 44 and doesn't count.
  The heatmap's "work" and chapter hours keep working without knowing anything new.
- **Why columns instead of one JSON blob:** weekly mileage, fastest 5 km and best Murph
  are `SUM`/`MIN` queries that the history loader and the MCP will run every day.
  `score` stays JSON only for display, because its shape varies by score type.
- **Why no `kind` enum on the session:** the interface is a property of the template
  session, not of the stored result. A Murph logged by hand in plain Log a workout
  (with no template) is still a set of reps; it just isn't a benchmark result.

### `SetLog`: two more measures per part

```prisma
model SetLog {
  // ...existing fields unchanged...
  seconds   Int?    // a timed hold, or the time of one part ("the first mile took 8:40")
  distanceM Float?  // a part measured in distance (Murph's runs, a 500 m row)
}
```

This also closes the backlog item "switch a set to seconds by hand". A Murph saves
five `SetLog` rows: run 1609 m, pull-ups 100 reps, push-ups 200 reps, squats 300 reps,
run 1609 m. So pull-ups count toward back volume exactly as they would from Log a
workout, and runs (conditioning) stay out of volume, as `lib/exercises/muscles.ts`
already says.

**Opinion: weekly distance counts `WorkoutLog.distanceM` only, not parts.** Murph's
two miles don't show up in marathon mileage. Mixing them makes "weekly mileage" depend
on how a CrossFit workout was entered. Stated once, in the endurance interface's help text.

### `ClientProfile`: distance units

```prisma
model ClientProfile {
  // ...existing fields unchanged...
  distanceUnit String @default("mi") // "mi" | "km": how distances and paces are shown and typed
}
```

- Distances are **stored in metres** everywhere (`distanceM`). Templates write
  distances in kilometres internally (`distanceKm`); a template never stores miles.
- **Miles by default**, changeable in the profile. Every distance and pace on screen
  (plans, the endurance interface, records, chapters, safety messages such as "build
  to 16 miles a week first") is converted at display time. Typed values are converted
  to metres on save.
- A changed setting changes only how things are shown. No stored number moves.

### `TrainingTemplate`: templates that aren't built in

```prisma
model TrainingTemplate {
  id          String    @id @default(cuid())
  workspaceId String
  workspace   Workspace @relation(fields: [workspaceId], references: [id])
  createdById String            // the user who asked for it
  origin      String            // "ai" | "coach" | "copy" (of a built-in, edited)
  key         String            // "murph-partner", unique per workspace with version
  version     Int               // a row never changes; an edit is a new row with version + 1
  name        String
  spec        Json              // TemplateSpec, zod-validated on write AND on every read
  specHash    String            // sha256 of the canonical spec: detects tampering, dedupes
  prompt      String?  @db.Text // what the person asked for (AI-made only), for "why does it look like this"
  sharedWithWorkspace Boolean @default(false) // a coach's template its clients can start
  /// Training limits a coach raised for this version (section 3): [{ limit, from, to, byUserId, at, reason }]. Null for nearly every row.
  limitOverrides Json?
  archivedAt  DateTime?
  createdAt   DateTime  @default(now())

  @@unique([workspaceId, key, version])
  @@index([workspaceId, archivedAt])
}
```

- **Built-ins stay in code** (`lib/training/templates/*.ts`), versioned in git and
  referenced as `builtin:<key>@<version>`, exactly like `builtin:75hard`.
- **Rows are immutable.** A session records the exact version it followed, so a
  template edited later never rewrites what an old Murph "meant".
- This **replaces the `GoalTemplate` table** proposed in goals-layer.md. A goal
  template is a training template that has a `goal` section. That's one table, not two.

### `Goal`: one column

```prisma
model Goal {
  // ...existing fields unchanged...
  /// The training plan this goal runs, copied when it starts: { templateKey, spec, params: { raceDay, baseKmPerWeek } }.
  plan Json?
}
```

A goal already copies its `rules` when it starts, so a later template edit doesn't
change a running goal. `plan` is the same idea for the schedule. The expanded weeks
are **never stored**. They are recomputed from `spec` + `params` by `expandSchedule`,
which is pure and versioned by `spec.schema` (below), so the expander can improve
without moving anyone's running plan.

`GoalRules` gains three rule kinds in JSON only (no migration), described in section 6.

## 3. The template format

A template is one JSON document, validated by a zod schema `TemplateSpec`
(`lib/training/spec.ts`, pure, no Node imports). Every string the person can
see is a short plain-text label, rendered as text and never as markup.

```ts
type TemplateSpec = {
  schema: 1;                    // pins the validator AND the schedule expander
  key: string;                  // [a-z0-9_-], ≤ 40
  name: string;                 // ≤ 60, plain text
  summary: string;              // ≤ 240, plain text
  category: "benchmark" | "challenge" | "plan" | "habit";
  sessions: SessionSpec[];      // 1–12 session types
  schedule: Schedule;           // when sessions happen
  goal?: { length: { days: number } | { untilParam: "raceDay" }; rules: GoalRule[]; onMiss: "reset" | "count" };
  params?: ParamSpec[];         // what to ask the person before starting (race day, base mileage, Rx or scaled)
  attribution?: string;         // "Named for Lt. Michael Murphy." Plain text, ≤ 120
};

type SessionSpec = {
  key: string;
  name: string;
  interface: "checklist" | "sets" | "scored" | "endurance";
  // exactly one of these, matching the interface:
  scored?: {
    score: { type: "time"; capMin?: number }        // lower is better
         | { type: "rounds_reps"; repsPerRound: number; timeMin: number }  // AMRAP
         | { type: "reps"; timeMin?: number }
         | { type: "load" }                          // heaviest, lb
         | { type: "distance"; timeMin: number };    // as far as you can in N minutes
    parts: Array<{ movement: string; reps?: number; distanceM?: number; seconds?: number; loadLb?: { rx: number; scaled?: number } }>;
    scheme?: "as_listed" | "partition_any" | number[]; // [21, 15, 9] means rounds of those reps across all parts
    variants?: Array<{ key: string; label: string }>;  // default: rx, scaled
    benchmark?: string;                                // set ⇒ results are comparable over time
  };
  endurance?: {
    activity: "run" | "ride" | "row" | "swim" | "walk" | "hike";
    target: { distanceKm?: number | "from_schedule"; minutes?: number | "from_schedule"; effort: "easy" | "steady" | "tempo" | "interval" | "long" | "race" };
    intervals?: { work: { seconds: number }; rest: { seconds: number }; repeats: number }; // run/walk, track repeats
    benchmark?: string;                                // "5k", "half_marathon", "marathon", "cooper_12min"
  };
  sets?: { exercises: Array<{ movement: string; sets: number; reps: number | [number, number]; progression: "double" | "linear_5lb" | "linear_10lb" | "none" }> };
  checklist?: { items: Array<{ key: string; label: string; count?: number }> }; // count: "100 push-ups" as a number to reach
};

type Schedule =
  | { kind: "on_demand" }                                     // Murph: whenever you do it
  | { kind: "daily"; session?: string }                       // 75 Hard
  | { kind: "weekly"; days: Weekday[]; rotate: string[] }     // 5×5: Mon/Wed/Fri, rotate A, B
  | { kind: "explicit"; weeks: Array<Partial<Record<Weekday, { session: string; distanceKm?: number; minutes?: number }>>> } // ≤ 52 weeks
  | { kind: "progression"; model: "distance_build_v1"; days: Record<Weekday, string>;   // which session type on which day
      weeks: number; startKmPerWeek: number | "param"; peakKmPerWeek: number; longRunShare: number;
      cutbackEvery: number; taperWeeks: number; anchor: "start" | "raceDay" };
```

### Rules the validator enforces (beyond types)

These run in `validateTemplate(spec) → { ok, spec } | { ok: false, problems: string[] }`.
That's pure code, the same function for built-ins (in a test), AI drafts, coach edits,
and every read from the database.

- **Sizes:** ≤ 12 session types; ≤ 30 parts per session; ≤ 52 weeks; ≤ 7 sessions a
  week; ≤ 20 goal rules; the whole spec ≤ 16 KB.
- **Ranges:** reps 1–1000 per part, loads 0–1000 lb, distance 0–100 km per
  session, time caps 1–180 min, AMRAP windows 1–60 min.
- **References:** every `session` named in a schedule exists; every `movement`
  resolves through `findExerciseByName` (exact, alternate name, `nameKey`), or it's
  listed as "new" for the person to confirm (as Log a workout does with typed names).
  The AI never creates exercises on its own.
- **Coherence:** a `rounds_reps` score needs `repsPerRound` equal to the sum of the
  parts; a `[21, 15, 9]` scheme needs parts with no fixed `reps`; a `benchmark`
  needs a `scored` or `endurance` session; `raceDay` anchoring needs a `raceDay` param.
- **Training safety, for progressions** (checked on the *expanded* schedule, not the
  parameters):
  - weekly distance rises ≤ 10% week to week, outside cut-back weeks;
  - the long run is ≤ 35% of its week and ≤ 32 km;
  - at least 1 rest day a week;
  - taper of 2–3 weeks before a race.
  - A marathon plan needs `startKmPerWeek ≥ 25`, or it is refused with "Build to
    25 km a week first", and a 5 km or half-marathon plan is offered instead.
  - These numbers are conservative defaults, not medical advice.

#### Raising a limit (coaches only)

The limits above are **defaults**. Athletes and the AI are always held to them. A
**coach** can raise them for a template used by **their own clients** (same workspace,
a client they coach, or their own My training), up to a **hard ceiling** that nobody
passes:

| Limit | Default | Coach ceiling |
|---|---|---|
| Weekly distance rise | 10% | 20% |
| Long run, share of week | 35% | 50% |
| Long run, distance | 32 km | 42.2 km |
| Base needed for a marathon plan | 25 km/week | 15 km/week |
| Rest days a week | 1 | 0 |
| Taper | 2–3 weeks | 1–3 weeks |

- **How:** the coach edits the template in the app, and the validator reports which
  limits the new version exceeds. The coach confirms each one with a short reason ("Ran
  Boston in April; base is higher than her logs show"). The AI never proposes an
  override, and `draftTemplate` can't produce one.
- **Logged twice:**
  - The override is saved on the template version itself (`limitOverrides`: which
    limit, the default, the new value, who, when, why). That version is immutable, so
    the record can't be edited afterwards.
  - An `AuditLog` row is written too (`tool: "template.override_limits"`, the
    client, the outcome). It's hashed, like the MCP audit, so it shows *that* it
    happened and the template row shows *what*.
- **Shown:** the athlete's plan preview says "Your coach raised the weekly increase to
  15%", so a raised limit is never invisible to the person running it.
- **Enforced on the server:** `validateTemplate(spec, { overrides, actor })` accepts
  an override only when the actor is a coach of that client and the value is within
  the ceiling. An athlete-made or AI-made template with overrides is refused.
- **Text:** labels are plain text; anything that looks like a URL, HTML or markdown
  link is rejected. No health claims: words like "cure", "detox" and "guaranteed"
  are refused in summaries.

## 4. Scores and benchmark records

**Canonical numbers**, computed by `scoreValue(score, spec)` in code, never by the model:

| Score type | Entered as | `scoreValue` | Better |
|---|---|---|---|
| time | `42:11` | 2531 (seconds) | lower |
| rounds_reps | 20 rounds + 3 | 20 × 30 + 3 = 603 (reps) | higher |
| reps | 87 | 87 | higher |
| load | 225 lb | 225 (lb) | higher |
| distance | 2.84 km in 12 min | 2840 (m) | higher |
| endurance race | 5 km in `24:05` | 1445 (seconds), with `distanceM` = 5000 | lower |

**Records are derived, never stored.** `benchmarkHistory(sessions, benchmarkKey,
variant)` goes in `lib/history/benchmarks.ts`. It's pure and walks finished sessions
in the order they were done, exactly like `prsOverTime`:

- the first result is a **baseline**, not a record (no gold on day one);
- a later result strictly better than every earlier one in the **same benchmark and
  variant** is a **record**;
- **capped** results and results with a different variant are shown but never
  compared;
- ties go to the earlier result;
- a result logged late slots into its own day and can turn a later "record" into an
  ordinary one. That's correct, and it's already how lift records behave.

**Distance records come only from benchmark sessions.** A 12 km long run never
becomes your "10 km record". Without splits Atlas can't know the fastest 10 km inside
it, and guessing would make records untrustworthy. A race or time trial is logged
as one (`benchmark: "10k"`), and only that counts.

Records then feed what already exists:
- the timeline's `record` events (benchmark records join lift records);
- gold on the heatmap for any benchmark record, alongside key lifts (decided
  2026-11-15). Ordinary runs and workouts never turn gold;
- the chapter's numbers ("Best Murph 41:02, Rx");
- the save message ("Murph · 42:11 · Rx · 1:09 faster than May").

## 5. How the AI creates a template

One server action, `draftTemplate({ prompt, clientId })`, and the same thing over MCP
later. Steps, in order:

1. **Match first.** Normalize the prompt and look for a built-in by name and alias
   ("murph", "hero wod murph", "memorial day murph"; "marathon", "26.2"). On a
   confident match, skip generation and go to step 4 with that built-in. Most
   prompts end here, at no model cost.
2. **Draft.** Call the model with structured output against the JSON Schema
   generated from `TemplateSpec`. Its tools are read-only:
   - `search_movements(name)`: the exercise library, through `findExerciseByName`;
   - `get_builtin(key)`: a built-in to adapt ("Murph but half");
   - `get_person_facts()`: recent weekly distance, longest recent run, recent
     benchmark results, equipment. These are computed by code from sessions, so the
     model doesn't ask what Atlas already knows.

   The system prompt states the rules: fill the schema, prefer adapting a built-in,
   never invent movements, ask through `params` instead of guessing a race date.
3. **Validate.** `validateTemplate` runs. If it fails, the problems go back to the
   model once ("long run is 38% of week 11; limit is 35%"). If the second draft fails
   too, the person sees the problems in plain words and nothing is saved. The model
   never gets a third try in the same request.
4. **Preview.** Code expands the schedule and renders the real interface with
   empty history, read-only: the first two weeks of the plan, the Murph card, the
   75 Hard checklist. The person sees exactly what they'll log into. Every plan
   preview (and the Start screen of any `plan` or `challenge` template) carries one
   fixed line, written by Atlas and never removable by a template: **"Atlas
   isn't medical advice. Check with a doctor before starting a new training plan,
   especially if you're new to running or have a health condition."**
5. **Confirm.** One tap saves a `TrainingTemplate` row (immutable, with `specHash`
   and `prompt`) and, if it has a `goal`, starts the goal through the existing
   `startGoal` path, including its day-number check.

**Model choice:** Sonnet 5.5 (`claude-sonnet-5-5`) drafts. Opus 5.5
(`claude-opus-5-5`) only on "Try again" after a failed validation. Update `MODELS`
in `lib/ai/client.ts` first; it's out of date (screenshot-to-session.md says the same).
20 drafts per person per day, counted from `UsageLog`. Logs record token counts and
validation outcomes, never the prompt text.

**Naming and copying.** Hero and benchmark workouts (Murph, Fran, Cindy) are
widely published workout definitions; a template stores the movements and reps,
which is all anyone needs. Branded commercial plans aren't copied: the marathon
plan is Atlas's own `distance_build_v1` progression, not a named coach's schedule.
If someone asks for "the [brand] plan", the AI builds the closest Atlas progression
and says so in `summary`. 75 Hard keeps its name, as today.

## 6. How it fits the goals layer and the generator

**Goals.** A template with a `goal` section becomes a goal exactly as 75 Hard does
today. `Goal.rules` gets three new rule kinds. They are additive to the
discriminated union in `lib/goals/rules.ts`, and the evaluator learns them one
at a time:

| Rule kind | Meaning | Example |
|---|---|---|
| `scheduled` | The day's planned session was done: a finished session with this `templateKey` and `sessionKey`, on that day or the day either side | Marathon plan: "today's tempo run" |
| `weekly_total` | Per Monday-first week, a total over finished sessions: `sessions`, `minutes` or `distanceKm` (optionally one `activity`) | "40 km of running this week"; Weekly consistency, 3 sessions |
| `benchmark` | Do a benchmark N times, or beat a score | "Murph by Memorial Day"; "a sub-25 5 km" |

- **`onMiss: "count"`** (already in the review's v1 list) is what plans use: a missed
  run is a quiet gap, never a reset. Only challenges reset.
- **Chapters** gain endurance numbers when the goal has an endurance session: total
  distance, longest session, and the race result if one was logged. They're taken from
  the same sessions, with no new store.

**The generator (v2).** A running plan is an input, not a competitor:

- Planned endurance and scored days are **fixed days**: Stage 1 ("which days, and
  what kind of day") places lifting around them, and never on the day before a
  long run or a race.
- Endurance load counts toward fatigue: minutes × an effort weight (easy 1, tempo
  1.5, interval 2, race 2.5). Week 15 of a marathon build automatically means fewer
  heavy leg days.
- A `sets` template (5×5) *is* a plan in v2's terms. Its `progression` names map onto
  the existing `nextTarget` and `suggestNext` loaders, so 5×5 doesn't get a third
  progression engine.
- The generator **never edits a template**. It can suggest "move Saturday's long run
  to Sunday", which is a one-off session swap, recorded as a session on Sunday with
  the same `sessionKey`.

**MCP.** Three tools, after the app versions ship:
- `find_templates(query)`, read-only;
- `draft_template(prompt)`, which returns a preview and never starts anything;
- `log_session`, which gains `score`, `variant`, `distanceKm` and `elapsed`, using
  the same validation as the app.

Starting a goal stays app-only, as the review recommended (C1, C9).

## 7. Safety

- **No code paths from data.** Templates choose among four compiled components
  and a fixed list of enums. There's no `eval`, no expression language, no
  user-supplied regex, no HTML. A malicious template can at worst produce odd
  labels, which are plain text and length-capped.
- **Validated on write and on read.** A row that fails `validateTemplate` at read
  time (a schema bump, a hand-edited row) is shown as "This template needs
  updating" and can't be started; running goals keep their copied spec.
- **`specHash`** detects a row changed outside the app.
- **Training limits live in the validator** (section 3), are tested, and apply to AI
  drafts and athletes with no override. Coaches can raise them for their own
  clients, up to a hard ceiling, with every override logged (section 3).
- **"Not medical advice"** appears on every plan and challenge preview (section 5).
  It's fixed text in the interface, not template data, so no template can drop it. Plans state their assumptions in the preview ("Assumes
  you can run 8 km comfortably today").
- **Ownership.** A template belongs to the workspace and person that made it. A
  client sees their own, built-ins, and ones their coach shared. Logging goes
  through the same identity checks as `lib/actions/goals.ts`.
- **Minors.** When `ClientProfile.isMinor` lands, AI drafting is off for minors, and
  only built-ins marked `minorSafe` can be started. That excludes 75 Hard's diet rule
  and anything with a race distance over 10 km.
- **Prompt injection.** Prompts are data. The model's tools are read-only, it
  can't save, and everything it returns goes through the validator and a human tap.

## 8. Starter library (10 built-ins)

| # | Template | Category | Interface | Scoring and schedule | Notes |
|---|---|---|---|---|---|
| 1 | **75 Hard** | challenge | checklist | Daily; reset on a miss | Exists. Moves into the new format unchanged (its rules already are `GoalRules`). |
| 2 | **Murph** | benchmark | scored | For time, cap 90 min; partition any. Variants: 20 lb vest, no vest | 1 mile run, 100 pull-ups, 200 push-ups, 300 squats, 1 mile run |
| 3 | **Fran** | benchmark | scored | For time, `[21, 15, 9]`; Rx 95 lb, scaled 65 lb | Thrusters and pull-ups |
| 4 | **Cindy** | benchmark | scored | AMRAP 20 min, 30 reps per round | 5 pull-ups, 10 push-ups, 15 squats |
| 5 | **Cooper 12-minute test** | benchmark | endurance | Distance in 12 min | The simplest fitness benchmark there is; no equipment |
| 6 | **5 km time trial** | benchmark | endurance | Time over 5 km | Also the race-day session of plans 7 and 8 |
| 7 | **Couch to 5 km** | plan | endurance | `explicit`, 9 weeks × 3 run/walk sessions, intervals | Ends with the 5 km time trial. `minorSafe`. |
| 8 | **Half marathon, 12 weeks** | plan | endurance | `progression`, 4 runs a week, anchored to race day | Needs a base of 15 km a week |
| 9 | **Marathon, 16–20 weeks** | plan | endurance | `progression`, 4–5 runs a week, length from race day | Needs a base of 25 km a week; the length is set from the race date and the person's base |
| 10 | **5×5 strength** | plan | sets | Mon/Wed/Fri, A/B rotation; `linear_5lb` (deadlift `linear_10lb`) | Squat, bench, row / squat, press, deadlift; uses the existing loaders |

Weekly consistency (3 sessions a week), from goals-layer.md, comes free once
`weekly_total` exists. It isn't counted above because it needs no interface of its own.

## 9. A first slice for one week: scored benchmarks

**Ship:** Murph, Fran and Cindy as built-ins, the **scored** interface, and benchmark
history. No AI, no endurance, no plans.

**Why this slice:**
- It proves the three load-bearing ideas: a template is data, an interface is
  chosen by data, and records derive from sessions.
- It touches no running goal, so it can't hurt your 75 Hard.
- It's smaller than endurance, which needs schedules.
- It's useful the day it lands. A Murph logged during 75 Hard counts as one of the
  day's workouts when its recorded time is 45 minutes or more, through `durationMin`,
  with no new rule.

| Day | Work |
|---|---|
| 1 | Migration: the `WorkoutLog` score columns (`templateKey`, `sessionKey`, `benchmarkKey`, `variant`, `score`, `scoreValue`, `capped`) and `SetLog.seconds` / `distanceM`. The endurance columns and `TrainingTemplate` wait for their own slice. Backup, rehearsal, before/after compare, apply. |
| 2 | `lib/training/spec.ts` (zod, the `scored` branch only), `validateTemplate`, `scoreValue`. Three built-ins, each with a test that validates it. |
| 3 | The scored interface: the parts list, result entry (`mm:ss` or rounds + reps), Rx/scaled, cap. It saves through the existing quick-log save path: one `WorkoutLog` (source `OFF_PLAN`, title "Murph") and one `SetLog` per part, with the date field fix from 2026-11-15. |
| 4 | `lib/history/benchmarks.ts` (pure, tested: baseline, record, tie, capped, variant, late entry). A benchmark page: best result, every attempt, and "1:09 faster than May" on the save message. |
| 5 | "Log a benchmark" next to Log a workout; checks at 390 px; ship. Then measure: did you log one, and was entering the result quick? |

**Week 2** would be endurance: the remaining columns plus `ClientProfile.distanceUnit`
(miles by default), the endurance interface, and the 5 km time trial and Cooper test. **Week 3** would be `TrainingTemplate`,
`draftTemplate` and plans (Couch to 5 km first, because its schedule is explicit;
then the progression expander and the half and full marathon, the "not medical
advice" line, and coach limit overrides).

## Decisions (user, 2026-11-15)

1. **Distance units:** miles by default, a profile setting (`ClientProfile.distanceUnit`),
   always stored in metres (section 2).
2. **75 Hard stays strict:** a workout counts only if its recorded duration is 45
   minutes or more. Durations are rounded down from the exact time, so a 44:59 Murph
   doesn't count (section 2).
3. **Gold on the heatmap for benchmark records:** yes, alongside key lifts (section 4).
4. **Coaches can raise training limits** for their own clients, up to a hard ceiling,
   with every override logged. Athletes and the AI can't (section 3).
5. **Plan creation says "not medical advice"** on every plan and challenge preview
   (section 5).
