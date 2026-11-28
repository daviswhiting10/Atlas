#!/bin/bash
# The Monday loop alone, on the staging worktree's current build, on :3950 (never :3900). For a flaky step after a
# release stopped at "monday loop": rerun it here before deciding it's real. Needs a finished `next build` in staging.
#   scripts/release/loop-rerun.sh
set -uo pipefail
main() {
  local W="${ATLAS_STAGING:-$HOME/Documents/atlas-wave2}"
  local L="${ATLAS_RELEASE_LOGS:-$HOME/Documents/atlas-release-logs}"
  mkdir -p "$L"; chmod 700 "$L"
  cd "$W"
  local p; p=$(lsof -nP -tiTCP:3950 -sTCP:LISTEN || true); [ -n "$p" ] && { echo "STOP: 3950 busy"; exit 1; }
  RESEND_API_KEY= AUTH_URL=http://localhost:3950 NEXTAUTH_URL=http://localhost:3950 AUTH_TRUST_HOST=true npx next start -p 3950 > "$L/server3950-rerun.log" 2>&1 &
  local SRV=$!
  for _ in $(seq 1 40); do curl -s -o /dev/null -w "%{http_code}" http://localhost:3950/login | grep -q 200 && break; sleep 1; done
  npx tsx scripts/monday-loop.ts --run --base http://localhost:3950 > "$L/loop-rerun.log" 2>&1
  kill $SRV 2>/dev/null; p=$(lsof -nP -tiTCP:3950 -sTCP:LISTEN || true); [ -n "$p" ] && kill "$p"
  grep -E "^(FAIL|ALL|[0-9]+ FAILED)" "$L/loop-rerun.log"
}
main "$@"
exit
