#!/bin/bash
# A production build served on the local Postgres (docs/local-postgres.md), for fuzz runs and the Monday loop.
#   scripts/local-server.sh [port]        (default 3950; build first with `npx next build`)
# Every other setting comes from .env.local as usual; only the database is swapped, and sign-in links print to the log.
set -euo pipefail
cd "$(dirname "$0")/.."
PORT="${1:-3950}"
[ -z "${DATABASE_URL_LOCAL:-}" ] && [ -f .env.local ] && DATABASE_URL_LOCAL=$(sed -n 's/^DATABASE_URL_LOCAL=//p' .env.local | tr -d '"' | tail -1)
: "${DATABASE_URL_LOCAL:=postgresql://atlas:atlas@localhost:54329/atlas_local}"
case "$DATABASE_URL_LOCAL" in
  postgresql://*@localhost:*|postgresql://*@127.0.0.1:*|postgres://*@localhost:*|postgres://*@127.0.0.1:*) ;;
  *) echo "DATABASE_URL_LOCAL must point at localhost; refusing." >&2; exit 1 ;;
esac
export DATABASE_URL="$DATABASE_URL_LOCAL" DATABASE_URL_LOCAL
exec env RESEND_API_KEY= AUTH_URL="http://localhost:$PORT" NEXTAUTH_URL="http://localhost:$PORT" AUTH_TRUST_HOST=true npx next start -p "$PORT"
