#!/bin/bash
# Production health after a deploy: the public pages answer, signed-out app pages go to sign-in, protected APIs refuse.
#   scripts/release/health.sh [base URL]   (default https://atlas-red-eight.vercel.app)
# Expected: / 200, /login 200, /today /clients /log 307 -> /login, erase GET 401, invite POST 401.
B="${1:-${ATLAS_BASE_URL:-https://atlas-red-eight.vercel.app}}"
for p in / /login; do echo "$p $(curl -s -o /dev/null -w '%{http_code}' "$B$p")"; done
for p in /today /clients /log; do echo "$p $(curl -s -o /dev/null -w '%{http_code} -> %{redirect_url}' "$B$p")"; done
echo "erase GET $(curl -s -o /dev/null -w '%{http_code}' "$B/api/clients/x/erase")"
echo "invite POST $(curl -s -o /dev/null -w '%{http_code}' -X POST "$B/api/clients/x/invite")"
