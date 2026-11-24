#!/bin/bash
# The local Postgres (docs/local-postgres.md). Every command runs against DATABASE_URL_LOCAL only, and refuses
# anything that isn't on this machine.
#   scripts/local-db.sh up       start the Docker container
#   scripts/local-db.sh setup    up + migrations + dev-sessions' exercise library + sample data (safe to re-run)
#   scripts/local-db.sh reset    wipe the local database, then setup
#   scripts/local-db.sh status   migrate status and row counts
#   scripts/local-db.sh down     stop the container (data is kept in its volume)
#   scripts/local-db.sh run <cmd...>   run a command with DATABASE_URL set to the local database
set -euo pipefail
cd "$(dirname "$0")/.."
# Only DATABASE_URL_LOCAL is read from .env.local: its other values (seed ids, the real trainer's email) belong to Neon.
[ -z "${DATABASE_URL_LOCAL:-}" ] && [ -f .env.local ] && DATABASE_URL_LOCAL=$(sed -n 's/^DATABASE_URL_LOCAL=//p' .env.local | tr -d '"' | tail -1)
: "${DATABASE_URL_LOCAL:=postgresql://atlas:atlas@localhost:54329/atlas_local}"
case "$DATABASE_URL_LOCAL" in
  postgresql://*@localhost:*|postgresql://*@127.0.0.1:*|postgres://*@localhost:*|postgres://*@127.0.0.1:*) ;;
  *) echo "DATABASE_URL_LOCAL must point at localhost; refusing." >&2; exit 1 ;;
esac
export DATABASE_URL="$DATABASE_URL_LOCAL"

up() {
  if command -v docker >/dev/null 2>&1; then
    docker compose up -d --wait db
  elif pg_isready -d "$DATABASE_URL" >/dev/null 2>&1 || /opt/homebrew/opt/postgresql@16/bin/pg_isready -d "$DATABASE_URL" >/dev/null 2>&1; then
    echo "No Docker; a Postgres already answers at DATABASE_URL_LOCAL, using it."
  else
    echo "Docker is not installed and nothing answers at DATABASE_URL_LOCAL. Install Docker Desktop (or see 'Without Docker' in docs/local-postgres.md)." >&2
    exit 1
  fi
}
migrate() { npx prisma migrate deploy; }
# dev-sessions' global exercise library (prisma/local/library.json; refresh it with `npx tsx scripts/local-library.ts
# --snapshot`), then the sample coach and clients. prisma/seed.ts isn't used: its library predates the exercise cleanup.
seed() {
  npx tsx scripts/local-library.ts
  npx tsx scripts/local-sample.ts
}
counts() {
  npx tsx -e '
    import("./lib/db/client").then(async (m) => {
      const prisma = (m.prisma ?? m.default.prisma);
      const t = ["workspace","user","clientProfile","exercise","programAssignment","assignedWorkout","workoutLog","setLog","sessionNote","measurement"];
      for (const m of t) console.log(m.padEnd(20), await (prisma as any)[m].count());
      process.exit(0);
    });'
}

case "${1:-}" in
  up) up ;;
  setup) up; migrate; seed; counts ;;
  reset)
    up
    echo "DROP SCHEMA public CASCADE; CREATE SCHEMA public;" | npx prisma db execute --stdin
    migrate; seed; counts ;;
  status) npx prisma migrate status || true; counts ;;
  down) docker compose stop db ;;
  run) shift; exec "$@" ;;
  *) sed -n 2,10p "$0"; exit 1 ;;
esac
