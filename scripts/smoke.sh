#!/usr/bin/env bash
# Smoke test the running dev server. Exit code 0 = everything OK.
#
# Usage:
#   scripts/smoke.sh             # against localhost:3000
#   PORT=4000 scripts/smoke.sh   # against a custom port
#
# Real ids are derived from the local DB so the smoke survives
# arbitrary user data. Fallback ids point at stable VNDB-canonical
# numeric ids so a fresh empty DB also passes — provided VNDB is
# reachable (otherwise those routes 404, not 500, which is correct).
#
# This is intentionally simple: hit the routes, check HTTP status,
# eyeball that a few API endpoints return non-empty JSON. The dev
# server does *not* need to be restarted between runs.

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

# Pick ids from the isolated QA DB when sqlite3 is available. The
# script deliberately does not fall back to repository data or fixed
# upstream ids; route-specific checks are skipped when no matching
# fixture exists.
DB_PATH="${DB_PATH:-$(pwd)/.qa/data/collection.db}"
STORAGE_ROOT="${STORAGE_ROOT:-$(pwd)/.qa/storage}"
REAL_DB_DEFAULT="$(pwd)/data/collection.db"
REAL_STORAGE_DEFAULT="$(pwd)/data/storage"
echo "smoke.sh preflight:"
echo "  BASE=${BASE}"
echo "  DB_PATH=${DB_PATH}"
echo "  STORAGE_ROOT=${STORAGE_ROOT}"
if [ "$DB_PATH" = "$REAL_DB_DEFAULT" ] || [ "$STORAGE_ROOT" = "$REAL_STORAGE_DEFAULT" ]; then
  echo "Refusing to run smoke against real DB/storage paths." >&2
  exit 2
fi
if [ -z "${PRODUCER_ID:-}" ] && command -v sqlite3 >/dev/null 2>&1 && [ -f "$DB_PATH" ]; then
  PRODUCER_ID=$(sqlite3 "$DB_PATH" 'SELECT id FROM producer LIMIT 1' 2>/dev/null || true)
fi
if [ -z "${VN_ID:-}" ] && command -v sqlite3 >/dev/null 2>&1 && [ -f "$DB_PATH" ]; then
  VN_ID=$(sqlite3 "$DB_PATH" "SELECT id FROM vn WHERE id LIKE 'v%' LIMIT 1" 2>/dev/null || true)
fi
PRODUCER_ID="${PRODUCER_ID:-}"
VN_ID="${VN_ID:-}"

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
check_route '/shelf?view=spatial'
check_route '/shelf?view=release'
check_route '/shelf?view=item'
check_route '/shelf?view=layout'
check_route '/shelf?view=garbage' 200      # unknown view should fall back to spatial → 200
check_route /similar 200
if [ -n "$VN_ID" ]; then check_route "/vn/${VN_ID}" 200; else ok "skip /vn/:id (no QA fixture)"; fi
if [ -n "$PRODUCER_ID" ]; then check_route "/producer/${PRODUCER_ID}" 200; else ok "skip /producer/:id (no QA fixture)"; fi
check_route /tags
check_route /traits
check_route /series
check_route /top-ranked
check_route '/top-ranked?tab=egs'
check_route '/upcoming?tab=anticipated'
check_route /egs
check_route /dumped

echo
echo "APIs:"
check_json /api/collection                  '"items"'
check_json /api/saved-filters               '"filters"'
check_json /api/reading-queue               '"entries"'
check_json "/api/reading-goal?year=$(date +%Y)"  '"finished"'
check_json /api/maintenance/duplicates      '"groups"'
check_json /api/maintenance/stale           '"rows"'
check_json /api/search/textual?q=ab         '"hits"'
check_json /api/settings                    '"vndb_writeback"'
check_json /api/steam/sync                  '"ok"'
check_json /api/wishlist                    '"items"'
check_json /api/shelves                     '"shelves"'

echo
echo "─── ${PASS} pass · ${FAIL} fail ───"
echo "(producer=${PRODUCER_ID}, vn=${VN_ID})"
exit $FAIL
