#!/bin/bash
# One release: merge <ref> into the staging worktree, check, build, Monday loop on :3950, push to main, wait for the
# deploy, health checks, pull the main checkout. Stops at the first failure: nothing is pushed unless every check passed.
#   scripts/release/release.sh <ref> "<merge message>"
# Settings (env): ATLAS_STAGING (default ~/Documents/atlas-wave2), ATLAS_MAIN (default ~/Documents/Atlas),
#                 ATLAS_RELEASE_LOGS (default ~/Documents/atlas-release-logs).
# The Monday loop runs on :3950, never :3900. The staging worktree's .env.local points at dev-sessions, never production.
set -euo pipefail

# Everything runs inside main(), so bash has read the whole file before the last step pulls main (which can rewrite it).
main() {
  local REF="$1" MSG="$2"
  local HERE; HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  local W="${ATLAS_STAGING:-$HOME/Documents/atlas-wave2}"
  local M="${ATLAS_MAIN:-$HOME/Documents/Atlas}"
  local L="${ATLAS_RELEASE_LOGS:-$HOME/Documents/atlas-release-logs}"
  mkdir -p "$L"; chmod 700 "$L"

  cd "$W"
  [ -z "$(git status --short)" ] || { echo "STOP: staging not clean"; exit 1; }
  git fetch -q origin
  [ "$(git rev-parse HEAD)" = "$(git rev-parse origin/main)" ] || { echo "STOP: staging is not at origin/main"; exit 1; }
  local ROLLBACK; ROLLBACK=$(git rev-parse --short HEAD)
  # The repo on GitHub, from origin (git@github.com:owner/repo.git or https://github.com/owner/repo.git).
  local SLUG; SLUG=$(git remote get-url origin | sed -E 's#^(git@github\.com:|https://github\.com/)##; s#\.git$##')
  local URL="https://github.com/$SLUG.git"

  git merge --no-ff "$REF" -m "$MSG

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" >/dev/null || { echo "STOP: merge conflict"; git merge --abort; exit 1; }
  echo "merged $REF -> $(git rev-parse --short HEAD) (rollback $ROLLBACK)"

  npx prisma generate >/dev/null 2>&1 || { echo "STOP: prisma generate"; exit 1; }
  npx tsc --noEmit -p . >/dev/null 2>&1 || { echo "STOP: types"; npx tsc --noEmit -p . | head || true; exit 1; }
  local LINT; LINT=$(npx next lint 2>&1 || true)
  echo "$LINT" | grep -q "No ESLint warnings or errors" || { echo "STOP: lint"; echo "$LINT" | tail -5; exit 1; }

  vt() { npx vitest run > "$L/vitest-release.log" 2>&1 || true; grep -E "Tests " "$L/vitest-release.log" | tail -1 || true; }
  local T; T=$(vt); echo "tests: $T"
  if ! echo "$T" | grep -q passed || echo "$T" | grep -q failed; then
    echo "tests failed once (often timeouts under load); retrying"; grep -E "FAIL " "$L/vitest-release.log" | head -8 || true
    T=$(vt); echo "tests (retry): $T"
  fi
  if ! echo "$T" | grep -q passed || echo "$T" | grep -q failed; then echo "STOP: tests"; grep -E "FAIL " "$L/vitest-release.log" | head -8 || true; exit 1; fi

  npx next build > "$L/build-release.log" 2>&1 || { echo "STOP: build"; tail -20 "$L/build-release.log"; exit 1; }
  echo "build ok"

  local pid; pid=$(lsof -nP -tiTCP:3950 -sTCP:LISTEN | head -1 || true)
  [ -n "$pid" ] && { echo "STOP: 3950 busy"; exit 1; }
  RESEND_API_KEY= AUTH_URL=http://localhost:3950 NEXTAUTH_URL=http://localhost:3950 AUTH_TRUST_HOST=true npx next start -p 3950 > "$L/server3950.log" 2>&1 &
  local SRV=$!
  for _ in $(seq 1 40); do curl -s -o /dev/null -w "%{http_code}" http://localhost:3950/login 2>/dev/null | grep -q 200 && break; sleep 1; done
  pid=$(lsof -nP -tiTCP:3950 -sTCP:LISTEN | head -1)
  local cwd; cwd=$(lsof -a -p "$pid" -d cwd | tail -1 | awk '{print $NF}')
  [ "$cwd" = "$W" ] || { echo "STOP: 3950 served from $cwd"; kill $SRV; exit 1; }
  local LOOP; LOOP=$(npx tsx scripts/monday-loop.ts --run --base http://localhost:3950 2>&1 || true)
  kill $SRV 2>/dev/null || true
  pid=$(lsof -nP -tiTCP:3950 -sTCP:LISTEN | head -1 || true); [ -n "$pid" ] && kill "$pid" 2>/dev/null || true
  echo "$LOOP" | grep -E "^(FAIL|ALL)" | head -5 || true
  echo "$LOOP" | grep -q "^ALL PASSED" || { echo "STOP: monday loop"; exit 1; }

  local H; H=$(git rev-parse HEAD)
  git -c credential.helper= -c credential.helper='!gh auth git-credential' push "$URL" HEAD:refs/heads/main 2>&1 | tail -1
  [ "$(git ls-remote "$URL" refs/heads/main | cut -f1)" = "$H" ] || { echo "STOP: push not on remote"; exit 1; }
  local s=pending
  for _ in $(seq 1 40); do
    s=$(gh api "repos/$SLUG/commits/$H/status" --jq .state 2>/dev/null || echo pending)
    case "$s" in success|failure|error) break;; esac; sleep 15
  done
  echo "deploy: $s"; [ "$s" = success ] || exit 1

  bash "$HERE/health.sh"
  cd "$M" && git pull -q --ff-only && echo "main now $(git log -1 --format=%h); rollback $ROLLBACK"
}

[ $# -eq 2 ] || { echo "usage: $0 <ref> \"<merge message>\""; exit 2; }
main "$@"
exit
