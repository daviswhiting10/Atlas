# Generator v2: the adaptive training engine

Status: design, not built. Builds on the session-first work (`WorkoutLog` as the
record of what was done), [goals-layer.md](goals-layer.md) and
[mcp-roadmap.md](mcp-roadmap.md). Nothing here is written until the session-first
work is committed on `main` and merged into this branch.

## What it replaces, and what it keeps

Today Atlas has two generators and neither reads history:

- `lib/plan/generator.ts` turns five preferences into a fixed 12-week plan. It's
  pure, deterministic and well tested, but on day 1 it knows exactly as much as
  on day 80. Lighter weeks fall on the calendar whether the athlete needs one or
  not.
- `generate_program` (MCP, coach-only) asks a model for a program in markdown.
  Nothing is structured, nothing is saved, and it also ignores history.

Around them sit good pieces that *do* read history, but one exercise at a time:
`nextTarget` (double progression), `suggestNext` (RPE-aware progression),
`detectPlateau`, `volumeByWeek` / `muscleTrends`, and `recommend`.

**v2 keeps all of those and puts a planner on top.** The old generator's catalog,
slots, condition swaps and set schemes become the planner's vocabulary. The
per-exercise engines stay the loaders. What's new is the layer that decides
*what to do today* from everything the athlete has done, and the layer that
lets a coach steer it.

**Opinion:** the unit of generation is **the next session**, drawn as a rolling
**7-day outlook**. Not a 12-week block. Twelve weeks is a promise about the future
the engine can't keep once the athlete misses a week or logs three off-plan runs.
A block is a *goal* (a `block` template in the goals layer) that shapes the
sessions; it isn't 36 pre-written workouts.

### Principles

1. **Everything the athlete did counts.** Off-plan sessions are load and
   progress, not deviations. There's no "adherence penalty" anywhere in the
   engine.
2. **Missed days change the plan, they don't shame it.** Ten days off means a
   gentler re-entry, not three "missed" badges.
3. **Numbers come from code.** Loads, sets, which muscles, when to back off:
   deterministic, tested, explainable. The model reads free text and nothing
   else (section 3).
4. **The coach can always overrule and the engine remembers it.** A locked
   exercise is never touched; a rejected suggestion isn't offered again for
   that reason.
5. **The engine is pure.** `planNext(inputs, today) → Outlook`. Loading from the
   database happens in a thin layer around it, as `lib/plan/generator.ts` and
   `lib/sessions/status.ts` do today.

## 1. Inputs, and how each is computed from sessions

All inputs come from one loader, `loadTrainingState(client, today, timeZone)`,
which reads finished sessions (`completedAt` set) from the last **12 weeks**,
their sets, the client's active goals, the active plan if there is one, and the
coach's settings. Everything below is a pure function of that, in
`lib/engine/state.ts`. Days are `yyyy-mm-dd` in the athlete's timezone: the
goal's zone if a goal is active, else `ClientProfile.timeZone`, else the cookie zone.

**Weeks and units.** All loads, e1RMs and targets are in **pounds (lb)**, with no
kilogram assumptions anywhere, including a `lift_target` (`e1rmLb`). The engine uses
two kinds of week, on purpose:

- **Rolling 7-day windows ending today** for every decision input (sessions per week,
  hard sets, acute:chronic, RPE). A decision never changes just because it became
  Monday.
- **Calendar weeks, Monday first (`mondayOf`)** for anything the athlete reads as
  "this week" or "last week", for counting consecutive hard weeks (Stage 4), and
  wherever the engine's numbers must match `volumeByWeek` and the logger's "last
  week" block. A goal's own weeks (counted from its `startDay`) are used only for
  that goal's rules.

| Input | How it's computed | Notes |
|---|---|---|
| **Sessions per week** | Finished sessions per 7-day window, trailing 1, 4 and 12 weeks. Also day-of-week histogram over 8 weeks. | The histogram is how the engine learns "trains Mon/Wed/Fri" without being told. |
| **Days since last session** | `today − max(session.date)`. | Drives re-entry ramp (section 2). |
| **Hard sets per muscle, per week** | For each completed set with `reps > 0`: 1.0 to each `primaryMuscles`, 0.5 to each `secondaryMuscles`. A set is **hard** when `rpe ≥ 7`, or RPE is missing and the set is within 10% of that session's top weight for the exercise, or the exercise is unloaded (bodyweight/band). Warm-ups don't count. | Reuses the muscle keys already in `volumeByWeek`. Band sets count as hard sets; they add no tonnage, same as now. |
| **Muscle freshness** | Days since the last hard set per muscle. | "Fresh" = ≥ 48 h for small muscles, ≥ 72 h for quads, hamstrings, glutes, back, chest. |
| **Acute : chronic load** | Hard sets in the last 7 days ÷ (mean weekly hard sets over the previous 4 weeks). Also per muscle. | Simple ratio, no fancy decay. >1.5 is a spike, <0.5 after a break is detraining. |
| **e1RM trend per exercise** | `summarizeSession` → `bestE1RM` per session, lighter weeks excluded; slope over last 6 sessions; `detectPlateau` verdict; `holdStreak`. | All existing code. |
| **Personal records** | `personalRecords()` all-time, plus which were set in the last 28 days. | For explanations and for "this lift is moving, leave it alone." |
| **RPE** | Mean and max RPE of hard sets in the last 7 and 14 days; share of sets with RPE logged. | If less than 30% of sets have RPE, RPE-based rules switch to their "RPE unknown" branch rather than guessing. |
| **Fatigue score (0–3)** | +1 if 7-day mean RPE ≥ 8.5 (or ≥ 8 with `rpeAvg`/`clientNotes` on 2+ sessions mentioning tired/sore); +1 if acute:chronic > 1.5; +1 if two or more key lifts are plateaued or falling. | Never a single signal. 3 = back off now. |
| **Missed days** | Plan workouts with `scheduledDate < today`, no finished session, status not SKIPPED or excused; and, for an active daily goal, days with no session. | Used only to decide ramping and to re-slot work. Not shown as a count anywhere the athlete sees. |
| **Equipment** | Union of (a) declared prefs (`gym` / `dumbbells` / `bodyweight`) and (b) **observed** from the last 28 days: any set with `bandColor` → bands; catalog `tool` of exercises actually logged → barbell / dumbbell / machine / cable / bodyweight. The engine proposes only exercises whose tool is in the set. | Today `Equipment` has no `bands`. v2 adds `bands` as a catalog tool and a slot option, because the athlete already logs them. Observed equipment wins over declared when they disagree. |
| **Conditions and emphasis** | From `interpretGoal` on `primaryGoal` / `goalText`, plus the coach's explicit `conditions`, plus anything the model extracted from notes (section 3). | Existing swaps in `CONDITION_SWAPS` and `GENTLE`. |
| **Active goals** | `evaluateGoal` for each active goal → `today.need` per rule (e.g. "2 sessions, one marked outdoors, ≥45 min"), the rule set's `kind` (`challenge`, `block`, `season`, `consistency`), and the lift targets for a block. | From the goals layer; the engine never reads goal tables directly. |
| **Plan context** | If a hand-built plan is live: its upcoming workouts for the next 7 days. | The engine fills *around* a coach's plan; it never rewrites it (section 2, "when there's a plan"). |
| **Coach settings and locks** | Per client: review mode (`auto` / `review`), weekly set range override, locked exercises/workouts, rejected suggestions with reasons. | Section 4. |
| **Time budget** | Median `durationMin` of the last 8 finished sessions, else declared `minutes`. | Sessions get sized to what the athlete actually does, not what they said. |

## 2. Decision logic

`planNext(state, today) → Outlook` produces seven `PlannedDay` entries (some of
them rest), each with exercises, targets and a two-line explanation. It runs in
six stages, in this order, and later stages never undo earlier ones.

### Stage 1: Which days, and what kind of day

- **Training days** come from the day-of-week histogram (days trained in ≥ 50%
  of the last 8 weeks) unless a goal says otherwise. 75 Hard says every day,
  twice. A block says the template's days. If there's no history, use declared
  `daysPerWeek` with the old `SPLITS` offsets.
- **Day kind** is one of `lift`, `conditioning`, `outdoor`, `recovery`, `rest`,
  `sport`. Goals fix some of these: 75 Hard needs one `outdoor` ≥ 45 min each
  day; a season marks game days as `sport` and the day before as light.
- **Re-entry ramp:** if days since last session ≥ 7, the first session back
  gets 60% of the usual hard sets and loads from `nextTarget` with the
  reference session's weight minus one increment; ≥ 14 days → two ramp
  sessions and minus two increments; ≥ 28 days → the first week is a
  `foundation` week (the old generator's phase 1 schemes). The explanation says
  "first session back" and nothing else about the gap.
- **Fatigue 3** turns the next lift day into a `lighter` day (same movements,
  `nextTarget` with `deload: true`) and shortens the outlook's hard sets by a
  third. **Fatigue 2** holds loads (no `add_weight` this week).

### Stage 2: Weekly set targets per muscle

Each muscle gets a weekly target range of hard sets from goal × experience
(these are the *opinions*; they're constants in one table so a coach can override
them per client):

| | beginner | intermediate | advanced |
|---|---|---|---|
| muscle (hypertrophy) | 8–12 | 12–18 | 14–22 |
| strength | 6–10 on the lifts' prime movers; 4–8 elsewhere | 8–12 / 4–8 | 10–15 / 4–8 |
| fat loss / general | 6–10 | 8–12 | 8–14 |
| 75 Hard, consistency | 6–10, with the ceiling enforced hard | same | same |

Emphasis areas get +3 to their muscles. Conditions cap their protected
muscles at the low end and swap exercises.

**Neglected muscle:** trailing-7-day hard sets < 50% of the target floor *and*
the muscle is fresh. Neglected muscles are filled first. **Over-trained:**
trailing 7 days > 120% of ceiling → that muscle gets no hard sets until it drops
back under. This is also how off-plan work is absorbed: three extra run days
raise the conditioning tally and the engine simply plans less of it. Nothing is
"extra".

### Stage 3: Build each lift day

1. Start from the muscle deficits for that day, ordered: neglected first, then
   largest deficit, then the goal's key lifts.
2. Pick a **pattern** for each deficit (squat / hinge / push / pull …) using the
   same `AREA_SLOTS` mapping, respecting freshness (no hard quad work within
   72 h of the last).
3. Pick the **exercise** for the pattern, in this order:
   - a **locked** exercise, if the coach locked one for this pattern;
   - an exercise the athlete has done ≥ 3 times in 12 weeks with that pattern
     (continuity: there's an e1RM to progress from), preferring one whose
     e1RM is rising, then flat, then plateaued (a plateaued main lift gets a
     variation every third exposure: `swapOnPlateau`);
   - else the catalog slot resolved for the observed equipment, with condition
     swaps.
4. **Order:** the goal's key lift first, compound before isolation, the rest by
   deficit size. Cap exercises by the time budget with `EXERCISES_BY_MINUTES`.
5. **Sets and reps:** the old `SCHEMES[goal][role]`, trimmed so the day's total
   doesn't push any muscle past its ceiling.
6. **Load:** `nextTarget` from the reference session (last non-lighter session
   on that exercise), with `increment` from the catalog and `deload` set by
   Stage 1. If `suggestNext` says `deload` (RPE 10 last time) or `hold`, that
   wins over `nextTarget`'s `add_weight`. First exposure → `kind: "first"` and
   the usual "find your starting weight" text.

### Stage 4: Deloads, properly

A lighter week is **earned by signals, not by the calendar**:

- fatigue score 3, or
- two or more key lifts plateaued with `confidence: "high"`, or
- acute:chronic > 1.5 for two weeks running, or
- the coach says so, or a block goal schedules one.

As a backstop, if none of those fire for **6 consecutive hard calendar weeks**
(Monday first, ≥ 3 sessions each), the seventh is lighter anyway. Lighter-week sessions are flagged
`deload` exactly as today, so charts, records and plateau detection keep
ignoring them. `lighterWeeks` on the plan stays as the coach's override to turn
the whole mechanism off.

### Stage 5: Respect goal rules

Goals are **constraints, not suggestions**, applied last so they can't be
optimized away:

- **75 Hard:** two sessions per day; one `outdoor` ≥ 45 min; the second session
  is a `lift` or `conditioning` day sized to what's left under the ceilings. If
  the athlete already logged one today, the outlook shows only the missing one.
  If both are logged, today reads "done".
- **Strength block:** key lifts are fixed and appear on their block days;
  accessories flex. The lift target (`lift_target`) sets the pace: if the
  projected e1RM at the current slope won't reach it, the engine says so in
  the explanation rather than jumping loads.
- **Team season:** `sport` days come from the group; the day before is light;
  weekly ceiling is lowered by 25% in-season.
- **Consistency target:** the engine never plans more days than the target + 1,
  so a "3 a week" athlete isn't shown a 5-day week. The goal's weeks count from
  its `startDay`, so the engine plans against the goal's week, not the calendar
  week.

Where two goals conflict (a strength block inside 75 Hard), the challenge's
*frequency* rules win and the block's *lift* rules win; the engine says which
one it bent.

### When there's a coach's plan

If a hand-built plan (`Program.isTemplate = true`) is live, the engine is in
**assist mode**: it doesn't add or remove workouts. It sets loads on the plan's
exercises (as the logger already does with `nextTarget`), flags neglected
muscles and fatigue to the coach, and only proposes *extra* sessions when a goal
requires them (75 Hard's second session). A coach can switch a client to
**adaptive mode**, where the engine owns the outlook and the plan becomes the
seed.

## 3. Plain code vs. the model

| Decided by code | Decided by the model |
|---|---|
| Every number: sets, reps, loads, which muscles, which day, deload or not. | Reading free text into the engine's structured fields. |
| Which exercise fills a pattern. | Nothing else. |
| Every explanation sentence (templates). | |
| Goal constraints. | |

The model is used in exactly one place: **`readNotes(text) → Constraints`**,
turning unstructured input into the same shape `interpretGoal` produces
(`conditions`, `emphasis`, `avoidExercises`, `preferExercises`, `timeBudget`,
`fatigueHint`, `equipmentHint`), plus a confidence. Inputs are: the coach's plan
note and workout notes, the athlete's `clientNotes` on recent sessions ("knee
felt off", "only had bands at the hotel"), the goal text, and later a free-text
"anything I should know?" prompt. The engine treats the result as *hints*,
applied through the same code paths a coach's explicit settings use, so a wrong
reading is at most a bad swap, never a bad load.

Why not let the model plan?

- **Reproducibility.** The same history must produce the same outlook, so a
  coach can trust what they reviewed yesterday is what the athlete sees today.
- **Testability.** Section 6 is possible only if the engine is a pure function.
- **Explainability.** Each sentence in a template is tied to one input; the
  model's prose can't be.
- **Cost and latency.** The outlook is recomputed after every session, for
  every athlete. A model call per recompute is wasteful; one call per *note*
  isn't.
- **It's the house style already.** `recommend()` is documented as "no
  AI-written advice". v2 extends that, it doesn't reverse it.

The call uses structured outputs so the result is always the `Constraints` shape
(zod schema shared with `interpretGoal`), runs at low effort, and is cached by
note hash so a note is read once. Model: `claude-opus-5-5`, the current default;
`lib/ai/client.ts` still names `claude-sonnet-4-6` and `claude-haiku-4-5-20251001`,
which predate it, so the `MODELS` table gets updated as part of this work (that
change touches `generate_program` and the intake summary too, so it ships on its
own first). Through `callAI`, so it lands in `UsageLog` and under the existing
rate limit.

**`generate_program` is retired** once v2 reaches step 6 below. Its one real use
(a coach wanting a written program in their voice) is better served by rendering
the engine's outlook with the coach's `voiceProfile`, which is prose *about* a
plan the code made, not a plan the model made.

## 4. Coach review, edit and lock

Three settings per client, on `ClientProfile.goalTargets.engine` for now (a
column later if it needs indexing):

- **`mode`:** `assist` (default when a coach plan is live) or `adaptive`.
- **`review`:** `auto` (the outlook goes straight to the athlete) or `first`
  (the coach approves each week). Self-serve athletes with no coach are always
  `auto`. Clients with `ClientProfile.isMinor` set (every member of a youth team,
  set when the coach answers "Is this a youth team?") default to `first`.
- **`setRange`:** optional per-muscle override of the Stage 2 table.

**Proposals.** When `review: first`, the engine writes a `Proposal` row:

```prisma
model Proposal {
  id          String   @id @default(cuid())
  workspaceId String
  clientId    String
  forWeek     String   // yyyy-mm-dd of day 1 (a rolling 7-day outlook, so not necessarily a Monday)
  outlook     Json     // the full Outlook, with explanations and the inputs snapshot
  status      String   // "proposed" | "accepted" | "edited" | "rejected" | "superseded"
  decidedBy   String?
  decidedAt   DateTime?
  createdAt   DateTime @default(now())
  @@index([clientId, forWeek])
}
```

The coach sees it as a week in the Plan tab marked "Suggested", with each
exercise's two-line reason. They can:

- **Accept** → the outlook is persisted as `AssignedWorkout` rows under a
  rolling "Adaptive plan" assignment (one assignment per client, extended a week
  at a time; `source` on sessions stays `GENERATED`).
- **Edit** → the existing `edit_plan` actions (swap, targets, add/remove) on the
  proposal before accepting. Every edit is recorded on the proposal as a
  `{ what, from, to }` so the engine can learn from it (next bullet).
- **Lock** → a lock pins something the engine must not change:
  - **exercise lock** (`AssignedWorkoutExercise.locked`): keep this exercise in
    this pattern; the engine still sets its load unless `lockTargets` is also on.
  - **workout lock**: the engine doesn't touch the day at all.
  - **plan-level locks** stored on the client: "always squat on Monday",
    "never propose kipping pull-ups". These are the swaps a coach makes twice;
    after the second identical edit the UI offers to make it a lock.
- **Reject** with a one-tap reason (`too much`, `too little`, `wrong exercise`,
  `wrong day`, `other`). A rejection with `too much`/`too little` nudges that
  muscle's range by one step for that client for 4 weeks; `wrong exercise` adds
  the exercise to `avoidExercises`. Nothing else is inferred.

Locks are visible on the athlete's view as a small padlock, and the explanation
for a locked item says "your coach set this".

When `review: auto`, the same proposal row is written with `status: accepted`
so the history of what the engine proposed is kept, and the coach can still
edit after the fact; edits to an already-shown week re-plan only the remaining
days.

## 5. Explanations in one or two lines

Every `PlannedDay` and every exercise carries `why: string[]` with at most two
sentences, built from templates in `lib/engine/explain.ts`. Rules:

- **Sentence one is the decision, sentence two is the single strongest input.**
  Never list three reasons.
- Numbers the athlete logged, not internal scores. Say "RPE 9 on your last two
  squat days", never "fatigue score 3".
- No judgement words: "missed", "behind", "failed" don't appear. A gap is "first
  session back"; a reset is "a fresh start on day 1".
- The template key is kept alongside the text, so tests assert on keys and the
  copy can be edited without breaking them.

Examples:

| Situation | Text |
|---|---|
| Day kind | "Upper day. Chest and back are fresh; legs were hard yesterday." |
| Progression | "Bench 190 × 6. You hit 8 at 185 last week, top of the range." |
| Hold | "Squat stays at 225. RPE 9 on your last two squat days." |
| Lighter week | "Lighter week. Six hard weeks in a row and your top lifts have stalled, so recover and come back." |
| Neglected muscle | "Rear delts added. Nothing for them in 10 days." |
| Re-entry | "First session back, so about two-thirds of a normal day." |
| 75 Hard | "Second session today: 45 min outdoors. One more and today's done." |
| Locked | "Your coach set this." |
| Goal conflict | "Lighter squats this week: game on Saturday." |

The MCP `get_today` tool returns the same `why` strings, so an athlete's AI
repeats the engine's reasons instead of inventing its own.

## 6. Testing

The engine is pure, so most tests need no database.

**Fixtures from real, anonymized histories.** A script,
`scripts/export-fixture.ts`, takes a `clientId` and writes
`test/fixtures/engine/<name>.json`: finished sessions and sets for 12 weeks,
exercises by slug, declared prefs, goals and plan context. It strips names,
emails, notes and ids (exercises keyed by catalog slug, dates shifted so day 1 is
`2026-01-05`, a Monday, so fixture weeks line up with Monday-first calendar weeks),
and rounds body weight to 5 lb. It also drops `timeZone`, `isMinor` and anything
photo-related, and keeps every load in pounds. **It reads whichever database
`.env.local` points at, so it runs only when the user asks, and only against
the dev branch unless they say otherwise.** Six fixtures to start: a consistent
4-day lifter, a 2-day beginner with gaps, a bands-only traveller, a runner who
lifts twice a week off-plan, a plateaued intermediate, and the user's own 75 Hard
once it exists.

Test kinds, all in `lib/engine/*.test.ts`:

1. **Golden outlooks.** For each fixture, `planNext` at three dates (mid-week,
   after a gap, after a hard week) is snapshotted. A change in output is a
   deliberate review, not a surprise.
2. **Invariants** (property tests over every fixture at every day of the 12
   weeks):
   - no muscle gets hard sets inside its freshness window;
   - no muscle's planned + trailing-6-day hard sets exceed 120% of its ceiling;
   - no load jump exceeds one increment per exposure; after ≥ 7 days off, no
     `add_weight`;
   - every proposed exercise's tool is in the observed-or-declared equipment;
   - condition swaps always hold (no overhead pressing with `shoulder`);
   - every `PlannedDay` satisfies every active goal's `today.need`, or the
     explanation carries the `goal_conflict` key;
   - locked items are byte-identical before and after `planNext`;
   - every explanation has ≤ 2 sentences and contains none of the banned words.
3. **Scenarios** (hand-written states): 75 Hard with one session logged; 10 days
   off; plateau on two key lifts; three off-plan runs in a week; a game
   tomorrow; bands only; RPE never logged.
4. **Replay against the coach.** For clients who have a hand-built plan, run the
   engine in adaptive mode over their history week by week and measure agreement
   with what the coach actually prescribed: same muscles trained (target ≥ 80%),
   loads within one increment (≥ 70%). This is a report, not a pass/fail, and
   it's the number the user looks at before trusting `auto` for anyone.
5. **Loader tests** with a seeded dev database, few and slow: `loadTrainingState`
   returns the fixture shape from real rows.
6. **`readNotes` evals.** Twenty real-looking notes with expected `Constraints`,
   run against the model behind a flag because they cost money; it's the only
   test in the suite that does.

## 7. Build order and risks

Each step ships alone and has tests. Steps 1–4 need no schema change.

0. **Prerequisite:** session-first work merged; goals layer at least through its
   evaluator (step 1 of its rollout) so `today.need` exists as a type.
1. **`lib/engine/state.ts`:** compute every Section 1 input from sessions, pure,
   with the first two fixtures. Add `bands` to the catalog as a tool. *Risk:*
   muscle keys in `Exercise.primaryMuscles` are free strings from two sources
   (catalog and the imported library); a normalization map is needed and will
   be incomplete at first. Mitigation: unknown muscles go to `unspecified` and a
   test lists how many sets landed there per fixture.
2. **Stage 2–3 planner for one lift day:** `planDay`, with invariants. Reuse
   `nextTarget`, `suggestNext`, `SCHEMES`, `CONDITION_SWAPS`. *Risk:* the set
   ranges are opinions and will be wrong for someone. Mitigation: they're one
   table, overridable per client from step 7, and the replay report tells us
   how wrong.
3. **Stages 1, 4, 5 → `planNext`** for the 7-day outlook, with goals as
   constraints and the deload rules. Golden tests on all fixtures. *Risk:*
   goal-conflict rules get complicated. Mitigation: only the two precedence rules
   stated above; anything else is an explanation, not a resolution.
4. **Explanations** (`explain.ts`) and the banned-word test.
5. **Loader + athlete surface:** `loadTrainingState`, a "Next up" card on the
   athlete's Today view in `auto` mode for self-serve athletes only (they
   already own their plans via `rebuildPlan`). The outlook is computed on read,
   nothing persisted yet. *Risk:* latency on 12 weeks of sets. Mitigation: the
   existing `WorkoutLog(clientId, date)` index; measure; cache per client keyed
   by last session id if needed.
6. **Persisting accepted weeks** as `AssignedWorkout` rows under a rolling
   adaptive assignment, so the logger, Plan view and MCP work unchanged.
   `rebuildPlan` becomes "start adaptive". **First migration (`Proposal`,
   `locked`), so ask the user first and follow the backup steps in
   HANDOFF.md.**
7. **Coach review:** `review: first`, proposals in the Plan tab, edits recorded,
   locks, rejection reasons. Then assist mode for hand-built plans.
8. **Replay report** against coach-written plans; the user decides from it which
   clients move to `adaptive` and which to `auto`.
9. **`readNotes`** with the model, behind a flag; update `MODELS`; retire
   `generate_program` and point its MCP description at the outlook.
10. **MCP:** `get_today` returns the outlook (per mcp-roadmap); `plan_training`
    lets an athlete's AI ask for a re-plan with a note ("only have bands this
    week"), which goes through `readNotes`.

Cross-cutting risks:

- **Sparse data.** Most clients have < 12 weeks and many sets without RPE. Every
  rule has an "unknown" branch and the engine says less, not more, when it
  knows less; a brand-new athlete gets the old generator's foundation week,
  unchanged.
- **The engine drifts from the logger.** Both call `nextTarget`; the logger's
  "last week" block must show the same number the outlook promised. One shared
  function, `targetFor(exercise, state)`, and a test that the two agree.
- **Trust.** A coach who sees one bad suggestion stops reading them. `review:
  first` is the default for coached clients until the replay agreement is
  ≥ 80% for that coach's workspace; the user flips it, not the code.
