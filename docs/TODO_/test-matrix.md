# Test coverage matrix

Mapping of every shipped behaviour to the Vitest spec that pins it.
Update this table whenever a new feature lands — a row without a test
file is a known gap and should drive the next test commit.

| Feature | Test file | Behaviours covered | Status |
| --- | --- | --- | --- |
| Scoped card density resolve order | `tests/density-scopes.test.ts` | per-scope override, fallback to global, clamp range | COVERED |
| Density migration / legacy keys | `tests/density-scopes.test.ts` | legacy `cardDensityPx` value promotes to `density.library` | COVERED |
| Density cross-scope isolation | `tests/density-cross-scope-isolation.test.ts` | per-page reset only clears the targeted scope; sibling scopes + global default untouched | COVERED |
| Density Settings panel | `tests/density-settings-ui.test.ts` | Settings → Display surfaces a global slider AND a per-page override list with per-row Reset | COVERED |
| Platform display helper | `tests/platform-display.test.ts` | mapping VNDB platform codes to localised labels, fallback to raw code | COVERED |
| Platform label mapping (`platformLabel`) | `tests/platform-label.test.ts` | duplicate keys collapse, unknown code → raw display, all three locales | COVERED |
| Shelf slot owned fields | `tests/shelf-slot-owned-fields.test.ts` | placement / swap / evict semantics for `shelf_slot` + `shelf_display_slot` | COVERED |
| Shelf popover platform label | `tests/shelf-popover-platform.test.ts` | the unplaced-pool popover surfaces the platform label without bloating the trigger | COVERED |
| Edition filter parity | `tests/library-edition-filter.test.ts` | `?edition=` URL param parses, scoped to the right query, returns rows with that edition | COVERED |
| Dictionary parity | `tests/dictionaries-parity.test.ts` | every leaf key present in all three locales (FR / EN / JA) | COVERED |
| Personal phrasing scanner | `tests/personal-phrasing.test.ts` | forbidden phrasings + real-title list scrubbed across `src/` + `tests/` | COVERED |
| Recommendation modes | `tests/recommend-modes.test.ts` | every mode (`because-you-liked` / `tag-based` / `hidden-gems` / `highly-rated` / `similar-to-vn`) honours URL params + falls back to defaults | COVERED |
| Owned / wishlist indicators | `tests/recommend-owned-badge.test.ts` | recommendation cards expose `owned` / `wishlist` chips when the source row matches | COVERED |
| Similar-to-vn empty seed | `tests/recommend-similar-to-vn-empty.test.ts` | `similar-to-vn` without a seed VN renders the picker, not a crash | COVERED |
| VN seed picker | `tests/vn-seed-picker.test.ts` | URL round-trip (`?vn=v123`), debounce, preserved siblings | COVERED |
| Wishlist / collection separation | `tests/wishlist-collection-separation.test.ts` | wishlist label-5 ulist rows never count as owned | COVERED |
| Top-ranked URL params | `tests/top-ranked-query.test.ts` | `?tab=vndb / egs`, `?year`, `?lang` parsing | COVERED |
| Bayesian top-ranked ranking | `tests/egs-bayesian-rank.test.ts` | Bayesian smoothing on EGS scores using collection-wide mean | COVERED |
| Top-ranked display | `tests/top-ranked-display.test.ts` | row sort, freshness chip, stale-while-error banner | COVERED |
| Top-ranked stale-while-error | `tests/egs-stale-while-error.test.ts` | cached body served on upstream failure, stale=true flag surfaces | COVERED |
| Quote avatar helper + fallback | `tests/quote-avatar-helper.test.ts` | character → VN cover → null fallback chain, flat + nested shapes | COVERED |
| Stats chart links | `tests/stats-chart-links.test.ts` | every chart bar links to a pre-filtered listing URL | COVERED |
| Dumped row link helpers | `tests/dumped-vs-library-filter.test.ts` | dumped filter on /shelf?view=item vs library page parity | COVERED |
| Global refresh release_meta_cache | `tests/global-refresh-release-meta.test.ts` | `POST /api/refresh/global` busts release_meta_cache rows | COVERED |
| Release meta materializer | `tests/release-meta-materializer.test.ts` | dimension fields hydrate aspect bucket helpers | COVERED |
| Aspect filter end-to-end | `tests/aspect-filter-e2e.test.ts` | URL `?aspect=` round-trip, group=aspect ranks correctly | COVERED |
| Aspect override (per-edition + VN) | `tests/aspect-ratio-override.test.ts` | priority chain: VN override > edition override > derived | COVERED |
| Aspect bucket primitives | `tests/aspect-ratio.test.ts` | resolution → bucket helpers + edge ratios | COVERED |
| Cover rotation (helper) | `tests/cover-rotation.test.ts` | normalize, modulo wrap, drop-out-of-range, PATCH body shape | COVERED |
| Cover rotation (UI surface) | `tests/cover-rotation-ui.test.ts` | rotate buttons render with i18n labels; reset affordance gated on non-zero rotation | COVERED |
| SafeImage rotation transform | `tests/safe-image-rotation.test.ts` | `buildRotationStyle()` math for 0 / 90 / 180 / 270 | COVERED |
| Cover / banner mutation events | `tests/cover-banner-events.test.ts` | typed events propagate across siblings with vn-id scoping | COVERED |
| SpoilerReveal component | `tests/spoiler-reveal.test.ts` | truth table: hover / focus / tap / global level / per-section override | COVERED |
| Spoiler global default | `tests/spoiler-global-default.test.ts` | the global preference drives the default render state of every `<SpoilerReveal>` | COVERED |
| Character spoiler render | `tests/character-spoiler-render.test.ts` | character detail page wraps spoilered chunks; description outside any wrapper renders plain | COVERED |
| VNDB BBCode markup | `tests/vndb-markup.test.ts` | `[url]`, `[b]`, `[i]`, autolinks, scheme allowlist, `[spoiler]` → `<SpoilerReveal>` | COVERED |
| VNDB BBCode link normalization | `tests/vndb-link-normalize.test.ts` | absolute / bare / relative VNDB-id shapes rewrite to canonical internal routes; unknown prefixes pass through | COVERED |
| Portal popover | `tests/portal-popover.test.ts` | portals into `document.body`, flips on viewport collision, restores focus on close | COVERED |
| Library card grid spacing | `tests/library-spacing.test.ts` | density-driven minmax + gap class are emitted server-side | COVERED |
| VNDB tag grouped view | `tests/vn-tags-grouped.test.ts` | category aggregation (`cont` / `ero` / `tech`), spoiler-mode per section, summary counts | COVERED |
| /tags Local / VNDB mode | `tests/tags-page-modes.test.ts` | URL param parse, tab strip href contract, chip href routing | COVERED |
| /tag empty fallback | `tests/tag-page-empty-fallback.test.ts` | unknown tag id returns a graceful empty state, not a crash | COVERED |
| /characters browsing filters | `tests/character-browse-filters.test.ts` | local / vndb tab strip + sex + role filter chips | COVERED |
| /characters search filters | `tests/character-search-filters.test.ts` | free-text query + filter chips round-trip through URL state | COVERED |
| /staff search filters | `tests/staff-search-filters.test.ts` | free-text query + `ismain` toggle + filter chips | COVERED |
| /staff page fields | `tests/staff-page-fields.test.ts` | alias chips render with `aria-label`; gender chip is a clickable filter link | COVERED |
| EGS metadata clickable tokens | `tests/egs-metadata-links.test.ts` | brand + release-year render as `<Link>` chips to filtered listings | COVERED |
| VN detail refresh gating | `tests/vn-detail-collection-gating.test.ts` | Refresh CTA renders for any `v\d+` id, not just in-collection rows | COVERED |
| Series detail layout | `tests/series-detail-layout.test.ts` | parser default / v0-shape / drop-unknown / dedupe / malformed JSON | COVERED |
| Schema EGS section | `tests/schema-egs-section.test.ts` | row counts, fetched_at aggregation, stale-while-error flag, egs_username presence (no value echo) | COVERED |
| VN detail layout | `tests/vn-detail-layout.test.ts` | parser default / drop-unknown / dedupe / malformed JSON | COVERED |
| Home section layout | `tests/home-section-layout.test.ts` | parser default / patch merge / drop-unknown | COVERED |
| Media menu (label sizing helper) | `tests/shelf-popover-platform.test.ts` (sizing helper covered indirectly) | label fits container without overflow | PARTIAL |
| Owned platform backfill | `tests/owned-platform-backfill.test.ts` | new-format platform string promoted into owned_release | COVERED |
| Shelf layout (placement / swap / evict) | `tests/shelf-layout.test.ts` | atomic move / swap / evict semantics in `placeShelfItem` | COVERED |
| Settings audit log | `tests/setting-audit.test.ts` | sensitive keys (token / Steam key / backup URL) leave tail-only previews | COVERED |
| Settings backup URL mask | `tests/settings-backup-url-mask.test.ts` | GET never echoes the raw URL; PATCH stores the trimmed value | COVERED |
| URL allowlist | `tests/url-allowlist.test.ts` | scheme allowlist in VBndb markup blocks `javascript:` / `data:` | COVERED |
| CSRF guard | `tests/csrf.test.ts` | non-GET routes require the Origin / Sec-Fetch-Site checks | COVERED |
| Format helpers | `tests/format.test.ts` | playtime / votes / number formatters | COVERED |
| EGS manual mapping | `tests/egs-manual-mapping.test.ts` | `vn_egs_link` + `egs_vn_link` override the auto-resolved EGS row | COVERED |
| DB migration HMR | `tests/db-migration-hmr.test.ts` | `ensureColumn` idempotent across hot reloads | COVERED |
| Download status pub/sub | `tests/download-status-pubsub.test.ts` | tick/finish events propagate via SSE to subscribers | COVERED |
| Shelf view prefs | `tests/shelf-view-prefs.test.ts` | parser defaults, clamp ranges, reset, css-var derivation | COVERED |
| Loading-state helper | `tests/loading-state-helpers.test.ts` | `pickLoadingView()` decides skeleton vs empty-state vs content from `{ status, items, error }` triple | COVERED |
| Drag-id parser | `tests/parse-drag-id.test.ts` | parser handles `|` separators, rejects malformed payloads (regression-pinned for the shelf editor + popover) | COVERED |
| Docs hygiene (no real titles) | `tests/docs-no-real-titles.test.ts` | every `.md` under the repo free of real VN / studio / character names | COVERED |
| Docs hygiene (no personal phrasing) | `tests/personal-phrasing.test.ts` | every `.md` + every source file under `src/` and `tests/` free of personal phrasings | COVERED |

## Coverage gaps to close

- **Cover rotation** — CLOSED. Pinned by `tests/cover-rotation.test.ts`,
  `tests/cover-rotation-ui.test.ts`, and `tests/safe-image-rotation.
  test.ts` (helper math, UI surface, and `buildRotationStyle()`).
- **Portal popover** — CLOSED. `tests/portal-popover.test.ts` pins the
  portal target, the viewport-collision flip, and focus restore.
- **VNDB tag grouped view** — CLOSED. `tests/vn-tags-grouped.test.ts`
  pins the category aggregation (`cont` / `ero` / `tech`), the summary
  counts, and the per-section spoiler-mode override.
- **Media menu label sizing helper** — CLOSED. Extracted to
  `src/components/media-menu-helpers.ts` and pinned by
  `tests/media-menu.test.ts` (sizing contract + horizontal flip
  decision).

Open gaps:

- **Browser-level DOM-shape regression** — `scripts/browser-qa.sh`
  hits the running dev server and asserts specific DOM patterns
  (action group counts, rotation aria-labels, BBCode href normaliser
  output, /staff alias chips, SpoilerReveal triggers, density panel
  sections, library grid shape). Until the assertions all pass on a
  stock setup, this row stays open. Companion to `scripts/smoke.sh`
  (HTTP-status smoke) and Vitest (logic / pure-function smoke).

