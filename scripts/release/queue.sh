#!/bin/bash
# Ship several releases in order, each through the full release (release.sh). Stops at the first that fails; the ones
# after it don't ship. Each release resets the staging worktree to origin/main first.
#   scripts/release/queue.sh <name> <ref> "<merge message>" [<name> <ref> "<merge message>" ...]
# Writes <logs>/queue-<stamp>.log (one summary line block per release) and <logs>/rel-<name>.log (the full release).
set -uo pipefail

main() {
  local HERE; HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  local W="${ATLAS_STAGING:-$HOME/Documents/atlas-wave2}"
  local L="${ATLAS_RELEASE_LOGS:-$HOME/Documents/atlas-release-logs}"
  mkdir -p "$L"; chmod 700 "$L"
  local Q="$L/queue-$(date +%Y%m%d-%H%M%S).log"
  echo "queue log: $Q"
  while [ $# -ge 3 ]; do
    local name="$1" ref="$2" msg="$3"; shift 3
    (cd "$W" && git fetch -q origin && git reset -q --hard origin/main && rm -rf .next)
    bash "$HERE/release.sh" "$ref" "$msg" > "$L/rel-$name.log" 2>&1; local rc=$?
    { echo "=== $name: exit $rc"; grep -E "^(STOP|FAIL|tests|deploy:|main now)" "$L/rel-$name.log" | head -6; } >> "$Q"
    [ $rc -eq 0 ] || { echo "QUEUE STOPPED at $name" >> "$Q"; cat "$Q"; exit 1; }
  done
  [ $# -eq 0 ] || { echo "QUEUE: leftover arguments (expected <name> <ref> <message> triples): $*" >> "$Q"; cat "$Q"; exit 2; }
  echo "QUEUE DONE" >> "$Q"; cat "$Q"
}

main "$@"
exit
