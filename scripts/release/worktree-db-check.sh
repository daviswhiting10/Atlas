#!/bin/bash
# After rotating the dev-sessions password: for each worktree given, a read-only query with its .env.local DATABASE_URL.
# Prints "<worktree>: on <session count>" when it connects; the error (URL masked) when it doesn't.
#   scripts/release/worktree-db-check.sh ~/Documents/atlas-*
PSQL="${PSQL:-/opt/homebrew/opt/libpq/bin/psql}"
for d in "$@"; do
  [ -f "$d/.env.local" ] || continue
  U=$(grep -E '^DATABASE_URL=' "$d/.env.local" | tail -1 | cut -d= -f2- | sed -E 's/^"//; s/"$//')
  r=$("$PSQL" "$U" -X -q -t -A -c 'BEGIN READ ONLY; SELECT current_setting($$transaction_read_only$$)||$$ $$||(SELECT count(*) FROM "WorkoutLog"); COMMIT;' 2>&1 | head -1 | sed -E 's#postgres(ql)?://[^ ]*#<url>#g')
  echo "$(basename "$d"): $r"
done
