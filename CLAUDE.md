# Atlas: working notes

Start with `HANDOFF.md` (where things stand, decisions, build order). Design docs for what's next are in `docs/`.

## Databases
- Production is the Neon branch `production` (endpoint `ep-nameless-field…`). Local development points at a Neon branch (`dev-sessions`), never production.
- Never run migrations, tests, seeds or data scripts against production while developing. Rehearse on a fresh branch copy of production first.
- Changing production data: take a full backup (`pg_dump`, saved outside the repo, checked with `pg_restore --list`), rehearse on a branch, compare before/after counts, then apply. Stop if any count differs.
- `prisma/seed.ts` refuses to run against production (`lib/db/production.ts`): it rewrites the exercise library and deletes exercises missing from its list.
- Scripts in `scripts/exercise-cleanup/` refuse production unless `ALLOW_PROD=1`. Every change they make is logged in `ExerciseChange` and can be reversed with `undo.ts`.

### Branches (Neon project "Atlas", `mute-breeze-39649971`)
| Branch | What it is | Keep until |
|---|---|---|
| `production` | Live data | Always |
| `dev-sessions` | Local dev and tests (`.env.local` `DATABASE_URL`). Holds a copy of real clients plus QA data, so don't expose it. | Ongoing |
| `rehearsal-step4` | Production copy where the step 4 exercise cleanup was rehearsed | Until the user says |
| `dev-prod-copy` | Production as it was before the sessions migrations (rollback reference) | 2026-11-20 |

CLI: `npx --yes neonctl@2 <cmd> --project-id mute-breeze-39649971` (the user is signed in). Make a rehearsal copy with `branches create --name <name> --parent production`, then `connection-string <name> --pooled`. Never print connection strings.

### Backups
- Saved in `~/Documents/atlas-backups/` (outside the repo, chmod 600). Never commit one.
- Make one with `/opt/homebrew/opt/libpq/bin/pg_dump --format=custom --no-owner --no-privileges` against the direct (non-pooler) URL.
- Check it with `pg_restore --list <file>`: it must list table data for `WorkoutLog`, `SetLog`, `ClientProfile` and `Exercise`.
- Production's URL is `PROD_DATABASE_URL` in `.env.prod-db.local` (chmod 600).
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
