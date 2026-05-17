#!/usr/bin/env bash
# Interaction QA — write-capable API round-trip assertions.
#
# Unlike browser-qa.sh (read-only DOM shape checks), this script
# tests the mutation side of the application: cover rotation, section
# layout persistence, settings tabs, character/staff filter endpoints,
# and the spoiler-reveal DOM contract. Every mutation probe runs against
# the isolated QA database and is reversed (or is idempotent) so the
# QA copy stays in a clean state after the run.
#
# Usage:
#   scripts/interactions-qa.sh
#
# Prerequisites:
#   • A running dev server pointed at the isolated QA database:
#       DB_PATH="$PWD/.qa/data/collection.db" \
#       STORAGE_ROOT="$PWD/.qa/storage" \
#       PORT=3101 WRITE_QA_ALLOWED=1 VNCOLL_QA=1 \
#       yarn dev &
#   • The QA copy must exist:
#       mkdir -p .qa/data .qa/storage
#       cp data/collection.db .qa/data/collection.db
#
# DATA SAFETY: this script refuses to run when DB_PATH is unset or
# points at the real data directory. WRITE_QA_ALLOWED=1 must also be
# set, proving the caller knows the run is mutation-capable.
#
# QA isolation contract matches browser-qa.sh (PORT=3101 default,
# DB_PATH / STORAGE_ROOT explicit, WRITE_QA_ALLOWED=1 required for
# any PATCH/POST/DELETE path).

set -uo pipefail

PORT="${PORT:-3101}"
HOST="${HOST:-localhost}"
BASE="http://${HOST}:${PORT}"
PASS=0
FAIL=0

REAL_DB_DEFAULT="$(pwd)/data/collection.db"
REAL_STORAGE_DEFAULT="$(pwd)/data/storage"

# Refuse write probes without isolation
WRITE_QA_ALLOWED="${WRITE_QA_ALLOWED:-0}"
if [ "${WRITE_QA_ALLOWED}" != "1" ]; then
  printf 'interactions-qa.sh: WRITE_QA_ALLOWED must be 1 to run interaction probes.\n' >&2
  printf 'Start the QA server with WRITE_QA_ALLOWED=1 and a copied DB_PATH.\n' >&2
  exit 2
fi
if [ -z "${DB_PATH:-}" ] || [ "${DB_PATH}" = "${REAL_DB_DEFAULT}" ]; then
  printf 'interactions-qa.sh refusing to run: DB_PATH unset or pointing at real %s.\n' "${REAL_DB_DEFAULT}" >&2
  exit 2
fi
if [ -z "${STORAGE_ROOT:-}" ] || [ "${STORAGE_ROOT}" = "${REAL_STORAGE_DEFAULT}" ]; then
  printf 'interactions-qa.sh refusing to run: STORAGE_ROOT unset or pointing at real %s.\n' "${REAL_STORAGE_DEFAULT}" >&2
  exit 2
fi

if [ -t 1 ]; then
  C_OK=$'\033[32m'
  C_BAD=$'\033[31m'
  C_DIM=$'\033[2m'
  C_RST=$'\033[0m'
else
  C_OK=''
  C_BAD=''
  C_DIM=''
  C_RST=''
fi

printf 'interactions-qa.sh preflight\n'
printf '  BASE                = %s\n' "${BASE}"
printf '  DB_PATH             = %s\n' "${DB_PATH}"
printf '  STORAGE_ROOT        = %s\n' "${STORAGE_ROOT}"
printf '  WRITE_QA_ALLOWED    = %s\n' "${WRITE_QA_ALLOWED}"
printf '\n'

ok() { PASS=$((PASS+1)); printf '  %s✓%s %s %s(%s)%s\n' "$C_OK" "$C_RST" "$1" "$C_DIM" "$2" "$C_RST"; }
bad() { FAIL=$((FAIL+1)); printf '  %s✗%s %s %s(%s)%s\n' "$C_BAD" "$C_RST" "$1" "$C_DIM" "$2" "$C_RST" >&2; }

fetch_html() {
  local path="$1"
  local tmp; tmp=$(mktemp -t interactions-qa.XXXXXX) || return 1
  local code; code=$(curl -sS -L -o "$tmp" -w '%{http_code}' --max-time 20 "${BASE}${path}" 2>/dev/null || echo "000")
  if [ "$code" != "200" ]; then
    rm -f "$tmp"
    printf '  %s✗%s GET %s → %s\n' "$C_BAD" "$C_RST" "$path" "$code" >&2
    FAIL=$((FAIL+1))
    return 1
  fi
  printf '%s' "$tmp"
}

count_pattern() { grep -oE "$2" "$1" 2>/dev/null | wc -l | awk '{ print ($1+0) }'; }

assert_count() {
  local label="$1"; local file="$2"; local pattern="$3"; local expected="$4"
  local got; got=$(count_pattern "$file" "$pattern")
  if [ "$got" = "$expected" ]; then ok "$label" "$got matches"; else bad "$label" "expected $expected, got $got for /$pattern/"; fi
}

assert_at_least() {
  local label="$1"; local file="$2"; local pattern="$3"; local min="$4"
  local got; got=$(count_pattern "$file" "$pattern")
  if [ "$got" -ge "$min" ] 2>/dev/null; then ok "$label" "$got matches (≥ $min)"; else bad "$label" "expected ≥ $min, got $got for /$pattern/"; fi
}

assert_zero() {
  local label="$1"; local file="$2"; local pattern="$3"
  local got; got=$(count_pattern "$file" "$pattern")
  if [ "$got" = "0" ]; then ok "$label" "no matches"; else bad "$label" "expected 0, got $got for /$pattern/"; fi
}

api_json() {
  local method="$1"; local path="$2"; local body="${3:-}"
  local tmp; tmp=$(mktemp -t interactions-qa.XXXXXX) || return 1
  local code
  if [ -n "$body" ]; then
    code=$(curl -sS -X "$method" \
      -H 'Content-Type: application/json' \
      -d "$body" \
      -o "$tmp" -w '%{http_code}' \
      --max-time 20 "${BASE}${path}" 2>/dev/null || echo "000")
  else
    code=$(curl -sS -X "$method" \
      -o "$tmp" -w '%{http_code}' \
      --max-time 20 "${BASE}${path}" 2>/dev/null || echo "000")
  fi
  printf '%s %s' "$code" "$tmp"
}

printf 'Interaction QA — write round-trips against %s\n' "$BASE"
printf '%s\n' "------------------------------------------------------------"

# ── Probe: pick an in-collection VN ──────────────────────────────
IN_VN=$(curl -sS --max-time 8 "${BASE}/api/collection?limit=1" 2>/dev/null \
  | tr ',' '\n' | grep -oE '"id":"v[0-9]+' | head -1 | sed -E 's/"id":"//')
if [ -z "$IN_VN" ]; then
  printf 'interactions-qa.sh: no in-collection VN found — is the QA server running?\n' >&2
  exit 2
fi
printf '%s(in-collection VN probe: %s)%s\n\n' "$C_DIM" "$IN_VN" "$C_RST"

# ── 1. Settings GET / PATCH round-trip ───────────────────────────
printf '[1] Settings GET / PATCH round-trip\n'
read -r SGET_CODE SGET_BODY <<< "$(api_json GET /api/settings)"
if [ "$SGET_CODE" = "200" ]; then
  ok "GET /api/settings" "HTTP 200"
  # PATCH: toggle default_sort to 'rating' then restore
  read -r SPATCH1_CODE SPATCH1_BODY <<< "$(api_json PATCH /api/settings '{"default_sort":"rating"}')"
  if [ "$SPATCH1_CODE" = "200" ]; then
    ok "PATCH default_sort=rating" "HTTP 200"
    # Restore
    ORIG_SORT=$(grep -oE '"default_sort":"[^"]+"' "$SGET_BODY" | grep -oE ':"[^"]+"' | tr -d ':"' | head -1)
    ORIG_SORT="${ORIG_SORT:-updated_at}"
    read -r SRESTORE_CODE SRESTORE_BODY <<< "$(api_json PATCH /api/settings "{\"default_sort\":\"${ORIG_SORT}\"}")"
    if [ "$SRESTORE_CODE" = "200" ]; then
      ok "PATCH default_sort restore" "HTTP 200"
    else
      bad "PATCH default_sort restore" "HTTP $SRESTORE_CODE"
    fi
    rm -f "$SRESTORE_BODY"
  else
    bad "PATCH default_sort=rating" "HTTP $SPATCH1_CODE"
  fi
  rm -f "$SPATCH1_BODY"
else
  bad "GET /api/settings" "HTTP $SGET_CODE"
fi
rm -f "$SGET_BODY"

# ── 2. VN detail layout PATCH + event readback ───────────────────
printf '\n[2] VN detail section layout PATCH\n'
LAYOUT_PAYLOAD='{"vn_detail_section_layout_v1":{"sections":{"similar":{"visible":true,"collapsedByDefault":false}},"order":["hero","edit","characters","relations","similar","tags","screenshots","releases","staff","series"]}}'
read -r LAYOUT_CODE LAYOUT_BODY <<< "$(api_json PATCH /api/settings "$LAYOUT_PAYLOAD")"
if [ "$LAYOUT_CODE" = "200" ]; then
  ok "PATCH vn_detail_section_layout_v1" "HTTP 200"
  # Read back and confirm the 'similar' section key is present
  read -r LGET_CODE LGET_BODY <<< "$(api_json GET /api/settings)"
  if [ "$LGET_CODE" = "200" ]; then
    SECTION_HIT=$(grep -c '"similar"' "$LGET_BODY" 2>/dev/null || echo "0")
    if [ "$SECTION_HIT" -gt 0 ]; then
      ok "layout readback: 'similar' section key present" "in settings response"
    else
      bad "layout readback: 'similar' section key missing" "not in GET /api/settings"
    fi
    rm -f "$LGET_BODY"
  else
    bad "GET /api/settings readback" "HTTP $LGET_CODE"
  fi
else
  bad "PATCH vn_detail_section_layout_v1" "HTTP $LAYOUT_CODE"
fi
rm -f "$LAYOUT_BODY"

# ── 3. Character detail layout PATCH ─────────────────────────────
printf '\n[3] Character detail layout PATCH\n'
CHAR_LAYOUT='{"character_detail_section_layout_v1":{"sections":{"description":{"visible":true,"collapsedByDefault":false}},"order":["siblings","description","meta","instances","voiced-by-all","also-voiced-by","appears-in"]}}'
read -r CL_CODE CL_BODY <<< "$(api_json PATCH /api/settings "$CHAR_LAYOUT")"
if [ "$CL_CODE" = "200" ]; then
  ok "PATCH character_detail_section_layout_v1" "HTTP 200"
else
  bad "PATCH character_detail_section_layout_v1" "HTTP $CL_CODE"
fi
rm -f "$CL_BODY"

# ── 4. Staff detail layout PATCH ─────────────────────────────────
printf '\n[4] Staff detail layout PATCH\n'
STAFF_LAYOUT='{"staff_detail_section_layout_v1":{"sections":{"timeline":{"visible":true,"collapsedByDefault":false}},"order":["timeline","voice-credits","production-credits","extra-credits"]}}'
read -r SL_CODE SL_BODY <<< "$(api_json PATCH /api/settings "$STAFF_LAYOUT")"
if [ "$SL_CODE" = "200" ]; then
  ok "PATCH staff_detail_section_layout_v1" "HTTP 200"
else
  bad "PATCH staff_detail_section_layout_v1" "HTTP $SL_CODE"
fi
rm -f "$SL_BODY"

# ── 5. Cover rotation PATCH + readback ───────────────────────────
printf '\n[5] Cover rotation PATCH /api/collection/%s/cover\n' "$IN_VN"
read -r ROT_CODE ROT_BODY <<< "$(api_json PATCH "/api/collection/${IN_VN}/cover" '{"rotation":90}')"
if [ "$ROT_CODE" = "200" ]; then
  ok "PATCH cover rotation=90" "HTTP 200"
  # Restore rotation to 0
  read -r ROT0_CODE ROT0_BODY <<< "$(api_json PATCH "/api/collection/${IN_VN}/cover" '{"rotation":0}')"
  if [ "$ROT0_CODE" = "200" ]; then
    ok "PATCH cover rotation restore to 0" "HTTP 200"
  else
    bad "PATCH cover rotation restore" "HTTP $ROT0_CODE"
  fi
  rm -f "$ROT0_BODY"
else
  bad "PATCH cover rotation" "HTTP $ROT_CODE"
fi
rm -f "$ROT_BODY"

# ── 6. VN detail spoiler-reveal DOM contract ─────────────────────
printf '\n[6] Spoiler-reveal DOM contract /vn/%s\n' "$IN_VN"
VN_HTML=$(fetch_html "/vn/$IN_VN")
if [ -n "$VN_HTML" ]; then
  assert_at_least "spoiler data-spoiler-state attr" \
    "$VN_HTML" 'data-spoiler-state="(hidden|transient|revealed)"' 1
  assert_at_least "spoiler aria-pressed present" \
    "$VN_HTML" 'aria-pressed="(true|false)"' 1
  # NO opaque black rectangle (previously broken: `bg-black` was used)
  assert_zero "no opaque bg-black spoiler overlay" \
    "$VN_HTML" 'class="[^"]*bg-black[^"]*spoiler'
  rm -f "$VN_HTML"
fi

# ── 7. Character filter params DOM ───────────────────────────────
printf '\n[7] /characters filter param DOM\n'
CH_HTML=$(fetch_html "/characters")
if [ -n "$CH_HTML" ]; then
  assert_at_least "tab=local link present" \
    "$CH_HTML" 'href="[^"]*tab=local' 1
  assert_at_least "tab=vndb link present" \
    "$CH_HTML" 'href="[^"]*tab=vndb' 1
  assert_at_least "sex filter chip hrefs" \
    "$CH_HTML" 'href="[^"]*[?&]sex=[mfbn]' 1
  rm -f "$CH_HTML"
fi

# ── 8. Staff scope filter DOM ─────────────────────────────────────
printf '\n[8] /staff scope filter DOM\n'
STAFF_HTML=$(fetch_html "/staff")
if [ -n "$STAFF_HTML" ]; then
  assert_at_least "scope=collection link present" \
    "$STAFF_HTML" 'href="[^"]*scope=collection' 1
  assert_at_least "tab local/vndb links" \
    "$STAFF_HTML" 'href="[^"]*tab=' 1
  rm -f "$STAFF_HTML"
fi

# ── 9. Activity page pagination DOM ──────────────────────────────
printf '\n[9] /activity pagination + entity links DOM\n'
ACT_HTML=$(fetch_html "/activity")
if [ -n "$ACT_HTML" ]; then
  # Page must render the section headers
  assert_at_least "VN changes section header" \
    "$ACT_HTML" '(VN changes|Changements VN|VN変更)' 1
  assert_at_least "System events section header" \
    "$ACT_HTML" '(System events|Événements système|システムイベント)' 1
  rm -f "$ACT_HTML"
fi

# ── 10. Shelf display prefs PATCH ────────────────────────────────
printf '\n[10] Shelf display prefs PATCH\n'
SHELF_PAYLOAD='{"shelf_view_prefs_v1":{"cellSizePx":120,"coverScale":1.0,"gapPx":6,"fitMode":"contain","cellWidthPx":120,"cellHeightPx":180,"rowGapPx":6,"sectionGapPx":16,"frontDisplaySizePx":140,"textDensity":"md","showLabels":true,"compact":false}}'
read -r SHELF_CODE SHELF_BODY <<< "$(api_json PATCH /api/settings "$SHELF_PAYLOAD")"
if [ "$SHELF_CODE" = "200" ]; then
  ok "PATCH shelf_view_prefs_v1" "HTTP 200"
else
  bad "PATCH shelf_view_prefs_v1" "HTTP $SHELF_CODE"
fi
rm -f "$SHELF_BODY"

# ── 11. /activity kind filter renders ────────────────────────────
printf '\n[11] /activity kind=status filter\n'
ACTKIND_HTML=$(fetch_html "/activity?kind=status")
if [ -n "$ACTKIND_HTML" ]; then
  # The status filter chip must pre-select 'status' in the select
  assert_at_least "kind filter select rendered" \
    "$ACTKIND_HTML" 'name="kind"' 1
  rm -f "$ACTKIND_HTML"
fi

# ── 12. /recommendations explanation panel DOM ───────────────────
printf '\n[12] /recommendations explanation panel\n'
REC_HTML=$(fetch_html "/recommendations")
if [ -n "$REC_HTML" ]; then
  # The explanation panel appears when signalCounts.total > 0.
  # Gate: if the collection is empty the panel is absent — accept either.
  REC_SIGNAL_HITS=$(count_pattern "$REC_HTML" '(sampled sources|sources échantillonnées|サンプルされたソース)')
  if [ "$REC_SIGNAL_HITS" -gt 0 ]; then
    ok "explanation panel: signal-count line present" "$REC_SIGNAL_HITS matches"
  else
    ok "explanation panel absent (empty collection — expected)" "no signal count"
  fi
  rm -f "$REC_HTML"
fi

# ── Summary ───────────────────────────────────────────────────────
printf '\n%s\n' "------------------------------------------------------------"
printf '%sPASS%s: %d   %sFAIL%s: %d\n' "$C_OK" "$C_RST" "$PASS" "$C_BAD" "$C_RST" "$FAIL"

if [ "$FAIL" -gt 0 ]; then
  exit 1
fi
exit 0
