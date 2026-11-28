# Plan design rules

**Status: built (2026-11-27). Q1–Q4 answered by Davis (2026-11-24); rep ranges per goal kept as they were (Davis, 2026-11-27, below).** These are the defaults for the plan generator (`lib/plan/generator.ts`) and for the importer's post-process, the step after a sheet, PDF or screenshot is read into a plan (`lib/programs/read-plan-file` and the save path). Questions for Davis are marked **Q**.

## Rule A: every exercise has an explicit rep range
- Every rep-based exercise carries a range: `repMin` < `repMax` on each prescribed set (`lib/plan/prescription.ts`, stored in `prescribedSets`). Examples: 8–10, 6–8, 12–15.
- **A single number only on purpose.** Use `repMin === repMax` only when the plan says so (a test set, "5×5", an AMRAP marked as such), and record why in the set's note (e.g. `fixed: 5×5`), so the check can tell intent from a missing range.
- Timed work (`unit: "secs"`: planks, carries, holds) uses a time range on the same fields (30–45 s). Cardio is exempt; it has its own targets.
- **Generator:** every slot gets a range from its goal and role (`SCHEMES` in `lib/plan/generator.ts`). `planViolations` confirms none is missing and min is always below max.
- **Ranges per goal: the current ones stay (decided, Davis 2026-11-27).** The spec's examples (strength 4–6 / 5–8, muscle 8–12, general 10–15) were not adopted; the generator's numbers are better calibrated:
  | Goal | Main | Secondary | Accessory |
  |---|---|---|---|
  | Get stronger | 3–6 | 6–8 | 8–12 |
  | Build muscle | 6–10 | 8–12 | 10–15 |
  | General | 8–10 | 8–12 | 10–12 |
  | Lose fat | 8–12 | 10–15 | 12–15 |
  - Strength needs triples: 3–6 on the main lifts, not 4–6.
  - Hypertrophy main lifts work best at 6–10; 8–12 belongs to the secondary and accessory work.
  - General stays 8–10 on the main lifts.
  - The adjustments on top are unchanged: beginners' main lifts +2 reps, bodyweight moves at least 6 reps wide, post-rehab from 10 reps, timed holds 30–60 s.
- **Importer post-process:**
  - When a sheet gives one number ("3×10"), widen it **down**: the number becomes the top of the range, two reps below it the bottom (10 → 8–10, 6 → 4–6, 15 → 13–15), whatever the goal. Timed work widens down by 15 s (45 s → 30–45 s). The widened set is flagged in the preview's "uncertain" list as "range added".
  - "3×5" with a strength context stays fixed, with the note.
  - As built: "strength context" means 5 reps or fewer, whatever the goal; the note says what was written (`fixed: 3×5`, `fixed: 5×5`) and shows to the athlete as the set's note.
  - As built: timed work widens only between 25 s and 2 min. A shorter hold gets the fixed note; a longer duration, a distance (yd, m, cal) and cardio or mobility exercises are kept as written.
  - A range written in the sheet ("8-10", "8 to 10", "8–10") is kept exactly.
  - **Q1 (decided): widen down.** The written number is the top of the range.
- **Check:** a pure validator `planViolations(plan)` that lists exercises without a range. The generator's tests assert none; the importer shows violations in the preview before Save.

## Rule B: every workout contains at least one core or trunk exercise
- Counts: anti-rotation (Pallof press, dead bug, plank and its variants, bird dog), flexion (hanging knee raise, cable crunch, ab wheel), and stability or carries (farmer's carry, suitcase carry). These are the catalog's `core` region (`BodyRegion = "core"`): patterns `ANTI_ROTATION`, `ROTATION` and `CARRY`.
- **Generator today:** Upper A, Upper B, Push and Push B have no core slot (`lib/plan/generator.ts`, the day templates). Fix it by adding one, rotating `core` / `core2` / `core3`. Swap out the lowest-priority accessory if the day must stay at six exercises: Upper A's `triceps`, Upper B's `reardelt`, the Push days' `fly`.
- **Importer post-process:** if an imported workout has no core exercise, the preview flags it ("No core work on Day 2") and suggests one from the catalog that fits the equipment. It is added only when the coach or athlete accepts it; an imported plan is never rewritten silently.
- **Q2 (decided): no.** Conditioning and cardio-only days don't need a core exercise; the rule covers strength workouts only.
- **Q3 (decided): yes.** A loaded carry (farmer's, suitcase) counts as the workout's core exercise on its own.

## Next-session progression (from the post-workout feedback)
The suggestion for an exercise's next session (`lib/plan/overload.ts`, `nextTarget`):
- **Below the range** (any working set under `repMin`): keep the same weight next time. Don't progress, and don't drop either.
  - Today a session 2+ reps under the range drops the weight (`kind: "reset"`, estimated from e1RM). That stays only for the case where the range itself moved up (a new block or a rebuilt plan), not for a hard day at the same range.
- **Inside the range:** same weight; aim for one more rep on the sets that missed the top (today's `add_reps`).
- **At the top, consistently:** add the increment only when **every working set** at the working weight reached `repMax` in **two sessions in a row** of that exercise, at the same weight.
  - Today one set at the top in one session is enough (`bestReps >= repMax`).
  - **Q4 (decided): two sessions in a row.** One session at the top: same weight, "one more like that and you go up". The second: add the increment.
  - `nextTarget` then needs the last two sessions of the exercise, not only the last; the callers already read recent history for "last time".
- Timed and unloaded work progresses by reps or seconds as now.
- Tests: below range → hold; mixed (one set at the top, one under) → no increase; all at the top once → hold, with the "one more" line; all at the top twice in a row at the same weight → increase; at the top twice but at different weights → hold; range moved up → reset, as today.

## Where it applies
| | Generator | Importer post-process | Coach edits |
|---|---|---|---|
| A. rep ranges | enforced (defaults per slot) | widened and flagged | warned, not blocked |
| B. core per workout | enforced (template slot) | flagged, with a suggestion | warned, not blocked |
| Progression | n/a | n/a | applies to every plan, however it was made |

## Build notes
- Built: pure functions in `lib/plan/rules.ts` (`planViolations`, `widenDown`, core detection) and `lib/programs/plan-rules.ts` (the importer's range-added lines, core gaps and suggestion), wired into the generator's day templates and the import preview (`components/plan/CoreCheck.tsx`).
- The progression rule (two sessions in a row) shipped first, as post-workout item 1, and is live in `lib/plan/overload.ts`.
- Coach-edit warnings (the table's third column) are not built yet.
- No schema change: ranges already live in `prescribedSets`, and the fixed-on-purpose note fits the set's note.
- Existing plans are not rewritten. The progression rule changes the next suggestion for everyone from the release; the two shape rules apply to new and imported plans.
