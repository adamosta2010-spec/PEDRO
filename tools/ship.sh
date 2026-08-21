#!/usr/bin/env bash
#
#   bash tools/ship.sh <commit-sha> <build-stamp>
#   e.g. bash tools/ship.sh $(git rev-parse HEAD) 2026-08-21.65
#
# There is no gh CLI on this machine. The token comes out of the Windows
# credential manager via git credential fill, and the rest is the GitHub REST
# API. It ends by opening the .ipa and checking the BUILD stamp inside matches
# what was asked for - the build that shipped the previous app is why.
#
# Wait for the iOS build of a commit, fetch the .ipa, and prove it is the app
# that was actually edited. The token comes from the credential manager and is
# never printed.
set -uo pipefail
cd "$(dirname "$0")/.."
SHA="$1"
STAMP="$2"
REPO="adamosta2010-spec/PEDRO"

TOKEN=$(printf "protocol=https\nhost=github.com\n\n" | git credential fill 2>/dev/null \
        | sed -n 's/^password=//p')
[ -z "$TOKEN" ] && { echo "no token"; exit 1; }
api(){ curl -sS -H "Authorization: Bearer $TOKEN" -H "Accept: application/vnd.github+json" "$@"; }

echo "waiting for the build of ${SHA:0:7}"
RUNID=""
for i in $(seq 1 90); do
  RUNID=$(api "https://api.github.com/repos/$REPO/actions/runs?head_sha=$SHA&per_page=1" \
          | sed -n 's/^      "id": \([0-9]*\),/\1/p' | head -1)
  [ -n "$RUNID" ] && break
  sleep 10
done
[ -z "$RUNID" ] && { echo "no run appeared"; exit 1; }
echo "run $RUNID"

CONC=""
for i in $(seq 1 120); do
  J=$(api "https://api.github.com/repos/$REPO/actions/runs/$RUNID")
  STATUS=$(printf '%s' "$J" | sed -n 's/^  "status": "\(.*\)",/\1/p' | head -1)
  CONC=$(printf '%s' "$J" | sed -n 's/^  "conclusion": "\(.*\)",/\1/p' | head -1)
  echo "  $STATUS ${CONC:-}"
  [ "$STATUS" = "completed" ] && break
  sleep 15
done
[ "$CONC" != "success" ] && { echo "build did not succeed: ${CONC:-unknown}"; exit 1; }

URL=$(api "https://api.github.com/repos/$REPO/actions/runs/$RUNID/artifacts" \
      | sed -n 's/^      "archive_download_url": "\(.*\)",/\1/p' | head -1)
[ -z "$URL" ] && { echo "no artifact"; exit 1; }
mkdir -p builds
curl -sSL -H "Authorization: Bearer $TOKEN" "$URL" -o builds/_a.zip || exit 1
unzip -o -q builds/_a.zip -d builds/_x || exit 1
IPA=$(find builds/_x -name "*.ipa" | head -1)
[ -z "$IPA" ] && { echo "no ipa inside"; exit 1; }
mv "$IPA" "builds/Pedro-$STAMP.ipa"
rm -rf builds/_a.zip builds/_x

# A zip entry carries the clock of the machine that made it, and the runner is
# on UTC - so on a machine that is not, every fresh build looks hours old and
# you cannot tell a new one from a stale one at a glance. Stamp it with now.
touch "builds/Pedro-$STAMP.ipa"

# the check that was missing: is this actually the app that was edited?
GOT=$(unzip -p "builds/Pedro-$STAMP.ipa" "Payload/App.app/public/index.html" \
      | grep -o 'var BUILD = "[^"]*"' | head -1 | sed 's/.*"\(.*\)"/\1/')
echo "the app inside is $GOT, expected $STAMP"
if [ "$GOT" != "$STAMP" ]; then echo "WRONG BUILD INSIDE"; exit 1; fi
FEATURES=$(unzip -p "builds/Pedro-$STAMP.ipa" "Payload/App.app/public/index.html" \
           | grep -c "function wbSolve\|BUILD_MODE_RE\|function hfDraftStart\|function carryOn")
echo "new code present in $FEATURES places"
ls -la "builds/Pedro-$STAMP.ipa"
echo "built just now - $(date '+%H:%M %Z')"
echo "READY builds/Pedro-$STAMP.ipa"
