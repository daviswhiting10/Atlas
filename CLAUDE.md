# Atlas: working notes

Read docs/principles.md before any task. Delete before you add; ship the simplest working version; report taps and seconds.

Start with `HANDOFF.md` (where things stand, decisions, build order). Design docs for what's next are in `docs/`.

## Databases
- Production is the Neon branch `production` (endpoint `ep-nameless-field…`). Local development points at a Neon branch (`dev-sessions`), never production.
- Never run migrations, tests, seeds or data scripts against production while developing. Rehearse on a fresh branch copy of production first.
- Changing production data: take a full backup (`pg_dump`, saved outside the repo, checked with `pg_restore --list`), rehearse on a branch, compare before/after counts, then apply. Stop if any count differs.
- `prisma/seed.ts` refuses to run against production (`lib/db/production.ts`): it rewrites the exercise library and deletes exercises missing from its list.
- Scripts in `scripts/exercise-cleanup/` refuse production unless `ALLOW_PROD=1`. Every change they make is logged in `ExerciseChange` and can be reversed with `undo.ts`.
- **Code must never deploy ahead of the migration it reads.** Apply the migration first (backup, rehearse, compare), then push the code. The auth migration `20261114012242_sign_in_safety` is now on production (2026-11-14), and the code that reads it is on `main`.
- `dev-sessions` and production both have `20261114012242_sign_in_safety`, and `main` has its file since the auth merge (2026-11-15).
- `20261117010000_session_source_import` (additive enum value `IMPORT`) is on `dev-sessions` and on production (2026-11-16, backup `prod-before-import-source-20261116-201345.dump`; every table's count matched). Rolling the code back past it: once a history import has written `IMPORT` sessions, older code can't read them, so first set them to `PLAN` (`UPDATE "WorkoutLog" SET source='PLAN' WHERE source='IMPORT'`, with a backup) or roll forward.
- Read-only queries against production are allowed for counts, always in a `BEGIN READ ONLY` transaction, never printing names or emails (mask them).

### Branches (Neon project "Atlas", `mute-breeze-39649971`)
| Branch | What it is | Keep until |
|---|---|---|
| `production` | Live data | Always |
| `dev-sessions` | Local dev and tests (`.env.local` `DATABASE_URL`). Holds a copy of real clients plus QA data, so don't expose it. | Ongoing |
| `rehearsal-step4` | Production copy where the step 4 exercise cleanup was rehearsed | Until the user says |
| `rehearsal-goals` | Production copy where the goals migration was rehearsed | Until the user says |
| `rehearsal-auth` | Production copy (2026-11-14) with `20261114012242_sign_in_safety` applied; every existing table matched | Until the user says |
| `dev-prod-copy` | Production as it was before the sessions migrations (rollback reference) | 2026-11-20 |
| `rehearsal-goal-start` | Production copy where the 75 Hard start-day fix was rehearsed (2026-11-15) | 2026-11-20 |
| `rehearsal-import-source` | Production copy (2026-11-17) with `20261117010000_session_source_import` applied (adds `IMPORT` to `SessionSource`); every table's count matched | Until the user says |

Git branches: `main` (deploys; `6a1c7b8` on 2026-11-17, rollbacks: release 4 `d7ca967`, batch B `a3d6057`, Batch A `198e527`, readability `cb1cd98`); `auth-wip`, `readability`, `logger-batch-b`, `night-run` and `optimistic-sets` are merged into `main`. In flight: W2's `design-pass-1` (worktree `~/Documents/atlas-readability`, Coach | Me toggle and the new visual rules), to be rebased by W2, not merged until the user says. `atlas-goals` (worktree `~/Documents/atlas-goals`) is merged up to its last commit. Don't touch W2's logger files; merge their branches only when the user says.

CLI: `npx --yes neonctl@2 <cmd> --project-id mute-breeze-39649971` (the user is signed in). Make a rehearsal copy with `branches create --name <name> --parent production`, then `connection-string <name> --pooled`. Never print connection strings.

### Backups
- Saved in `~/Documents/atlas-backups/` (outside the repo, chmod 600). Never commit one.
- Make one with `/opt/homebrew/opt/libpq/bin/pg_dump --format=custom --no-owner --no-privileges` against the direct (non-pooler) URL.
- Check it with `pg_restore --list <file>`: it must list table data for `WorkoutLog`, `SetLog`, `ClientProfile` and `Exercise`.
- Production's URL is `PROD_DATABASE_URL` in `.env.prod-db.local` (chmod 600).
- Production dumps so far are listed in `HANDOFF.md`. The date-fix reversal file is `session-date-fix-20261113-115227.json` in the same folder.
- Prisma CLI reads `.env`, so run it with `DOTENV_CONFIG_PATH=.env.local` (or export `DATABASE_URL`). Run `migrate status` before `migrate deploy`.

### Undoing an exercise-cleanup batch
```
# Whole batch, newest change first:
npx tsx scripts/exercise-cleanup/undo.ts <batch-id> --dry-run
npx tsx scripts/exercise-cleanup/undo.ts <batch-id>
# Just one exercise's changes (for example one merge):
npx tsx scripts/exercise-cleanup/undo.ts <batch-id> --only <exercise-id>
```
- Production's batch is `step4-production-2026-11-13`. Running against production needs `ALLOW_PROD=1`, and the user's OK first.
- Undo moves back exactly the rows a merge moved. Sets logged against the survivor since then stay where they are.
- Batch ids are in `ExerciseChange.batch`.

## Exercises
- A merged exercise is never deleted: it keeps `mergedIntoId` and is hidden. Use `visibleTo()` for lists and `liveExercise()` for ids (`lib/exercises/find.ts`).
- Typed or imported names go through `findExerciseByName` (exact name, alternate names, then the same name written differently via `nameKey`).
- Muscle groups for charts come from `lib/exercises/muscles.ts`. Conditioning and mobility are kept out of volume.

## Sign-in (see HANDOFF.md, "Auth")
- The email link stays as a fallback. Never rotate `AUTH_SECRET`: it would sign everyone out.
- The set-password step is switched by `STEP_DEFAULT` in `lib/auth/session-policy.ts`, and `AUTH_PASSWORD_STEP=on|off` overrides it (the kill switch).
- Rollout: rehearse, then deploy 1 with the step off, verify the user can still sign in every way, then deploy 2 to turn it on.

## Running locally
- `RESEND_API_KEY= AUTH_URL=http://localhost:3000 NEXTAUTH_URL=http://localhost:3000 AUTH_TRUST_HOST=true npx next dev`. With an empty Resend key, sign-in links print to the dev log.
- Tests: `npx vitest run`. Types: `npx tsc --noEmit -p .`. Lint: `npx next lint`.
- Push to `main` deploys to https://atlas-red-eight.vercel.app. Commit or push only when the user asks.
- Never show token values. Never `vercel env pull .env.local` (it wipes local vars). The user enters tokens into Vercel.

## Which model for which task
Use **Opus** for:
- anything that touches production data or the schema (migrations, data batches, before/after comparisons)
- the goals evaluator and chapters
- generator v2's planning logic
- MCP auth and safety
- multi-file refactors such as moving session writes into `lib/sessions/`
- reviewing a plan before it ships

Use **Sonnet** for well-specified, contained work:
- a single screen or component from an agreed design
- copy edits and styling
- adding tests to existing pure functions
- docs
- the transitions and loading-state pass
- small backlog items such as seconds by hand

Move to Opus when the work turns into a data question.
