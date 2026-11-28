#!/bin/bash
# PDF import on a Vercel preview: sign the preview's test athlete in (the link comes from the preview's logs and is
# never printed), upload the repo's PDF fixture, print the status, the workouts found and any PDF error in the logs.
#   scripts/release/preview-pdf-test.sh <deployment host> [pdf]
# Needs the Vercel CLI signed in (npx vercel@50). Preview only: the email is the preview's own test address.
set -uo pipefail
main() {
  local D="$1" HERE; HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  local REPO; REPO="$(cd "$HERE/../.." && pwd)"
  local PDF="${2:-$REPO/lib/programs/fixtures/strength-base-4wk.pdf}"
  local L="${ATLAS_RELEASE_LOGS:-$HOME/Documents/atlas-release-logs}"; mkdir -p "$L"; chmod 700 "$L"
  local J="$L/preview-jar.txt"; rm -f "$J"; touch "$J"; chmod 600 "$J"
  cd "$REPO"
  vc() { npx --yes vercel@50 curl "$1" --deployment "$D" -- "${@:2}" 2>/dev/null | tail -1; }
  local CSRF; CSRF=$(vc /api/auth/csrf -s -c "$J" -b "$J" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{console.log(JSON.parse(s).csrfToken)}catch{}})')
  [ -n "$CSRF" ] || { echo "no csrf"; exit 1; }
  vc /api/auth/signin/email -s -c "$J" -b "$J" -o /dev/null -X POST -H "Content-Type: application/x-www-form-urlencoded" \
    --data-urlencode "email=athlete@preview.test" --data-urlencode "csrfToken=$CSRF" --data-urlencode "callbackUrl=https://$D/today" --data-urlencode "json=true" >/dev/null
  local LOGS="$L/preview-logs.txt" LINK="$L/plink.txt"
  for _ in 1 2 3 4 5 6 7 8 9; do
    sleep 10; npx --yes vercel@50 logs --deployment "$D" --no-follow --since 3m --expand --limit 30 > "$LOGS" 2>&1
    grep -q "callback/email" "$LOGS" && break
  done
  grep -oE "https://[^ ]*callback/email[^ ]*" "$LOGS" | tail -1 > "$LINK"; chmod 600 "$LINK"; rm -f "$LOGS"
  local P; P=$(sed "s#https://$D##" "$LINK"); rm -f "$LINK"; [ -n "$P" ] || { echo "no link"; exit 1; }
  vc "$P" -s -c "$J" -b "$J" -o /dev/null >/dev/null
  local ROLE; ROLE=$(vc /api/auth/session -s -b "$J" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{console.log(JSON.parse(s)?.user?.role??"none")}catch{console.log("none")}})')
  echo "signed in as: $ROLE"
  local R="$L/pdf-result.txt"
  npx --yes vercel@50 curl /api/athlete/plan-import --deployment "$D" -- -s -b "$J" -X POST -F "file0=@$PDF;type=application/pdf" -w "\nHTTP %{http_code} in %{time_total}s\n" 2>/dev/null > "$R"
  tail -1 "$R"
  node -e '(()=>{const s=require("fs").readFileSync(process.argv[1],"utf8");const body=s.slice(0,s.lastIndexOf("\nHTTP"));let j;try{j=JSON.parse(body)}catch{console.log("not json:",body.slice(0,200));return}if(j.error){console.log("error:",j.error);return}console.log("found:",JSON.stringify(j.found?.workouts),"| uncertain:",(j.found?.uncertain||[]).length,"| readAs:",j.readAs,"| warnings:",JSON.stringify(j.warnings))})()' "$R"
  rm -f "$J"
  sleep 12
  npx --yes vercel@50 logs --deployment "$D" --no-follow --since 3m --limit 20 --json 2>/dev/null | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{for(const l of s.split("\n")){let j;try{j=JSON.parse(l)}catch{continue}if(j.requestPath==="/api/athlete/plan-import")for(const x of [{message:j.message},...(j.logs||[])])if(/pdf|canvas|worker|DOMMatrix|Cannot/i.test(x.message||""))console.log("log:",(x.message||"").split("\n")[0].slice(0,250))}})' | sort -u | head -5
}
[ $# -ge 1 ] || { echo "usage: $0 <deployment host> [pdf]"; exit 2; }
main "$@"
exit
