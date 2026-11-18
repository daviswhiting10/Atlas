# Atlas handoff

Last updated 2026-11-17. Read this, then `CLAUDE.md`. Design docs are in `docs/`.

## Where things stand (read before running anything)
- **Live:** https://atlas-red-eight.vercel.app. Pushing `main` deploys it, so commit or push only when the user asks.
- **`origin/main` = the docs commit on top of `07f8a4b`, live (2026-11-18).** Nine releases shipped on 11-17 and 11-18, newest first: **Release 9, athlete-pass** (merge `7281125`; rollback **`e2d1978`**, production before it; athlete UI only, no schema, no coach, `lib/sessions` or MCP files): W3's athlete logger on the coach card list (tap to fold, hold-to-lift reorder, hover to superset, 5A/5B labels), a ⋯ per exercise (Swap only on coach plans), early Finish from the top ⋯ with Undo, a one-button Done screen, one line and one action on first-run Today, Progress tab hidden until a finished session, timed-exercise copy fix, a read-only history summary sheet, no empty Warm-up/Cool-down rows, and a stray-tap guard (400 ms after a fold, open or move, also on the +/- buttons). Checked by me: types, lint, 817 tests, build; the 24 session-write DB tests on a throwaway merge with `sessions-refactor` (24/24); and a 390×844 walk-through on dev-sessions with a fresh coach-assigned athlete (empty first run, Today, logger, 3 sets, hold-drag, hover superset, early Finish then Undo, reload, finish, Done screen, history sheet), all fine. **Watch after deploy:** a stray unchecked set after a drag, and a session finishing by itself after an Undo. Before that: **Release 8, stray-set-fix** (merge `50b2e87`; rollback **`65fd079`**, production before it; UI only, no schema or data change): W2's fix for a stray set after a double tap near the bottom of a card, a drop or a lift. A tap on a set tick is ignored for 400 ms after a fold, open or move; the drop keeps the header under the finger; the list keeps its height while a card is carried; the click after a lift is swallowed. W2 reproduced and fixed the earlier stray-set (two unchecked Bench Press sets) as a touch landing on another card's tick after the cards moved. Not browser-tested by me. Before that: **Release 7, Reorder v2** (merge `0b5f87a`; rollback **`06cff9b`**, production before it; UI only, no schema or data change): W2's hold-and-drag reorder in the coach logger (tap a header to fold or open, hold 250 ms to lift and drag, drop between cards to reorder, hold over a card's middle 500 ms to make a superset; no reorder mode, no Done chip), edge auto-scroll that ramps with depth, and the client Sessions tab no longer shows "0 sets". Checked at 390×844 on dev: tap to fold and open, hold-drag, between-card drop and hover merge all worked with no database writes. One unexplained thing: in my first run two unchecked Bench Press sets were saved (completed false) while I drove it with scripted events; three separate reruns of each gesture wrote nothing. This is now explained and fixed by release 8. Before that: **Release 6** (rollback **`f1bf03e`**, production before it; no schema or data change): W2's **history calendar** (`history-heatmap`, merge `07f8a4b`) replaces "Sessions a week" on the athlete's Progress and sits on the coach's client Sessions tab (3+ sessions); no empty Strength heading; no Progress tab on the client page until there's something to chart; plus the **AI fixes** (`75bd2dc`: `intake-pdf` for `pdf-parse` v2 with `pdf-parse` and `pdfjs-dist` external in `next.config.mjs`; `program-generate` cap 4096 to 8192). Checked at 390×844 on dev: Progress and the client Sessions tab. **Open items from release 6:** (1) PDF intake on production: upload one real PDF on a throwaway client (it writes an intake form and can change the client's goal); (2) MCP `generate_program` end to end (same call as `program-generate`, not run through MCP); (3) the history calendar's extra sets query: time it on production. Before that: **Release 5, Design pass 1** (merge `33c102f`; rollback **`bc38fc7`**, production before it; no schema or data change): Coach | Me toggle, client page, Today and Progress by the new Visual rules (`docs/principles.md`), coach logger without the jump bar, hold an exercise row to reorder (moving it up can group it into the block above, as 1B), and "Body measurements" removed from the client page ⋯. Checked at 390×844 on dev: client page, Today, Progress, the toggle (Coach goes to /log, Me to /today) and long-press reorder; nothing was logged or written. **Release 4** (rollback **`d7ca967`**, production before it; no schema change): the Body/Measurements UI cut (tables untouched; `log_measurement` parked in `docs/mcp-roadmap.md`), W2's **optimistic sets** (instant ticks, offline queue in `lib/sessions/pending.ts`, `logSet` finds an existing set instead of duplicating), and `night-run` (milestone fixes, arrow keys on tab pickers, dead code removed, Sonnet moved to `claude-sonnet-5-5` with thinking turned off in `lib/ai/client.ts`; tested on dev: photo plan import and session notes). Before that: **logger batch B** (`e388a9f`; 1 tap per set, auto-advance and auto-finish; rollback **`a3d6057`**), **Batch A** (UI cuts, one Import plan, Today leads with Start workout, e1RM in whole lb; rollback **`198e527`**) and W2's **readability** pass (coach logger redesign, six cuts; rollback `cb1cd98`). Earlier rollback points are in the table below.
- **Principles:** `docs/principles.md` (Musk lens, Tesla app patterns, targets, how we cut safely). `CLAUDE.md` says to read it before any task. Audit result: coach path is 2 taps to the first set, about 2 s; both loggers cost 1 tap per set plus 1 per new exercise.
- **Production database:** migrations up to `20261117010000_session_source_import` (additive: `IMPORT` added to `SessionSource`; backup `prod-before-import-source-20261116-201345.dump`). `dev-sessions` has the same. Never run `prisma migrate dev` on `main` against `dev-sessions`: it would offer to reset the database.
- **In flight:** my branch `sessions-refactor` (mcp-roadmap steps 1 and 2: `log_workout` timezone; session writes moved into `lib/sessions/write.ts`), shipping on its own as release 8 after release 7 is verified, so it can be rolled back separately; rollback for it will be release 7's production commit. Run its DB tests with `set -a; . ./.env.local; set +a; ATLAS_DB_TEST=1 npx vitest run lib/sessions/write.db.test.ts` (dev branches only).
- **Batch B check, one open item:** on dev, deleting a set that leaves everything logged showed the "Finishing… Undo" toast on both loggers, and an Undo in time left the session open for 50+ s. In two earlier runs a session finished 10–30 s after my Undo, with extra server calls; not reproduced in the monitored runs, and a screenshot between the hold and the Undo (the page counts as hidden, so toasts pause while the finish timer keeps running) probably explains one of them. Watch for sessions finishing by themselves.
- **AI smoke test (2026-11-18, dev, shipped in release 6):** all 10 callers of `lib/ai/client.ts` run on `claude-sonnet-5-5` with thinking off. Fixed: `intake-pdf` was broken before the model swap (`pdf-parse` is v2, so the old `require` call failed; now uses `PDFParse` and `next.config.mjs` marks `pdf-parse` and `pdfjs-dist` as external) and `program-generate` (route and MCP tool) was cut off at 4096 tokens (now 8192). Build with Atlas uses the rule-based generator, no AI. After the push, one real PDF intake on production is the only check not done on dev.
- **Still unconfirmed:** whether Vercel's `DATABASE_URL` uses the Neon `-pooler` host (the Vercel CLI login here has expired). The Body/Measurements screens are cut (UI only; the `Measurement` table and data are untouched).
- **Not done:** the speed ideas left over (Progress still reads every set a client has logged; Neon's 5-minute idle sleep).
- **Uncommitted files:** `Untitled` in the repo is the user's draft prompt. Leave it.
- **Design docs** on `main`: `docs/review-and-v1-scope.md`, `docs/screenshot-to-session.md`, `docs/training-types.md` (see "Training types" below).
- **The user's 75 Hard is live on production** (started Nov 4, carried in; a day count appears on Today).

## The work so far: the logged session is the core
| Step | What shipped | Commit |
|---|---|---|
| Context box | The coach's note on a plan import is authoritative; the page shows "Read as: …" | `8645e15` |
| Structure, live bar, history import | Warm-up / Block n (1A, 1B) / Cool-down everywhere (`lib/workouts/structure.ts`); the currently-logging bar (`lib/sessions/live.ts`); "Import completed weeks as history" with a review step first (`lib/programs/sheet-summary.ts`, source `IMPORT`); Programs moved to More. Merged with W2's `readability` (logger redesign, readability pass) and `atlas-goals`. Rollback: `f488e64`. | `aa04d66` |
| Logger readability (W2) | Merged `readability` into `main` (`d95b6cb`): coach logger with no block headings ("1A: Bench Press" labels), Reorder mode with the order kept in the live session, finished cards fold themselves, Change moved to each card's bottom row; Collapse all and the Resuming badge removed (W2's six cuts, `398f9c9`). Rollback: `cb1cd98` (main before it). | `d95b6cb` |
| Batch A: UI cuts (principles pass) | Cut: leads, AI session-notes page, program idea, redirect stubs, roster per-row delete and status filter, prospects' reach-out strip, exercise photo upload and Needs-a-photo, Records tab and Milestones page (now under Progress). Merged: one "Import plan" (spreadsheet or photos), /programs/new into the client's Plan tab ("Build with Atlas"). Today: Start workout first, 75 Hard below, outdoors by press-and-hold. The currently-logging bar hides after 3 h idle. e1RM shows whole lb. UI only: no schema or data changes. Rollback: `198e527` (main before Batch A). | `fadc143`…`3a47337` |
| Logger batch B (W2, both loggers) | 1 tap per set: auto-advance after an exercise's last set; auto-finish 5 s after the last set with an Undo toast (leaving inside the countdown finishes; reopening an all-logged, unfinished session restarts it); no Next/Done/Finish buttons; a new lift's first set can be logged with a blank weight; hold a set row to delete it, with Undo; the coach header's date, week and day are one chip. One server change: `completeSession` no longer clears saved notes when a call has none ("" still clears). No schema change. Rollback: `a3d6057` (production before this merge). | `e388a9f` |
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
- Body/Measurements screens: cut (UI only, table untouched). Replacement `log_measurement` is parked in `docs/mcp-roadmap.md`; a schema change needs the user's approval first.
- Is Vercel's `DATABASE_URL` the Neon `-pooler` host? Needs the user's Vercel settings or a fresh `vercel login`.
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
  - `atlas-production-before-goal-start-fix-20261115-082729.dump`: before the user's 75 Hard was moved to start Nov 4 (Day 12 on Nov 15). Undo with `goal-start-fix-20261115-reverse.sql`; the old row is in `goal-start-fix-20261115-before.json`.
  - `prod-before-import-source-20261116-201345.dump`: before `20261117010000_session_source_import` (adds `IMPORT` to `SessionSource`). Rollback commit for that release: `f488e64` (main before it).
- **Reversal file** for the date fix: `session-date-fix-20261113-115227.json`.
- **Neon branches:** listed in `CLAUDE.md`.
