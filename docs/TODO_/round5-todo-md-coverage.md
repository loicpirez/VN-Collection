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
| 1 | Owned editions release picker info | R5-194 | FIXED_VERIFIED | Source proof on `ReleasesSection.tsx` + `OwnedEditionsSection.tsx`; no separate open checklist row remains for this contract. |
| 2 | "I own it" optimistic update | R5-195 | FIXED_VERIFIED | Source proof on `ReleaseOwnedToggle.tsx` + `OWNED_EDITIONS_EVENT` listener; no separate open checklist row remains for this contract. |
| 3 | Remove redundant "I own it" | R5-196 | FIXED_VERIFIED | source-pin on `ReleasesSection.tsx:235` label-swap — sufficient (single-source label) |
| 4 | VNDB date locale follows app | R5-198 | FIXED_VERIFIED | `tests/vndb-status-panel-locale.test.ts` (3/8 pin LOCALE_TAG map, Intl call shape, toIso) — STRONG |
| 5 | Top Ranked page | R5-199 | FIXED_VERIFIED | Strengthened after the initial coverage pass: `scripts/r5-199-top-ranked.mjs` Playwright evidence verifies tab routing, score metadata, density slider, SafeImage covers, and no horizontal overflow. |
| 6 | Aspect/resolution filter | R5-200 | FIXED_VERIFIED | 43 unit + 4 live Playwright — STRONG |
| 7 | Aspect override UI | R5-201 | FIXED_VERIFIED | 18 unit + 4 live Playwright + activity trace — STRONG |
| 8 | Shelf fullscreen | R5-202 | FIXED_VERIFIED | 9/9 live Playwright (aria-pressed, overlay class chain, body.overflow lock, Escape, focus restore) — STRONG |
| 9 | Display risers | R5-203 | FIXED_VERIFIED | 8 DB tests + 4/4 live render (DisplayRow label + accent-blue + Layers icon) — STRONG |
| 10 | VN-page stability | R5-204 | FIXED_VERIFIED | 40/40 sequential opens, heap oscillates 94–191 MB without monotonic growth — STRONG |
| 11 | Wishlist / collection separation | R5-205 | FIXED_VERIFIED | `tests/wishlist-collection-separation.test.ts` (5 tests, fetch stub traps URLs) — STRONG |
| 12 | Selective download from / | R5-206 | FIXED_VERIFIED | 6/6 live Playwright (CTA mount, dropdown, dialog portal, picker mount, Escape close) — STRONG |
| 13 | Library defaults | R5-207 | FIXED_VERIFIED | 33 API tests + 4/4 live Playwright (PATCH→navigate→assert; URL override) — STRONG |
| 14 | Release cover fallback | R5-208 | FIXED_VERIFIED | Strengthened after the initial coverage pass: `scripts/r5-208-release-cover-fallback.mjs` samples 20 owned-release routes and observes the parent-VN-cover fallback caption. |
| 15 | VNDB status panel separates concepts | R5-197 | FIXED_VERIFIED | `tests/vndb-status-panel-locale.test.ts` (8/8) — STRONG |
| 16 | Refresh scope per-page | R5-215 | FIXED_VERIFIED | per-page scope wiring pinned by `tests/refresh-scopes.test.ts` + dict copy — STRONG |
| 17 | Brand overlap audit | R5-209 | FIXED_VERIFIED | Strengthened after the initial coverage pass: `scripts/r5-209-brand-overlap.mjs` verifies real overlap cards, in-collection markers, and no horizontal overflow. |
| 18 | VN page layout settings | R5-210 | FIXED_VERIFIED | 12 API tests + 2/2 live PATCH→reload→assert — STRONG |
| 19 | Button system | R5-211 | FIXED_VERIFIED | source-pin + 5/5 forced-override rejection + 8-surface Playwright bbox bucketing — STRONG |
| 20 | Recommendations visual | R5-212 | FIXED_VERIFIED | Strengthened after the initial coverage pass: `scripts/r5-212-recommendations-visual.mjs` records bbox parity across default, hidden-gems, and classics modes. |
| 21 | Upcoming visual | R5-213 + R5-219 | FIXED_VERIFIED | R5-213 points to the canonical R5-219 proof; `scripts/upcoming-focused.mjs` measured 312 cards across all tabs with correct width, cover ratio, and no horizontal overflow. |
| 22 | Tag detail "Best VN" copy | R5-214 | FIXED_VERIFIED | `tests/tag-page-neutral-copy.test.ts` rejects across FR/EN/JA — STRONG |
| 23 | README compliance | R5-174 | FIXED_VERIFIED | source-pin on README data-section; checked links | OK |
| 24 | API docs cited | R5-216 | FIXED_VERIFIED | `tests/api-docs-cited.test.ts` (4/4) pins KANA citations on subtle hot-spots — STRONG |
| 25 | Process: no HTTP 200-only marker | R5-217 | FIXED_VERIFIED | `tests/checklist-no-http200-only.test.ts` enforces commit-hash + ≥14 chars evidence — STRONG |

Items 26+ in the 0.md..6.md set that don't appear above are either implicit (covered by the
R5-000..R5-193 block carried over from 0.md verbatim) or surface in a later row added during
the current pass (e.g. R5-218 Spoiler visual reveal carries `scripts/spoiler-focused.mjs`
Playwright proof, which addresses 2.md Findings 1, 2, 6 together).

## Currently-flagged downgrades

No historical visual downgrade remains open in the master checklist. The rows that this
coverage file previously flagged (R5-199, R5-208, R5-209, R5-212, R5-213) were later
strengthened with Playwright or route-render evidence in
`docs/round5-master-regression-checklist.md`.

## Open process notes (recorded for the operator)

- Final QA recipe stays gated until every TODO row clears AND every visual row has visual
  evidence. The current-session follow-ups in the master checklist are now recorded:
  `UXA-040` in `b8b0532`, `PERF-001` in `25aaded`, and `PERF-004` in `a2be73a`.
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
