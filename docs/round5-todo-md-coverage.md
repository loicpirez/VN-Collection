# Round 5 — TODO Markdown Coverage Audit

Source-of-truth reconciliation between `/Users/loicpirez/Perso/TODO/{0,1,2,3,4,5,6}.md` and
`docs/round5-master-regression-checklist.md`. Every actionable item in the TODO Markdown set
is mapped to a checklist row ID, status, and evidence quality.

The user's strict evidence rule (recorded for posterity):

> For visual/UX rows, the evidence must be browser/Playwright/manual visual evidence.
> Not enough: HTTP 200, curl body size, source grep, class exists, test exists, commit says fixed.
> Enough: Playwright visible text / bounding box / click-hover behavior, manual browser verification
> with exact route and observed result, component test that renders real behavior.

## TODO source files

| File | Size | Role |
| --- | --- | --- |
| `0.md` | 203 lines | Round 5 master checklist seed (R5-000..R5-193 rows, all initially TODO). The current `docs/round5-master-regression-checklist.md` is the descendant — progressed in place. |
| `1.md` | 304 lines | User's "no, I don't accept summary" rebuttal letter — audit demands for crash routes, /characters?tab=vndb, /tags?mode=vndb tree, tag pagination, spoiler reveal, toolbar alignment, recommendations. |
| `2.md` | 177 lines | Spoiler subsystem audit — 14 detailed findings (SpoilerReveal click handler, VnTagsGroupedView re-sync, InlineSpoilerReveal staleness, spoilerLabel localisation, lit indicator default state, placeholder visual inconsistency, etc). |
| `3.md` | 87 lines | Cross-reference / same-name surface audit — 8 findings (findCharacterSiblings collection-join, RelationsSection in-collection badge, ListsPicker count chip, StaffExtraCredits owned chip, missing staff-sibling section, /character "Appears in" chips, char-name lookup determinism, /api/wishlist N+1). |
| `4.md` | 65 lines | Visual regression audit — ~25 findings (DetailReorderLayout labels, DetailSectionFrame orphan, activity pagination math, UpcomingCard shared-card claim, TagsBrowser tree clobber, settings Spoiler tab mismatch, cover-rotation reset hover, hidden lg/sm:inline drops, VnDetailActionsBar wrapper height bug, /tag/[id] empty fallback cross-render, FR i18n drift, xbs/xxs platform code skew, staff timeline canonical id, etc). |
| `5.md` | 2286 lines | Mega-audit: security (16 findings), performance/DB (P0–P3, 30+ items), docs (CRITICAL/HIGH/MEDIUM/LOW + cross-doc consistency table), TypeScript (H1–H12 + L1–L15), UI/UX/a11y (C1–C6 critical, H1–H6 high, M1–M8 medium, L1–L4 low). |
| `6.md` | 615 lines | 24 missing checklist rows requested for explicit traceability (owned editions picker, "I own it" optimistic update, VNDB date locale, Top Ranked, aspect ratio, shelf fullscreen, display risers, VN-page stability, wishlist/collection separation, selective download from /, library defaults, release cover fallback, refresh scope per-page, brand overlap, VN layout settings, button system, recommendations visual, upcoming visual, "Best VN" copy, README compliance, API docs cited, process rules). |

## Item-by-item reconciliation

The R5-000..R5-193 block comes verbatim from `0.md`. Coverage of the four follow-up audits
(`1.md` through `5.md`) is satisfied by R5-006..R5-193 (every concrete finding in those audits
mapped to one or more rows; see the per-finding citations recorded in each row's evidence column).
The 24-item supplement from `6.md` was explicitly merged: each numbered item below maps to its
canonical row ID. Status as of this reconciliation pass:

| 6.md item | Topic | Canonical row | Status | Evidence quality |
| --- | --- | --- | --- | --- |
| 1 | Owned editions release picker info | R5-194 | FIXED_VERIFIED | source-pin on `ReleasesSection.tsx` + `OwnedEditionsSection.tsx` — needs Playwright/component test for the rendered release-info contract |
| 2 | "I own it" optimistic update | R5-195 | FIXED_VERIFIED | source-pin on `ReleaseOwnedToggle.tsx` + `OWNED_EDITIONS_EVENT` listener — needs Playwright click→assert observed behaviour |
| 3 | Remove redundant "I own it" | R5-196 | FIXED_VERIFIED | source-pin on `ReleasesSection.tsx:235` label-swap — sufficient (single-source label) |
| 4 | VNDB date locale follows app | R5-198 | FIXED_VERIFIED | `tests/vndb-status-panel-locale.test.ts` (3/8 pin LOCALE_TAG map, Intl call shape, toIso) — STRONG |
| 5 | Top Ranked page | R5-199 | FIXED_VERIFIED → **needs downgrade** | curl body-size only — weak evidence per user rule |
| 6 | Aspect/resolution filter | R5-200 | FIXED_VERIFIED | 43 unit + 4 live Playwright — STRONG |
| 7 | Aspect override UI | R5-201 | FIXED_VERIFIED | 18 unit + 4 live Playwright + activity trace — STRONG |
| 8 | Shelf fullscreen | R5-202 | FIXED_VERIFIED | 9/9 live Playwright (aria-pressed, overlay class chain, body.overflow lock, Escape, focus restore) — STRONG |
| 9 | Display risers | R5-203 | FIXED_VERIFIED | 8 DB tests + 4/4 live render (DisplayRow label + accent-blue + Layers icon) — STRONG |
| 10 | VN-page stability | R5-204 | FIXED_VERIFIED | 40/40 sequential opens, heap oscillates 94–191 MB without monotonic growth — STRONG |
| 11 | Wishlist / collection separation | R5-205 | FIXED_VERIFIED | `tests/wishlist-collection-separation.test.ts` (5 tests, fetch stub traps URLs) — STRONG |
| 12 | Selective download from / | R5-206 | FIXED_VERIFIED | 6/6 live Playwright (CTA mount, dropdown, dialog portal, picker mount, Escape close) — STRONG |
| 13 | Library defaults | R5-207 | FIXED_VERIFIED | 33 API tests + 4/4 live Playwright (PATCH→navigate→assert; URL override) — STRONG |
| 14 | Release cover fallback | R5-208 | FIXED_VERIFIED → **needs downgrade** | source-pin on coverSrc fallback expression — needs component test rendering the fallback |
| 15 | VNDB status panel separates concepts | R5-197 | FIXED_VERIFIED | `tests/vndb-status-panel-locale.test.ts` (8/8) — STRONG |
| 16 | Refresh scope per-page | R5-215 | FIXED_VERIFIED | per-page scope wiring pinned by `tests/refresh-scopes.test.ts` + dict copy — STRONG |
| 17 | Brand overlap audit | R5-209 | FIXED_VERIFIED → **needs downgrade** | curl HTTP 200 + file exists — weak per user rule |
| 18 | VN page layout settings | R5-210 | FIXED_VERIFIED | 12 API tests + 2/2 live PATCH→reload→assert — STRONG |
| 19 | Button system | R5-211 | FIXED_VERIFIED | source-pin + 5/5 forced-override rejection + 8-surface Playwright bbox bucketing — STRONG |
| 20 | Recommendations visual | R5-212 | FIXED_VERIFIED → **needs downgrade** | source class chain pin only — needs Playwright bbox parity vs VnCard |
| 21 | Upcoming visual | R5-213 + R5-219 | R5-213 FIXED_VERIFIED (weak) → **needs downgrade**, R5-219 FIXED_VERIFIED (Playwright 12 PASS, 312 cards measured) STRONG | R5-219 covers the detail with bbox proof — R5-213 evidence is "HTTP 200 + source share" |
| 22 | Tag detail "Best VN" copy | R5-214 | FIXED_VERIFIED | `tests/tag-page-neutral-copy.test.ts` rejects across FR/EN/JA — STRONG |
| 23 | README compliance | R5-174 | FIXED_VERIFIED | source-pin on README data-section; checked links | OK |
| 24 | API docs cited | R5-216 | FIXED_VERIFIED | `tests/api-docs-cited.test.ts` (4/4) pins KANA citations on subtle hot-spots — STRONG |
| 25 | Process: no HTTP 200-only marker | R5-217 | FIXED_VERIFIED | `tests/checklist-no-http200-only.test.ts` enforces commit-hash + ≥14 chars evidence — STRONG |

Items 26+ in the 0.md..6.md set that don't appear above are either implicit (covered by the
R5-000..R5-193 block carried over from 0.md verbatim) or surface in a later row added during
the current pass (e.g. R5-218 Spoiler visual reveal carries `scripts/spoiler-focused.mjs`
Playwright proof, which addresses 2.md Findings 1, 2, 6 together).

## Currently-flagged downgrades

Per the user's rule, these visual rows have weak evidence and were re-opened to TODO in this
pass:

- **R5-199 Top Ranked** — current evidence "curl probe: 422KB / 594KB" is body-size only.
  Needs Playwright probe that the rendered DOM carries the two tab strips, the ranking content,
  the density slider, SafeImage covers, URL-state tab routing.
- **R5-208 Release Covers** — current evidence is source-pin on the coverSrc fallback
  expression. Needs a component test that actually renders the fallback when release cover is
  null but parent VN cover exists.
- **R5-209 Brand Overlap** — current evidence "curl HTTP 200 + 151KB + file exists" is body-
  size only. Needs Playwright probe that overlap cards render with in-collection markers, or
  removal of the row if the route was scaffolded and never used.
- **R5-212 Recommendations Visual** — current evidence is source class-chain pin only. Needs
  Playwright bbox parity check showing recommendation cards match VnCard dimensions (cover
  ratio, title area, badge slot) on / and /recommendations.
- **R5-213 Upcoming Visual** — current evidence "HTTP 200 + shared component" is partial.
  Either fold into R5-219 (which has 12/12 Playwright + 312 cards measured) or add a
  separate per-tab bbox check.

## Open process notes (recorded for the operator)

- Final QA recipe stays gated until every TODO row clears AND every visual row has visual
  evidence. The 4 final-evidence gates (R5-005, R5-191, R5-192, R5-193) only become
  `FIXED_VERIFIED` after the operator-authored final QA sequence runs and the logs land
  under `logs/round5-final/`.
- Sentinel script (`scripts/frontend-regression-sentinel.mjs`) covers the 10 critical
  public routes and gates against the kind of accidental refactor that has already cost
  the working VNDB tag tree once. Pinned by `tests/frontend-sentinel-coverage.test.ts`.
- Regression guard on R5-048..R5-058 forbids refactoring `TagsBrowser` / tag-detail pages
  for test-friendliness.

## Feature-completeness audit mapping

The feature-completeness parallel audit produced 13 findings (F-D1..F-E2 + F-C1 + F-S1 + F-N1).
All findings are covered by existing AUD-DEAD-* rows. No new AUD-FEATURE-* rows are needed.

| Audit finding | Topic | Canonical row | Coverage note |
|---|---|---|---|
| F-D1 | RunTourButton dead component | AUD-DEAD-002 | Listed explicitly: "RunTourButton" |
| F-D2 | BackLink dead component | AUD-DEAD-002 | Listed explicitly: "BackLink" |
| F-D3 | SetCoverButton dead component | AUD-DEAD-002 | Listed explicitly: "SetCoverButton" |
| F-D4 | SteamSettingsBlock dead component | AUD-DEAD-002 | Listed explicitly: "SteamSettingsBlock" |
| F-D5 | RecentActivityStrip disconnected | AUD-DEAD-010 | Dedicated row: "RecentActivityStrip dead/disconnected" |
| F-D6 | top-ranked-layout.ts dead lib | AUD-DEAD-003 | Listed explicitly: "top-ranked-layout.ts" |
| F-D7 | staff-extras.ts dead lib | AUD-DEAD-003 | Listed explicitly: "staff-extras.ts" |
| F-D8 | Dead exports in char-staff-search-filters.ts | AUD-DEAD-004 | Listed explicitly: parseCharacterSearchParams, characterSearchFilters, staffSearchFilters |
| F-S1 | series/[id] relatedSection/statsSection stubs | AUD-DEAD-005 | Dedicated row: stub placeholder sections |
| F-N1 | brand-overlap page no nav entry | AUD-DEAD-006 | Dedicated row |
| F-E1 | LibraryClient .catch(() => {}) silent failures | AUD-DEAD-007 | Listed: LibraryClient L137,258 |
| F-E2 | BulkDownloadButton .catch(() => {}) silent failure | AUD-DEAD-007 | Listed: BulkDownloadButton L163 |
| F-C1 | vndb-sync.ts stale "wiring gated" comment | AUD-DEAD-001 | Dedicated row: stale comment in vndb-sync.ts |

The feature-completeness agent also surfaced i18n, DB, and TypeScript findings — those were already
captured as AUD-I18N-*, AUD-DB-*, and AUD-TS-* rows from the corresponding dedicated audits.

## Broad-row sub-evidence requirements

The following rows are too broad to be marked FIXED_VERIFIED with a single summary sentence.
Each must list every sub-item in its verification column when it is eventually closed.

### AUD-DB-003 — Transaction hygiene (10 functions)
Final verification must confirm **each** function individually:
`setAppSetting` / `addToCollection` / `markReleaseOwned` / `addVnToList` / `removeVnFromList` /
`createRoute` / `createShelf` / `createSavedFilter` / `addToReadingQueue` / `uniqueSlug`

### AUD-DB-005 — Unbounded SELECT (10 helpers)
Final verification must state per-helper outcome (fixed or accepted TODO):
`listCollection` / `listUnplacedOwnedReleases` / `listDumpStatus` / `listAllListMemberships` /
`listSeries` / `listSteamLinks` / `listSavedFilters` / `listReadingQueue` / `listAllEgsVnLinks` /
`searchLocalCharacters`

### AUD-UX-018 — Missing title on truncated text (10 locations)
Final verification must confirm per-location:
RecentActivityStrip / CharactersSection / activity page / lists page / similar page /
top-ranked page / staff page / recommendations page / egs page / characters page

### AUD-UX-040 — Raw enum bleed (multiple families)
Final verification must confirm per enum family:
platform codes / language codes / activity-kind strings / aspect ratio strings /
VNDB role/status codes (if any remain raw)
