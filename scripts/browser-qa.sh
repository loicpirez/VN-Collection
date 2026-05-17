#!/usr/bin/env bash
# Browser QA — DOM-shape assertions, not just word grep.
#
# This script is the upgrade from the previous curl + word-grep
# "passes" that turned out to be far too weak: any page that
# coincidentally rendered the right English word counted as a pass,
# even when the actual feature was completely broken under the hood.
#
# The new contract is structural: each assertion looks for a specific
# DOM pattern (attribute combinations, href shapes, class contracts)
# in the rendered HTML so the check actually pins behaviour. The
# script exits non-zero if any assertion fails so the gate can be
# wired into a `yarn qa` step or a manual pre-merge check.
#
# Usage:
#   scripts/browser-qa.sh             # against localhost:3000
#   PORT=4000 scripts/browser-qa.sh   # against a custom port
#   HOST=192.168.0.10 scripts/browser-qa.sh
#
# Requires a running dev server (`yarn dev`). The script does NOT
# spawn one itself: bringing the server up is a separate concern
# (warm caches, DB shape, etc.) and conflating the two has caused
# false negatives in the past.

set -uo pipefail

PORT="${PORT:-3000}"
HOST="${HOST:-localhost}"
BASE="http://${HOST}:${PORT}"
PASS=0
FAIL=0

# Colours, but only when stdout is a TTY so log scrapers stay clean.
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

ok() {
  PASS=$((PASS+1))
  printf '  %s✓%s %s %s(%s)%s\n' "$C_OK" "$C_RST" "$1" "$C_DIM" "$2" "$C_RST"
}

bad() {
  FAIL=$((FAIL+1))
  printf '  %s✗%s %s %s(%s)%s\n' "$C_BAD" "$C_RST" "$1" "$C_DIM" "$2" "$C_RST" >&2
}

# Fetch a route into a temp file and echo the path. On HTTP failure
# returns an empty path so callers can short-circuit cleanly without
# every assertion having to re-implement the same guard.
fetch_html() {
  local path="$1"
  local tmp
  tmp=$(mktemp -t browser-qa.XXXXXX) || return 1
  local code
  code=$(curl -sS -L -o "$tmp" -w '%{http_code}' --max-time 20 "${BASE}${path}" 2>/dev/null || echo "000")
  if [ "$code" != "200" ]; then
    rm -f "$tmp"
    printf '  %s✗%s GET %s → %s\n' "$C_BAD" "$C_RST" "$path" "$code" >&2
    FAIL=$((FAIL+1))
    return 1
  fi
  printf '%s' "$tmp"
}

# count_pattern <file> <ERE-pattern>
# Echoes the number of matches; never errors.
count_pattern() {
  grep -E -c -o "$2" "$1" 2>/dev/null | awk '{ s += $1 } END { print (s+0) }'
}

# assert_count <label> <file> <pattern> <expected>
# Pass-when-equal helper for "exactly N occurrences" contracts.
assert_count() {
  local label="$1"; local file="$2"; local pattern="$3"; local expected="$4"
  local got
  got=$(count_pattern "$file" "$pattern")
  if [ "$got" = "$expected" ]; then
    ok "$label" "$got matches"
  else
    bad "$label" "expected $expected, got $got for /$pattern/"
  fi
}

# assert_at_least <label> <file> <pattern> <min>
assert_at_least() {
  local label="$1"; local file="$2"; local pattern="$3"; local min="$4"
  local got
  got=$(count_pattern "$file" "$pattern")
  if [ "$got" -ge "$min" ] 2>/dev/null; then
    ok "$label" "$got matches (≥ $min)"
  else
    bad "$label" "expected ≥ $min, got $got for /$pattern/"
  fi
}

# assert_zero <label> <file> <pattern>
# Useful for "no broken href shape leaked through".
assert_zero() {
  local label="$1"; local file="$2"; local pattern="$3"
  local got
  got=$(count_pattern "$file" "$pattern")
  if [ "$got" = "0" ]; then
    ok "$label" "no matches"
  else
    bad "$label" "expected 0, got $got for /$pattern/"
  fi
}

printf '\nBrowser QA — DOM-shape assertions against %s\n' "$BASE"
printf '%s\n' "------------------------------------------------------------"

# ── 1. VN detail action group contract on /vn/v28032 ─────────────
#    The VnDetailActionsBar documents an exact contract:
#      - 4 inline primary buttons (favorite, wishlist/heart, queue, lists)
#      - 5 dropdown triggers (Tracking, External, Media, Data, Mapping)
#      - 1 right-anchored danger button (Remove)
#    See VnDetailActionsBar.tsx header comment for the source of truth.
printf '\n[1] VN detail action group contract /vn/v28032\n'
VN_HTML=$(fetch_html "/vn/v28032")
if [ -n "$VN_HTML" ]; then
  # The contract is "at least N" on the rendered HTML because dropdown
  # menu trigger buttons + the inline primary buttons can both surface,
  # and the danger button only renders when the VN is in collection.
  # We pin the exact ratios that the comment promises: at-least bounds
  # catch the regression where one group disappears entirely.
  assert_at_least "dropdown triggers (aria-haspopup=\"menu\")" \
    "$VN_HTML" 'aria-haspopup="menu"' 5
  assert_at_least "right-anchored danger button (btn-danger)" \
    "$VN_HTML" 'class="[^"]*btn-danger' 1
  # Inline primary buttons: favorite + queue + lists are all present
  # as `<button>` even when the VN is not in collection — the heart
  # / queue surfaces still render in a degraded "add then toggle"
  # mode. So the lower bound is 4 across every state.
  assert_at_least "inline primary buttons under actions bar" \
    "$VN_HTML" '<button[^>]*class="[^"]*(btn|favorite|queue)' 4
  rm -f "$VN_HTML"
fi

# ── 2. Cover/banner rotation controls on /vn/v28032 ──────────────
#    Aria-label for rotate left/right must match the i18n key for the
#    rendered locale. We probe all three locale spellings so the
#    assertion passes regardless of which cookie the dev server has.
printf '\n[2] Cover/banner rotation controls /vn/v28032\n'
VN_HTML=$(fetch_html "/vn/v28032")
if [ -n "$VN_HTML" ]; then
  # FR: "Pivoter à gauche" / "Pivoter à droite"
  # EN: "Rotate left" / "Rotate right"
  # JA: "左に回転" / "右に回転"
  assert_at_least "rotate-left aria-label present (any locale)" \
    "$VN_HTML" 'aria-label="(Pivoter à gauche|Rotate left|左に回転)"' 1
  assert_at_least "rotate-right aria-label present (any locale)" \
    "$VN_HTML" 'aria-label="(Pivoter à droite|Rotate right|右に回転)"' 1
  rm -f "$VN_HTML"
fi

# ── 3. /tags click behavior — Local + VNDB tab strip ─────────────
#    /tags renders a two-mode tab strip; clicking a tag goes either
#    to the library filter or to the VNDB-wide /tag/[id] page based
#    on the active mode. See lib/tags-page-modes.ts.
printf '\n[3] /tags Local / VNDB tab strip\n'
TAGS_HTML=$(fetch_html "/tags")
if [ -n "$TAGS_HTML" ]; then
  # The mode is exposed in the URL the tab strip links to. Either
  # `?mode=local` (or no mode → default local) and `?mode=vndb`
  # must both appear in the rendered switcher.
  assert_at_least "tab strip exposes VNDB mode link" \
    "$TAGS_HTML" 'href="/tags\?mode=vndb"' 1
  # The "local" tab link is the bare /tags route (default mode).
  assert_at_least "tab strip exposes local mode link" \
    "$TAGS_HTML" 'href="/tags"' 1
  rm -f "$TAGS_HTML"
fi

# ── 4. VNDB BBCode link normalization on /vn/v15446 ──────────────
#    Description-rendered hrefs must NEVER be the broken `/cNNN` or
#    `http://localhost:3000/cNNN` shapes. They must rewrite to the
#    canonical internal route (`/character/cNNN`, `/vn/vNNN`, etc.)
#    via normalizeVndbHref(). See lib/vndb-link-normalize.ts.
printf '\n[4] VNDB BBCode link normalization /vn/v15446\n'
VN_HTML=$(fetch_html "/vn/v15446")
if [ -n "$VN_HTML" ]; then
  # No bare /cNNN / /vNNN / /rNNN / /pNNN / /gNNN / /iNNN / /sNNN
  # hrefs that bypass the normalizer.
  assert_zero "no bare /cNNN href leaks" \
    "$VN_HTML" 'href="/c[0-9]+"'
  assert_zero "no bare /pNNN href leaks" \
    "$VN_HTML" 'href="/p[0-9]+"'
  assert_zero "no bare /rNNN href leaks" \
    "$VN_HTML" 'href="/r[0-9]+"'
  assert_zero "no localhost-absolute /cNNN href leaks" \
    "$VN_HTML" 'href="http://localhost:[0-9]+/c[0-9]+"'
  # External vndb.org hrefs should also have been rewritten — every
  # known prefix has an internal route.
  assert_zero "no absolute vndb.org/cNNN leaked" \
    "$VN_HTML" 'href="https://(www\.)?vndb\.org/c[0-9]+"'
  rm -f "$VN_HTML"
fi

# ── 5. /characters filters and grouping ──────────────────────────
#    The page must render a Local/VNDB tab strip + sex / role filters.
#    Blood-type filter is a documented future extension (Agent B); we
#    don't fail when it's missing but DO assert sex + role exist.
printf '\n[5] /characters Local / VNDB tabs + filters\n'
CH_HTML=$(fetch_html "/characters")
if [ -n "$CH_HTML" ]; then
  assert_at_least "tab strip exposes VNDB mode link" \
    "$CH_HTML" '\?tab=vndb' 1
  # Sex filter chips link with `sex=` URL param.
  assert_at_least "sex filter chips" \
    "$CH_HTML" 'href="[^"]*[?&]sex=[mfbn]' 1
  # Role filter chips link with `role=` URL param.
  assert_at_least "role filter chips" \
    "$CH_HTML" 'href="[^"]*[?&]role=(main|primary|side|appears)' 1
  rm -f "$CH_HTML"
fi

# ── 6. /staff/s12799 aliases + clickable fields ──────────────────
#    Agent B will land alias chips with `aria-label` matching the
#    `staff.aliasesLabel` i18n key, and turn the gender chip into a
#    `<a href="/staff?sex=…">`. Until that lands these assertions
#    fail loud so the regression is visible.
printf '\n[6] /staff/s12799 aliases + clickable gender chip\n'
STAFF_HTML=$(fetch_html "/staff/s12799")
if [ -n "$STAFF_HTML" ]; then
  # Aria-label keyed on staff.aliasesLabel — FR/EN/JA spellings.
  assert_at_least "alias chip aria-label (any locale)" \
    "$STAFF_HTML" 'aria-label="(Pseudonymes|Aliases|別名)"' 1
  # Gender chip should be a clickable anchor with sex param.
  assert_at_least "gender chip is a <a href=\"/staff?sex=...\">" \
    "$STAFF_HTML" 'href="/staff\?sex=' 1
  rm -f "$STAFF_HTML"
fi

# ── 7. Global spoiler reveal wrappers on /vn/v28032 ──────────────
#    Spoiler-tagged content must render through <SpoilerReveal> so
#    the user-facing toggle works. Look for the `aria-pressed`
#    attribute the component emits on its tap-target button.
printf '\n[7] SpoilerReveal wrappers on /vn/v28032\n'
VN_HTML=$(fetch_html "/vn/v28032")
if [ -n "$VN_HTML" ]; then
  assert_at_least "spoiler-reveal aria-pressed triggers present" \
    "$VN_HTML" 'aria-pressed="(true|false)"' 1
  rm -f "$VN_HTML"
fi

# ── 8. Character spoiler reveal on /character/c84419 ─────────────
#    Same gate plus a description chunk OUTSIDE any wrapper — the
#    non-spoiler synopsis must render plain.
printf '\n[8] /character/c84419 spoiler reveal + plain description\n'
CHAR_HTML=$(fetch_html "/character/c84419")
if [ -n "$CHAR_HTML" ]; then
  assert_at_least "spoiler-reveal triggers present" \
    "$CHAR_HTML" 'aria-pressed="(true|false)"' 1
  # The character page renders a description block with class
  # "whitespace-pre-wrap" — confirm the description container is
  # present even when spoilers wrap nested chunks.
  assert_at_least "non-spoilered description container renders" \
    "$CHAR_HTML" 'class="[^"]*whitespace-pre-wrap' 1
  rm -f "$CHAR_HTML"
fi

# ── 9. Settings density: global default + per-page section ───────
#    The Settings → Display panel must surface BOTH a global slider
#    (legacy `cardDensityPx`) AND the per-scope override list. We
#    probe the rendered Settings page directly via /api/settings —
#    the server-side persisted shape exposes both keys when set.
printf '\n[9] Density global default + per-scope section\n'
SETTINGS_JSON=$(mktemp -t browser-qa.XXXXXX)
SETTINGS_CODE=$(curl -sS -o "$SETTINGS_JSON" -w '%{http_code}' --max-time 10 "${BASE}/api/settings" 2>/dev/null || echo "000")
if [ "$SETTINGS_CODE" = "200" ]; then
  # `/api/settings` JSON includes the `default_*` keys; the density
  # split itself lives on the client localStorage. We do a softer
  # probe here: simply assert the settings endpoint is reachable.
  ok "GET /api/settings reachable" "HTTP 200"
  # And confirm the Settings page emits both copy lines.
  ROOT_HTML=$(fetch_html "/")
  if [ -n "$ROOT_HTML" ]; then
    # The Settings modal preloads its i18n strings into the page
    # body via the dictionary import — look for both `cardDensity`
    # surface markers anywhere in the rendered HTML.
    assert_at_least "cardDensityDefault i18n surface present" \
      "$ROOT_HTML" '(Default density|Densité par défaut|デフォルト密度)' 1
    assert_at_least "perPageDensity i18n surface present" \
      "$ROOT_HTML" '(Per-page overrides|Réglages par page|ページごとの設定)' 1
    rm -f "$ROOT_HTML"
  fi
else
  bad "GET /api/settings" "HTTP $SETTINGS_CODE"
fi
rm -f "$SETTINGS_JSON"

# ── 10. Library card grid spacing on / ───────────────────────────
#    The library grid must render with the density-responsive
#    minmax pattern that drives `--card-density-px`. The `gap-3`
#    class shows up in either the dense or saved-filter chip path.
printf '\n[10] Library card grid /\n'
ROOT_HTML=$(fetch_html "/")
if [ -n "$ROOT_HTML" ]; then
  # The grid container — div or ul — must declare the auto-fill
  # density variable AND a gap class. The variable is the canonical
  # contract: every page that participates in the slider uses it.
  assert_at_least "library grid uses --card-density-px minmax" \
    "$ROOT_HTML" '--card-density-px' 1
  assert_at_least "library grid carries a gap class" \
    "$ROOT_HTML" 'class="[^"]*grid[^"]*gap-' 1
  rm -f "$ROOT_HTML"
fi

# ── Summary ───────────────────────────────────────────────────────
printf '\n%s\n' "------------------------------------------------------------"
printf '%sPASS%s: %d   %sFAIL%s: %d\n' "$C_OK" "$C_RST" "$PASS" "$C_BAD" "$C_RST" "$FAIL"

if [ "$FAIL" -gt 0 ]; then
  exit 1
fi
exit 0
