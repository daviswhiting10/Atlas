# Local Postgres

A Postgres on this machine for fuzz runs, the Monday loop and DB tests, so they never touch Neon. Rehearsals of production changes still use a fresh Neon branch copied from production (see CLAUDE.md); this database is not a copy of anyone's data.

## What it holds
- The schema: every migration in `prisma/migrations`, applied with `prisma migrate deploy` (the same as dev-sessions).
- dev-sessions' **global** exercise library (209 exercises, 57 aliases) from `prisma/local/library.json`, so names resolve the way they do on Neon. Only rows with no workspace: no client data. Refresh it with `npx tsx scripts/local-library.ts --snapshot` (reads dev-sessions, read only).
- Sample data: the demo coach "Alex" (five clients, five months of training, a finished goal) and an empty `ws_atlas_primary` workspace. Nobody in it has a real email.

## Set up (once)
1. Install Docker Desktop, then `docker compose up -d --wait db` (Postgres 16 on `127.0.0.1:54329`; the data lives in the `atlas-local-db` volume).
2. Add to `.env.local`: `DATABASE_URL_LOCAL="postgresql://atlas:atlas@localhost:54329/atlas_local"`
3. `scripts/local-db.sh setup` (migrations, library, sample; safe to re-run).

`scripts/local-db.sh reset` wipes it and sets up again. `status` shows migrations and row counts. `down` stops the container.

## Use it
- **Monday loop:** `npx next build && scripts/local-server.sh 3950`, then `npx tsx scripts/monday-loop.ts --run --base http://localhost:3950`. The loop uses the local database whenever `DATABASE_URL_LOCAL` is set; `--db neon` runs it on dev-sessions (the server must then be started the usual way).
- **Fuzz runs:** point the fuzzer at a server started with `scripts/local-server.sh <port>`. That server reads and writes only the local database; every other setting comes from `.env.local`, and sign-in links print to its log.
- **DB tests:** `scripts/local-db.sh run env ATLAS_DB_TEST=1 npx vitest run $(git ls-files '*.db.test.ts')` (the 18 files take about 5 s here, against minutes on Neon).
- **Anything else:** `scripts/local-db.sh run <command>` runs it with `DATABASE_URL` set to the local database.

## Safety
- The scripts read only `DATABASE_URL_LOCAL` from `.env.local` and refuse it unless the host is `localhost` or `127.0.0.1`. `--db local` without it set is an error, never a quiet fall back to Neon.
- The app picks its driver by host (`lib/db/client.ts`): node-postgres for a local database, Neon's driver for everything else. Vercel never sees a local URL.
- Without Docker: any Postgres 16 on that port works (e.g. Homebrew `postgresql@16`: `initdb -D ~/.atlas-local-pg -U atlas --auth=trust`, `pg_ctl -D ~/.atlas-local-pg -o "-p 54329 -c listen_addresses=127.0.0.1" start`, `createdb -h 127.0.0.1 -p 54329 -U atlas atlas_local`). `local-db.sh` uses whatever answers there.
