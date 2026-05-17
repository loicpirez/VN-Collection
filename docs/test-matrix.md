# Test coverage matrix

Mapping of every shipped behaviour to the Vitest spec that pins it.
Update this table whenever a new feature lands — a row without a test
file is a known gap and should drive the next test commit.

| Feature | Test file | Behaviours covered | Status |
| --- | --- | --- | --- |
| Scoped card density resolve order | `tests/density-scopes.test.ts` | per-scope override, fallback to global, clamp range | COVERED |
| Density migration / legacy keys | `tests/density-scopes.test.ts` | legacy `cardDensityPx` value promotes to the global scope | COVERED |
| Platform display helper | `tests/platform-display.test.ts` | mapping VNDB platform codes to localised labels, fallback to raw code | COVERED |
| Shelf slot owned fields | `tests/shelf-slot-owned-fields.test.ts` | placement / swap / evict semantics for `shelf_slot` + `shelf_display_slot` | COVERED |
| Shelf popover platform label | `tests/shelf-popover-platform.test.ts` | the unplaced-pool popover surfaces the platform label without bloating the trigger | COVERED |
| Edition filter parity | `tests/library-edition-filter.test.ts` | `?edition=` URL param parses, scoped to the right query, returns rows with that edition | COVERED |
| Dictionary parity | `tests/dictionaries-parity.test.ts` | every leaf key present in all three locales (FR / EN / JA) | COVERED |
| Personal phrasing scanner | `tests/personal-phrasing.test.ts` | forbidden phrasings + real-title list scrubbed across `src/` + `tests/` | COVERED |
| Recommendation modes | `tests/recommend-modes.test.ts` | each mode (tag / studio / mixed) honours URL params + falls back to defaults | COVERED |
| Owned / wishlist indicators | `tests/recommend-modes.test.ts` | recommendation cards expose `owned` / `wishlist` chips when the source row matches | COVERED |
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
| Cover rotation | (covered via `tests/quote-avatar-helper.test.ts` cover-fallback path; UI-level rotation pinned by manual QA) | helper produces stable order; UI rotation tested in tour walkthrough | PARTIAL |
| Spoiler reveal | `tests/vndb-markup.test.ts` | `[spoiler]` BBCode renders as plain text post-reveal | COVERED |
| VNDB BBCode markup | `tests/vndb-markup.test.ts` | `[url]`, `[b]`, `[i]`, autolinks, scheme allowlist | COVERED |
| Portal popover | `tests/parse-drag-id.test.ts` (drag-id parser exercised by the popover) + manual QA on viewport-collision flip | parser regressions surface; UI flip-on-collision validated manually | PARTIAL |
| Platform label mapping | `tests/platform-display.test.ts` | duplicate keys collapse, unknown code → raw display | COVERED |
| VNDB tag grouped view | `tests/dictionaries-parity.test.ts` (dictionary slots present in all 3 locales) | tag-group accordion translations | PARTIAL |
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
| Shelf view prefs (Blocker 25) | `tests/shelf-view-prefs.test.ts` | parser defaults, clamp ranges, reset, css-var derivation | COVERED |
| Docs hygiene (no real titles) | `tests/docs-no-real-titles.test.ts` | every `.md` under the repo free of real VN / studio / character names | COVERED |

## Coverage gaps to close

- **Cover rotation**: needs a dedicated unit pinning the rotation order
  helper (currently exercised only via the QuoteAvatar fallback path).
- **Portal popover**: needs a JSDOM-flavoured test pinning the flip-on-
  viewport-collision behaviour. The drag-id parser test only covers the
  id format.
- **VNDB tag grouped view**: needs a query-level test pinning the
  aggregation order in `getCollectionTags` (groups → tags → counts).
- **Media menu label sizing helper**: extract the helper out of
  `MediaGallery.tsx` into `lib/media-menu-label.ts` and unit-pin it.

Every row marked PARTIAL is tracked in the backlog for the next test-
focused gate.
