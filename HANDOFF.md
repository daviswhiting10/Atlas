# Atlas handoff

Last updated 2026-11-15. Read this, then `CLAUDE.md`. Design docs are in `docs/`.

## Where things stand (read before running anything)
- **Live:** https://atlas-red-eight.vercel.app. Pushing `main` deploys it, so commit or push only when the user asks.
- **`origin/main` = `0dc0cd4`,** and that's what's live. On top of steps 1–4 and 75 Hard:
  - `lib/history/` (pure code, no screens yet);
  - the Dusk design pass;
  - auth deploy 1 (`ff73030`, set-password step off);
  - the date-field fix (`9a78a02`);
  - W2's simplification pass (`0dc0cd4`: one-tap workout rows, no separate page for a running goal, a simpler Today, Progress and You).
- **Rollback point** for the last deploy: `9a78a02`.
- **Local `main`** may be ahead with docs commits (this one included). Pushing deploys them; ask first.
- **Branch `auth-wip`:** merged into `main` on 2026-11-15 (see "Auth"). Nothing left on it.
- **Production database:** migrations up to `20261114012242_sign_in_safety` (the auth migration, applied 2026-11-14 with the user's OK, before any auth code). The live code doesn't read the new columns or tables yet. That's harmless because they're additive: nullable columns and two empty tables.
- **`dev-sessions` and production both have the auth migration** `20261114012242_sign_in_safety`, and `main` has its file since the auth merge.
  - On `main`, `prisma migrate status` will report a migration that's applied but missing.
  - **Never run `prisma migrate dev` on `main` against `dev-sessions`:** it would offer to reset (wipe) the database.
  - Database work can be done from `main` again.
- **Uncommitted files:** `Untitled` in the repo is the user's draft prompt about smoother transitions. Leave it.
- **Design docs** now on `main`:
  - `docs/review-and-v1-scope.md` (the review of the first four docs);
  - `docs/screenshot-to-session.md`;
  - `docs/training-types.md` (see "Training types" below).
- **The user's 75 Hard is live on production:** started Nov 4, Nov 4–14 carried in, Day 12 on Nov 15. It was moved from a mistaken Nov 15 start on 2026-11-15 (backup and undo file under "Backups and branches").
- **Local dev server:** may still be running on port 3000 against `dev-sessions`.

## The work so far: the logged session is the core
| Step | What shipped | Commit |
|---|---|---|
| Context box | The coach's note on a plan import is authoritative; the page shows "Read as: …" | `8645e15` |
| Structure, live bar, history import | Warm-up / Block n (1A, 1B) / Cool-down everywhere (`lib/workouts/structure.ts`); the currently-logging bar (`lib/sessions/live.ts`); "Import completed weeks as history" with a review step first (`lib/programs/sheet-summary.ts`, source `IMPORT`); Programs moved to More. Merged with W2's `readability` (logger redesign, readability pass) and `atlas-goals`. Rollback: `f488e64`. | `aa04d66` |
| Sheet import | "Import plan from spreadsheet" on every client page (opens the Plan tab's importer; `?tab=import` too). Drop or choose .xlsx/.csv (.xlsx read in the browser by `lib/programs/xlsx.ts`, so the server only sees CSV), or a Google link shared by link (redirects checked hop by hop, Google hosts only). | this commit |
| 1 | Report only | — |
| 2 | `WorkoutLog` gains `source`, `title` and `completedAt` (the only "done"). Plan status is derived, with a CHECK that keeps LOGGED out. Production: 711 → 713 sessions, sets identical. | `31bfcdb` |
| Timezone | A picked day is stored as noon in the viewer's timezone. 57 old midnight-UTC sessions were moved; the reversal file is in the backups folder. | `9154da9` |
| 3 | "Log a workout" outside the plan: autocomplete, last-time prefill, typed "new" names, one save plus an on-device copy | `828abb7` |
| 4 | Exercise library cleanup: 52 merges (hidden, reversible), 34 renames, alternate names, pictures locked, 123 imported names made private, muscles for 160 exercises. Batch `step4-production-2026-11-13`. | `ce331b5` |
| Docs | Design docs: goals, chapters, generator v2, MCP roadmap | `f39c6d2` |

## 75 Hard tracker (live since `71922ee`)
- **Code:**
  - `lib/goals/`: rules, the template, the evaluator, chapters, carry-in, the loader, Today view.
  - `lib/actions/goals.ts`, `components/goals/`, `/goals/new`, `/goals/[id]`.
  - The card on Today; chapters on Progress.
- **Tables:** `Goal` and `GoalCheckIn`, migration `20261114002845_goals_75_hard`. A goal reads finished sessions and never writes one; it stores only ticks, outdoor tags, its rules and the sealed chapter.
- **Quick log:** time-only workouts (a name and a time, no sets) are allowed (`a479ee2`).
- **The user starts the goal themselves** on their phone: start day Nov 4, days before the start carried in as "before Atlas". Nov 4 is day 1; the preview shows the day number before saving. Don't create it for them.
  - Whether they've started it yet is unknown; check production read-only if it matters.
  - Their "My training" profile had no sessions as of Nov 13.
- **Known gaps:**
  - Progress totals count only sessions with sets, so a walk doesn't add to "Workouts". Step 5 should count sessions themselves.
  - Strip state "before Atlas" is a sixth state, added on request.

## Auth (deploy 1 live; deploy 2, the set-password step, not yet)
**Why:** on iOS the installed home-screen app has its own cookies, so an email link opened from Mail signs in Safari, never the app. A password typed in the app fixes it.

**Workaround today:** Settings → Sign-in → Set a password, already in the app, then sign in in the installed app.

**Done on `auth-wip`:**
- **Additive schema:** `User.passwordChangedAt`, `User.passwordPromptAfter`, and the `PasswordReset` and `AuthThrottle` tables. Migration `20261114012242_sign_in_safety`, applied to `dev-sessions` only.
- **`lib/auth/throttle.ts`:** limits stored in the database so every server instance shares them. A blocked attempt answers exactly like a wrong one.
  - Wrong password, same email + IP: 5 free, then 30 s doubling to 15 min.
  - Wrong password, same email from anywhere: past 20 an hour, one a minute.
  - Attempts from one IP: 50 per 15 minutes.
  - Reset emails: 3 an hour per email, 10 per IP.
  - Wrong current password on change: 5 free, then 1 minute doubling to 15.
  - Never a permanent lock. Keys are keyed hashes (no raw emails or IPs).
- **Hashing:** scrypt N=2¹⁷, r=8, p=1, 163 ms locally. Old hashes are upgraded at the next sign-in.
- **Rules** (`lib/password-rules.ts`): 10+ characters. Refuses common and patterned passwords, and ones containing the email name. It's a short curated list; a full breach list would need a download, so ask first.
- **Sessions:** 180 days, extended by use. The `jwt` callback re-checks the database at most every 10 minutes:
  - it signs out a session from before a password change;
  - it sets `needsPassword` for the set-password step.
- **Step switch:** the step is off by default (`STEP_DEFAULT` in `lib/auth/session-policy.ts`). `AUTH_PASSWORD_STEP=on|off` overrides it.
- **Session renewal after a change:** only the server action that changed the password can renew the session's stamp (`lib/auth/proof.ts`, an HMAC).
- **Reset tokens** (`lib/auth/reset.ts`): 32 random bytes, only the SHA-256 stored, 30 minutes, used up when the new password is saved (not when the page opens). A new request cancels older ones.
- **Email:** `lib/email.ts`. It prints to the dev log when `RESEND_API_KEY` is empty.
- **Unchanged:** the email link, and `AUTH_SECRET` (never rotate it).

**Finished 2026-11-14, merged into `main` and deployed 2026-11-15 with the set-password step off (deploy 1):**
- **Server actions** (`lib/actions/account.ts`): `passwordProblem` on create, save-guest and set; the `changeUser` limit on a wrong current password; changing a password writes the stamp (signing out other devices) and renews the caller's session with a proof, while a first password leaves other devices signed in (user's decision, 2026-11-14); `snoozePasswordStep`; `requestPasswordReset` (same answer, padded to 1.5 s, nothing sent to guests or unknown emails); `resetPassword` (rules before the token is used; token and password saved in one transaction; that email's limits cleared).
- **Pages:** `/forgot-password`, `/reset-password` (no referrer), `/set-password` ("Not now" only when allowed, sign-out link), and "Forgot password?" on `/login`. Forms are in `components/auth/password-forms.tsx`.
- **Middleware rewritten** (`middleware.ts`, rules in `lib/auth/route-policy.ts`). Two bugs in the earlier design, both confirmed in the next-auth source:
  - Middleware re-signed the cookie with Auth.js's default 30 days, because `session` settings lived only in `lib/auth.ts`. They're now in `lib/auth.config.ts`.
  - The 10-minute database re-check never saved: server components can't set cookies, and middleware ran only the light callback. So `needsPassword` never reached middleware, and a device signed in before a password change would loop between `/login` and home. Now the middleware decodes the cookie itself, and when its check is over 10 minutes old it calls `/api/auth/session` (which re-checks and saves) and passes the new cookie both to the browser and to the page for that same request.
  - The kill switch reaches a session already held at the step at its next check (≤ 10 minutes).
- **Break-glass:** `scripts/auth/set-password.ts [--prod] <email>`. It reads the password from `/dev/tty` with echo off. If `!` in Claude Code has no terminal, it says so; then run it in a Terminal window.
- **Tests:** unit tests for every auth module plus the actions (`lib/auth/*.test.ts`, `lib/actions/account.test.ts`, in-memory DB in `lib/auth/test-db.ts`). 637 pass. All the app checks above passed against a production build on `dev-sessions`. Their QA accounts were removed afterwards.
- **Rehearsal:** `rehearsal-auth` done. All 38 existing tables match on row count and hash (`User` on its old columns), plus 2 new empty tables and 1 migration record. On production as copied: 31 users, 4 link-only accounts (3 coaches, 1 client) that deploy 2 would ask, all old enough for "Not now".
- **Deploy 1, part 1 done (2026-11-14):** backup `atlas-production-before-auth-20261114-071525.dump` (39 tables of data, checked), then `migrate deploy`. All 38 existing tables matched before and after (and matched the rehearsal copy), plus 2 new empty tables and 1 migration record.
- **Deploy 1, part 2 (2026-11-15):** the code was merged into `main` and pushed. The break-glass script was tested beforehand in a pseudo-terminal on `dev-sessions`: it sets the password, writes the stamp, refuses a common or mistyped password, and refuses production without `ALLOW_PROD=1`.
- **Left:** the user sets a first password in Settings → Sign-in and signs in inside the home-screen app. Then deploy 2: `STEP_DEFAULT = true` (or `AUTH_PASSWORD_STEP=on` in Vercel).

**Rollout the user approved:**
1. Rehearsal branch `rehearsal-auth` from production, with the same fingerprint comparison of every existing table. Note: the two new `User` columns change the whole-row hash, so compare `User` on its old columns only. Stop and show the user before production.
2. **Deploy 1:** backup, migration, code, with the set-password step **off**. Verify: the user's current session survives, password sign-in works, the email link works, a reset email reaches them.
3. **Deploy 2:** turn the step on (`STEP_DEFAULT = true`).

**Rule: auth code must not deploy without its migration.** `lib/auth.ts` reads `AuthThrottle` on every password sign-in.

**Decisions (user, 2026-11-14):**
- Google accounts are offered a password, not forced.
- Existing accounts may tap "Not now", which waits 7 days. New accounts must set one straight away.
- Sessions last 180 days, extended by use.
- Defer the Resend sending domain (backlog).

**Open:** the two real coach logins with no password are `d***s@a*******.co` (created May 13) and `d************0@g****.com` (created May 15, has the My training profile). The user will say whether the first is theirs.

## Training types (designed 2026-11-15, not built)
**Design:** `docs/training-types.md`.
- Anyone picks a well-known challenge or workout type and logs it with an interface that fits.
- **Four built interfaces:**
  - **checklist:** the 75 Hard card;
  - **sets:** the logger and Log a workout;
  - **scored:** for time, AMRAP or load;
  - **endurance:** distance and time.
- **A template is only data:** its sessions, schedule, scoring and which interface logs each session. The AI fills in a strict format (choices from fixed lists, numbers, short plain-text labels). It never writes UI or code.
- **One history:** every result is an ordinary session. Records are derived, as for lifts, so the heatmap, chapters and timeline read one place.
- **Schema (additive):**
  - `WorkoutLog`: template, session, benchmark, variant, score, a sortable `scoreValue`, capped; and activity, `distanceM`, `elapsedSec`, `elevationM`;
  - `SetLog`: `seconds`, `distanceM`;
  - `ClientProfile.distanceUnit`;
  - a `TrainingTemplate` table (immutable versions; replaces the planned `GoalTemplate`);
  - `Goal.plan`.
- **Starter library:** 75 Hard, Murph, Fran, Cindy, Cooper 12-minute test, 5 km time trial, Couch to 5 km, half marathon, marathon, 5×5 strength.

**Decisions (user, 2026-11-15):**
- **Units:** miles by default, a profile setting, stored in metres.
- **75 Hard stays strict:** a workout counts only if its recorded duration is 45+ minutes. Durations are rounded down.
- **Gold:** benchmark records are gold on the heatmap.
- **Training limits:**
  - coaches can raise them for their own clients, up to a hard ceiling, with every override logged on the template version and in `AuditLog`;
  - athletes and the AI can't.
- **"Not medical advice":** every plan and challenge preview carries the line.

**Its build order** (each slice is migration-first: backup, rehearse, compare, apply, then code):
1. **Week 1, scored benchmarks:**
   - Murph, Fran and Cindy as built-ins, plus the scored interface;
   - benchmark history and records (`lib/history/benchmarks.ts`);
   - "Log a benchmark" next to Log a workout.

   No AI, no plans. Needs no other step first.
2. **Week 2, endurance:**
   - the endurance columns and `distanceUnit`;
   - the endurance interface;
   - the 5 km time trial and Cooper test.
3. **Week 3, templates and plans:**
   - `TrainingTemplate` and `draftTemplate` (match a built-in first, then Sonnet 5.5 with validation);
   - Couch to 5 km (explicit schedule);
   - then the progression expander and the half and full marathon;
   - the new goal rule kinds (`scheduled`, `weekly_total`, `benchmark`);
   - coach limit overrides.
4. **Later:** the MCP tools (`find_templates`, `draft_template`, `log_session` with scores), and the generator v2 hookup (planned runs become fixed days).

## Decisions so far (all by the user)
**Sessions:**
- A session's date is the day it was done (default today, editable).
- The session alone decides completion.
- Off-plan logging is for coaches and athletes.
- The quick log allows new names with a "new" tag, has one save plus an on-device copy, and gives a new exercise 3 empty rows (or last time's sets).
- Time-only workouts (a name and a time) are allowed.

**Streaks:** weekly, default 3 sessions a week, configurable per client (the per-client setting isn't built yet). The data stays daily.

**Exercises:**
- Short names, except "Low Cable Crossover".
- Old names kept as alternate names, and pictures locked before renaming.
- Merges are logged, reversible, and never cross workspaces.
- "Assisted Pull-Up / Lat Pulldown" stays as two entries.
- The Nov 11 workspace is test data; leave it alone.
- Imported names go private to the workspace that uses them.

**Muscles:**
- 9 groups. Each set counts once, toward its first main muscle.
- Conditioning and mobility are left out of volume.
- Sled Push = conditioning, Depth Drop = quads, Scapular Wall Slides = mobility.

**Units and weeks:** lb everywhere. Calendar weeks start Monday; a goal counts its weeks from its own start.

**75 Hard:**
- Two 45-minute workouts; the outdoor one counts as one of the two.
- A rule added mid-run counts from today; a removed one stops from tomorrow. Past days keep their result.
- Progress photo is a tick only.
- A day closes at the end of the next day. After a miss, the next calendar day is day 1.
- The chapter is a draft for 48 hours, then sealed.
- Days before Atlas are carried in.
- One goal at a time; guests can't start one.

**Process:** branch first; backup checked with `pg_restore --list`; rehearse on a branch; compare before and after; stop on any mismatch; show the user before production.

## Build order from here
1. **Finish auth:** deploy 1 is live. Left: the user sets a password and signs in inside the home-screen app; then deploy 2 (the set-password step on).
2. **Step 5 charts,** built on `lib/history/` (already merged, tested, no screens yet):
   - PRs over time
   - weekly hard sets by muscle group
   - calendar heatmap
   - weekly streaks with the per-client target (default 3)
   - Count sessions themselves, so time-only workouts appear.
3. **History and chapters view:** `docs/archive-and-chapters.md`. `lib/history/lifetime.ts` and `lib/history/timeline.ts` exist.
4. **Screenshot → logged session:** a photo of a finished workout becomes an off-plan session (source SCREENSHOT), with names going through `findExerciseByName`.
5. **MCP fixes:** `docs/mcp-roadmap.md` section 5. First, `log_workout`'s date is noon in the server's zone (`lib/mcp/tools/workouts.ts`). Then off-plan logging, then shared session writes.
6. **Generator v2:** `docs/generator-v2.md`.
7. **Training types:** `docs/training-types.md`, in the three slices under "Training types".
   - Slice 1 (scored benchmarks) depends on nothing above, so it can move earlier if the user wants.
   - Its heatmap gold needs step 2's heatmap.
   - Its plans should land before generator v2 treats planned runs as fixed days.

Check this order against `docs/review-and-v1-scope.md` before planning.

## Design direction
- **Feel:** paper and ink, not a dashboard. Bone background, white surfaces, near-black ink, one green (`--signal`) meaning "you trained", gold only on personal records, `--night` for dark feature surfaces.
- **Structure:** hairlines and spacing instead of cards (like `StatRow`). Serif numbers and titles (Instrument Serif), Geist for text, mono eyebrows for dates.
- **Words:**
  - Fewer of them; cut anything that's noise.
  - Plain words, and never "missed", "failed" or "lost" in athlete-facing copy.
  - A gap is shown as quiet, not as failure.
- **No social layer:** no feed, likes or leaderboards.
- **Mobile first:** check at 390px.
- **Motion:** restrained. Reduced-motion is honoured.

## Open questions
- Two set-less sessions on production from a churned client added May 21: real client or test data?
- Body measurements are still entered in kg; does "lb everywhere" cover body weight?
- Plan imports still link a name to a library name that contains it (`lib/programs/resolve-exercise.ts`, step 3). Replace that with a pick-from-close-matches screen?
- Whether picking a library exercise after typing something else should save an alternate name.
- 47 imported names no one uses are still in the shared library.
- Meal photos and the minor flag (goals doc).
- Whether the email-link form should stop revealing which addresses have accounts. Today it says links are for existing accounts.

## Backlog
- Switch a set to seconds by hand for timed exercises (`IDEAS.md`).
- **Verify a sending domain in Resend before inviting any client** (`IDEAS.md`). The test sender only delivers to the Resend account owner.
- Smoother transitions and loading states: the user's prompt in `Untitled` asks for the 5 jankiest first, as a list, then which to tackle.
- Progress totals should count time-only sessions (step 5).
- Quick-log search should match shorthand through `nameKey` and alternate names.
- In-app AI model ids in `lib/ai/client.ts` are out of date.
- Guest accounts are never cleaned up; the sign-up limit in `lib/actions/account.ts` is still in memory.
- `prisma/seed.ts` deletes exercises that aren't in its list. It's guarded from production, but should be rewritten.
- A full common-password list for the password rules.
- Chart accessibility (`docs/STATE.md`).

## Backups and branches
- **Backup folder:** `~/Documents/atlas-backups/` (chmod 600).
- **Production dumps, in order:**
  - `atlas-production-20261113-113909.dump`: before the sessions migrations
  - `atlas-production-before-date-fix-20261113-115223.dump`
  - `atlas-production-before-step4-20261113-162152.dump`
  - `atlas-production-step4-apply-20261113-164259.dump`
  - `atlas-production-goals-apply-20261113-195343.dump`
  - `atlas-production-before-auth-20261114-071525.dump`: before the auth migration
  - `prod-before-import-source-20261116-201345.dump`: before `20261117010000_session_source_import` (adds `IMPORT` to `SessionSource`). Rollback commit for that release: `f488e64` (main before it).
  - `atlas-production-before-goal-start-fix-20261115-082729.dump`: before the user's 75 Hard was moved to start Nov 4 (Day 12 on Nov 15). Undo with `goal-start-fix-20261115-reverse.sql`; the old row is in `goal-start-fix-20261115-before.json`.
- **Reversal file** for the date fix: `session-date-fix-20261113-115227.json`.
- **Neon branches:** listed in `CLAUDE.md`.
