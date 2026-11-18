# Night report (branch `night-run`, 2026-11-17)

**Summary**
1. Six commits on `night-run`, nothing pushed or merged. No database, schema, env or CI changes; nothing in `.env*` was read or created.
2. Task 1: most of `lib/history` already existed. I added the milestone fixes (gaps 5, 6, 7) as a pure module plus tests, and one gap-1 test.
3. Task 2: arrow keys on 3 tab pickers. Chart text alternatives skipped: every live chart is in a file you told me not to touch.
4. Task 3: removed 7 dead files and 8 dead functions; added 11 edge-case tests for `lib/sessions/flow.ts`.
5. Task 4: Sonnet moved to `claude-sonnet-5-5`, confirmed on the Anthropic models page. **Review this one** (behaviour and cost change).

Checks before every commit: `tsc` clean, `next lint` clean, `vitest` all pass (761 at start, 787 at end), `next build` passes. The build needs env vars at import time, so I ran it with dummy placeholders (`DATABASE_URL=postgresql://dummy:dummy@localhost:5432/dummy`, dummy `AUTH_SECRET`, `AUTH_URL`, empty `RESEND_API_KEY`). It never touched a database.

## Task 1: archive and chapters, steps 1 to 3
Already on the branch before tonight: `days.ts`, `lifetime.ts` (it already counts finished sessions with no sets, so gap 1 is fixed in the pure function), `timeline.ts` with the five-a-month cap, gap and comeback rules, and their tests.
- `4f10463` **Milestone fixes.** New pure `lib/progress/milestone-rules.ts` with tests; `lib/progress/milestones.ts` uses it.
  - Gap 6: session milestones count only finished sessions (`completedAt` set). All callers set it before calling.
  - Gap 5: each milestone is dated by the session that reached it. Strength milestones use the session's `date`.
  - Milestones are derived from all finished sessions on every call, so a missed call is made good later. Previously they fired only at an exact count (`=== 25`).
  - Gap 7: `first_pr` is now "heaviest weight so far" (same rule as `lib/history/records.ts`). The `strength_*pct` milestones are unchanged.
  - Copy follows the copy rules ("First session", "25 sessions", no exclamation marks).
- `b51071f` Test: a history of set-less sessions counts in every lifetime stat.

Skipped: replacing `totals` in `loadProgress` (`lib/athlete/totals.ts`). It changes what the Progress screen shows, and Progress is W2's.

## Task 2: accessibility
- `5d676ed` Arrow keys, Home and End, with roving tabindex, on `ConnectTabs`, the `ExerciseLibrary` filter and the `PlanView` week picker. Shared handler `lib/ui/tab-keys.ts`, tested.
- Skipped: other tab pickers (`ClientDetail.tsx`, `WorkoutLogger.tsx`; client page and logger). Chart text alternatives: the live charts are `components/athlete/ProgressChart.tsx`, `OverallChart.tsx` and `WeightTrendChart` (Progress and client page). The other four chart components were dead and are deleted (task 3). Do the live ones once W2's Progress work lands.

## Task 3: dead code and tests
- `d6a5e9b` Removed: `components/status-badge.tsx`; charts `E1RMLineChart`, `HeroProgressChart`, `VolumeBarChart`, `WeeklyStrengthChart`; `lib/coach/stalls.ts`; `lib/programs/from-parsed.ts`; `getMethodology`, `runRetentionHeuristic`, `getClientAssignments`, `eachDay`, `renameWorkout`, `weekStreak`, `isEnduranceSet` (and the tests of the last two). I checked every local branch: only old branches (agents-demo, athlete-app and so on) still import them, none of the live ones.
- `d6f300c` 11 new edge-case tests in `lib/sessions/flow.test.ts` (empty lists, single exercise, wrap-around, out-of-range index, no mutation, finish delay).
- Left alone on purpose:
  - `app/(dashboard)/clients/[id]/progress/_components/StatTile.tsx` and the now-unused `VolumePoint` type in `ProgressShell.tsx` (Progress and client page; W2's).
  - `components/fade-in.tsx` and `lib/history/index.ts` (the History page needs them).
  - Unused shadcn parts in `components/ui/` (`sidebar`, `table`, `tabs`).
  - `lib/mcp/stdio.ts` (a package script runs it).
- Pure files still without tests: `lib/goals/days.ts`, `lib/goals/templates.ts`, `lib/history/copy.ts`, `lib/plan/catalog.ts`, `lib/plan/goal.ts`, `lib/programs/categories.ts`, `lib/progress/format.ts`.

## Task 4: model ID
- `de1bead` `MODELS.sonnet` is now `claude-sonnet-5-5`. The Anthropic models overview lists it as the current Sonnet at $2 in and $10 out per million tokens, and the cost table in `estimateCostCents` follows that. Haiku (`claude-haiku-4-5-20251001`) is unchanged: the page lists Haiku 5.5 as `claude-haiku-5-5`, but the task named only Sonnet.

## Decisions for you to review
1. **Sonnet swap** changes the model for every AI feature (intake, programs, imports). Revert `de1bead` if you want to test it first; I haven't run a live AI call (no API key here).
2. **Removing `runRetentionHeuristic`**: nothing called it any more (the inbox that did was cut in Batch A), so clients are no longer flipped to AT_RISK automatically. That was already the case; the code is just gone.
3. **`first_pr` rule change** (heaviest weight, not e1RM over a baseline) and the new milestone titles apply to new awards only. Stored milestone rows are unchanged. Body milestones still say "lost" (`checkBodyMilestones`); I left them because the Body screens are pending your cut decision.
4. `milestones.ts` now reads every finished session's date on each session finish. That's one small query per finish; fine for now.
