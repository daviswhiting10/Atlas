# Atlas: working notes

## Databases
- Production is the Neon branch `production` (endpoint `ep-nameless-field…`). Local development points at a Neon branch (`dev-sessions`), never production.
- Never run migrations, tests, seeds or data scripts against production while developing. Rehearse on a fresh branch copy of production first.
- Changing production data: take a full backup (`pg_dump`, saved outside the repo, checked with `pg_restore --list`), rehearse on a branch, compare before/after counts, then apply. Stop if any count differs.
- `prisma/seed.ts` refuses to run against production (`lib/db/production.ts`): it rewrites the exercise library and deletes exercises missing from its list.
- Scripts in `scripts/exercise-cleanup/` refuse production unless `ALLOW_PROD=1`. Every change they make is logged in `ExerciseChange` and can be reversed with `undo.ts`.

## Exercises
- A merged exercise is never deleted: it keeps `mergedIntoId` and is hidden. Use `visibleTo()` for lists and `liveExercise()` for ids (`lib/exercises/find.ts`).
- Typed or imported names go through `findExerciseByName` (exact name, alternate names, then the same name written differently via `nameKey`).
