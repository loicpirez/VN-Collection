#!/usr/bin/env bash
# Smoke test the running dev server. Exit code 0 = everything OK.
#
# Usage:
#   scripts/smoke.sh             # against localhost:3000
#   PORT=4000 scripts/smoke.sh   # against a custom port
#
# This is intentionally simple: hit the routes, check HTTP status,
# eyeball that a few API endpoints return non-empty JSON. The dev server
# does *not* need to be restarted between runs.

set -uo pipefail

PORT="${PORT:-3000}"
HOST="${HOST:-localhost}"
BASE="http://${HOST}:${PORT}"
PASS=0
FAIL=0

ok() { PASS=$((PASS+1)); printf '  \033[32m✓\033[0m %s\n' "$1"; }
bad() { FAIL=$((FAIL+1)); printf '  \033[31m✗\033[0m %s %s\n' "$1" "$2" >&2; }

check_route() {
  local path="$1"; local expect="${2:-200}"
  local code
  code=$(curl -s -o /dev/null -w "%{http_code}" "${BASE}${path}")
  if [ "$code" = "$expect" ]; then ok "${path} → ${code}"
  else bad "${path}" "expected ${expect}, got ${code}"
  fi
}

check_json() {
  local path="$1"; local needle="$2"
  local body
  body=$(curl -s "${BASE}${path}")
  if [[ "$body" == *"$needle"* ]]; then ok "${path} contains '${needle}'"
  else bad "${path}" "missing '${needle}' in ${body:0:120}"
  fi
}

echo "Pages:"
check_route /
check_route /search
check_route /wishlist
check_route /recommendations
check_route /upcoming
check_route /quotes
check_route /year
check_route /stats
check_route /data
check_route /labels
check_route /steam
check_route /shelf
check_route /similar 200
check_route /vn/v543 200
check_route /producer/p2851 200
check_route /tags
check_route /traits
check_route /series

echo
echo "APIs:"
check_json /api/collection                  '"items"'
check_json /api/saved-filters               '"filters"'
check_json /api/reading-queue               '"entries"'
check_json /api/reading-goal?year=2026      '"finished"'
check_json /api/maintenance/duplicates      '"groups"'
check_json /api/maintenance/stale           '"rows"'
check_json /api/search/textual?q=ab         '"hits"'
check_json /api/settings                    '"vndb_writeback"'
check_json /api/steam/sync                  '"ok"'
check_json /api/wishlist                    '"items"'

echo
echo "─── ${PASS} pass · ${FAIL} fail ───"
exit $FAIL
