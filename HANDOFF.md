# Atlas handoff

Last updated 2026-11-13. Read this and `CLAUDE.md` before doing anything else. The design docs for what comes next are in `docs/` (listed under "Build order").

## Where things stand
- **Live:** https://atlas-red-eight.vercel.app. Pushing to `main` deploys (Vercel). Commit or push only when the user asks.
- **`main`** has everything below. The design docs from the `atlas-goals` branch were merged into it (`f39c6d2`).
- **Production database:** schema and data are fully up to date through step 4. Nothing is mid-flight.
- **Local dev** runs on the Neon branch `dev-sessions`, which has the same schema and step 4 batch as production plus QA data. It is never production. See `CLAUDE.md`.
- **Untracked files:** `Untitled` is the user's own draft prompt about smoother transitions (see Backlog). Don't commit or delete it.

## The work so far: making the logged session the core of the app

**Context box fix (`8645e15`):** when importing a plan, the coach's note ("4-week block, 2 legs + 2 upper, start at week 1") is authoritative.
- Rule-based reading wins over the model's (`lib/programs/plan-context.ts`).
- The page shows "Read as: …" so a misread is visible before saving.
- The sheet import got the same box.

**Step 1: report** (no commit). The findings:
- Sessions (`WorkoutLog`) could already exist without a plan.
- "Done" was stored in two places.
- There was no off-plan logging.
- Most exercises had no muscles.
- Name matching created duplicates.

**Step 2: the session is the core record (`31bfcdb`, migrations `20261113120000_sessions_core` and `20261113120100_session_is_completion`):**
- `WorkoutLog` gained:
  - `source`: PLAN, GENERATED, MANUAL, SCREENSHOT or OFF_PLAN
  - `title`
  - `completedAt`: the only meaning of "done"
- A plan workout's status is derived from its session (`lib/sessions/status.ts`). A database CHECK stops the status LOGGED from being stored.
- Applied to production with a backup and a before/after comparison:
  - Sessions went from 711 to 713. The 2 new ones were created for plan workouts that were marked done without a session.
  - Sets stayed at 13,640, identical.
  - Charts were identical for all 34 clients.

**Timezone fix (`9154da9`):**
- A picked day is saved as noon in the viewer's timezone: `lib/sessions/day.ts` `dayToDate`, plus the `tz` cookie.
- Plan days stay calendar-midnight UTC.
- 57 old sessions stored at midnight UTC were moved to noon New York, or the client's own timezone.
  - The reversal file is in `~/Documents/atlas-backups/session-date-fix-20261113-115227.json`.
  - Session counts per client were unchanged.
  - Weekly counts shifted for 3 clients.

**Step 3: log a workout outside the plan (`828abb7`):**
- Entry points:
  - Coaches: "Log a workout" on a client page.
  - Athletes: "Log a different workout" on Today, or "Log a workout" when they have no plan.
- On the screen:
  - Autocomplete with shorthand.
  - Recent exercises.
  - Sets prefilled from last time, or 3 empty rows.
  - Typed names saved with a "new" tag.
  - One save, plus an on-device copy.
- Off-plan sessions get an "Edit workout" link.
- Files: `lib/sessions/quick-log.ts`, `lib/actions/quick-log.ts`, `components/sessions/QuickLog.tsx`.

**Step 4: exercise library cleanup (`ce331b5`, migration `20261113211700_exercise_library_cleanup`, data batch `step4-production-2026-11-13`):**
- Matching for typed, imported and assistant names: exact name, then a saved alternate name, then the same name written differently. Code: `lib/exercises/names.ts` `nameKey`, `lib/exercises/find.ts`.
- Changes on production:
  - 52 duplicates merged (hidden through `mergedIntoId`, never deleted).
  - 34 renames to short names.
  - Old names kept as alternate names (`ExerciseAlias`).
  - Pictures locked before renaming.
  - 123 imported names moved from the shared library into the coach's workspace.
  - 160 exercises given muscles: 75 from a list the coach checked, 85 from free-exercise-db.
- Every change is in `ExerciseChange` and can be undone (see `CLAUDE.md`).
- Production before/after matched everywhere. The coach's 963 sets all have a group now: 875 muscle group, 44 conditioning, 44 mobility (before, 803 had none).
- Lat Pulldown is now 1,138 sets and Barbell Row 631, as the user predicted.
- The plan and the muscle list are in `scripts/exercise-cleanup/plan.json` and `muscles.json`.
- Muscle groups for charts are in `lib/exercises/muscles.ts`.

**Also:** a backlog note (`7180e15`), and `prisma/seed.ts` refusing production (`lib/db/production.ts`).

## Decisions made (all by the user, 2026-11-13)

**Sessions**
- A session's date is the day it was performed (default today, editable), never the scheduled day.
- The session is the only source of truth for completion; plan-workout status is derived, never stored.
- Off-plan logging is for coaches and athletes both.
- Quick log:
  - new exercise names are allowed, with a "new" tag
  - one save at the end, plus an on-device copy
  - a brand-new exercise starts with 3 empty rows
  - if there's a "last time", that many sets are prefilled
- Streaks:
  - counted in weeks, with a default target of 3 sessions/week, configurable per client
  - the data stays daily, so a daily streak (75 Hard) can be added
  - the per-client target isn't built yet; it goes with step 5
- Old sessions with no timezone use the client's saved timezone, else America/New_York.

**Exercises**
- Short names everywhere. The exception is "Low Cable Crossover" (not "Cable Fly"; "Cable Fly" is kept as an alternate name).
- Old names stay as alternate names, and pictures are locked before any rename.
- Every merge is logged and reversible. Merges never cross workspaces.
- "Assisted Pull-Up / Lat Pulldown" stays as two entries: the logs can't show it's the same movement.
- Imported names go private to the workspace that uses them, except names another workspace uses.
- The Nov 11 workspace (`cmwc3qx8x0000rlrlvuvbq3ql`) is test data. Leave it alone.

**Muscle groups**
- The 9 groups are Chest, Back, Shoulders, Arms, Quads, Hamstrings, Glutes & hips, Calves and Core.
- Each set counts once, toward the group of the exercise's first main muscle.
- Conditioning (bike, sled, ropes, treadmill) and mobility (stretches, foam rolling) are excluded from volume.
- Specific calls: Sled Push = conditioning, Depth Drop = quads, Scapular Wall Slides = mobility.

**Units and weeks**
- lb everywhere.
- Calendar weeks start on Monday (`mondayOf`) for the heatmap and lifetime stats.
- A goal counts its weeks from its own start day.

**Goals** (details in `docs/goals-layer.md`):
- Running goals are **Goals** and finished ones are **Chapters**. **Challenges** is a template category.
- A goal reads sessions and never writes to them.
- Athletes can start a goal on their own.
- There is no daily job: goals close and chapters seal when they are next read.
- No photos while a client's minor flag is set. A youth team is asked about when the group is created.

**Process**
- Rehearse on a Neon branch, back up, compare before/after, and stop on any mismatch without fixing on the fly.
- Show the user what changed after each step. They approve before production.

## Build order from here
1. **Basic 75 Hard tracker** (athlete side, the user is its first user). Follow `docs/goals-layer.md` rollout steps 1–3:
   - pure `lib/goals/rules.ts` and `evaluate.ts` with tests (reset rule, late logs, needs-duration, UTC+13 and UTC−10)
   - one additive migration (Goal tables, `ClientProfile.timeZone`, `ClientProfile.isMinor`), which needs the user's OK and the full backup procedure
   - start a goal, Today check-ins, the outdoor and duration prompts
   - check first that the user's own account has a client profile
2. **Step 5: charts**, built from session history:
   - PRs over time per exercise
   - weekly volume by muscle group (`lib/exercises/muscles.ts`)
   - calendar heatmap
   - current and longest streaks, with the per-client weekly target (default 3)
3. **History and chapters view:** `docs/archive-and-chapters.md`, build order section 6.
4. **Screenshot → logged session:** a photo of a finished workout becomes an off-plan session with source SCREENSHOT. It goes through `findExerciseByName`.
5. **MCP fixes:** `docs/mcp-roadmap.md` section 5.
   - First, `log_workout`'s date: it is still noon in the server's zone (`lib/mcp/tools/workouts.ts:229`).
   - Next, it can't log off-plan.
   - Then share the session writes with the app.
6. **Generator v2:** `docs/generator-v2.md` section 7.

## Open questions
- **Two set-less sessions** on production from a churned client added May 21 (created by the step 2 migration for workouts marked done by the coach). Real client or test data? The user hasn't answered. If they're test data, remove them on a branch first.
- **Basic 75 Hard scope:** which rules in v1? Two workouts, one outdoors, 45 min each, diet, water, reading and a progress photo are the standard ones. Is the photo rule in or out for v1 (the minor-flag rules)?
- **Where the coach sets a client's weekly streak target,** and whether athletes can change their own.
- **Body measurements are still in kg** (measurement form, body progress page). Does "lb everywhere" cover body weight?
- **Plan imports and close names:** `lib/programs/resolve-exercise.ts` step 3 still links an imported name to a library name that *contains* it ("Seated cable row" → "Seated Cable Row"). That predates step 4. Replace it with "offer close matches for the coach to pick"? That needs a review screen.
- **Confirmed matches** (alias source "confirmed") aren't written anywhere yet. Should picking a library exercise after typing something else save an alternate name?
- **47 imported names no one uses** are still in the shared library. Leave them or remove them?
- **Meal photos** (`NutritionEntry.photoUrl`): covered by the minor flag? The design doc's safe default is yes.
- **The Nov 11 test workspace:** delete it eventually?

## Backlog
- Switch a set to seconds by hand for timed exercises (`IDEAS.md`).
- Smoother transitions and loading states: the user's draft prompt in the untracked `Untitled` file. It asks for the 5 jankiest transitions as a list first, then a question about which to fix first.
- Quick-log search: shorthand in the query ("db rdl") relies on the merged clean names. Searching by `nameKey`, or by alternate names written in shorthand, would make it sturdier.
- In-app AI model ids in `lib/ai/client.ts` are old (`claude-sonnet-4-6`, `claude-haiku-4-5…`). Update them (generator v2 step 9).
- Guest accounts are never cleaned up, and the sign-up limit is per instance (`docs/STATE.md`).
- In-plan exercises without a picture: coaches can upload on `/exercises`.
- `prisma/seed.ts` deletes exercises not in its list. It's guarded from production now, but should be rewritten to not delete.
- Chart accessibility: no text alternative, and the tab pickers don't support arrow keys (`docs/STATE.md`).
