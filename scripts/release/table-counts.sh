#!/bin/bash
# Every public table's exact row count, sorted, in a read-only transaction: the before/after comparison of the
# production routine (backup, rehearse on a fresh branch copy, compare counts, apply). Never prints the URL.
#   scripts/release/table-counts.sh <database url> > before.txt
#   ... apply on the rehearsal branch / production ...
#   scripts/release/table-counts.sh <database url> > after.txt; diff before.txt after.txt
# An additive migration should differ only in _prisma_migrations (+1). Stop if anything else differs.
U="${1:?usage: table-counts.sh <database url>}"
PSQL="${PSQL:-/opt/homebrew/opt/libpq/bin/psql}"
"$PSQL" "$U" -X -q -t -A -v ON_ERROR_STOP=1 2>&1 <<'SQL' | sed -E 's#postgres(ql)?://[^ ]*#<url>#g'
BEGIN READ ONLY;
SELECT 'SELECT t||'' ''||n FROM (' || string_agg(format('SELECT %L AS t, count(*) AS n FROM %I', table_name, table_name), ' UNION ALL ') || ') x ORDER BY t'
FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE' \gexec
COMMIT;
SQL
