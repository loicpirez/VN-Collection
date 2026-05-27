# Agent Audit Todos — 2025-05-22

Each section below is the brief for one concurrent agent run.
Status: `[ ]` = pending · `[x]` = done · `[~]` = partial/acceptable

---

## STATUS LEGEND
- `[x]` Done
- `[ ]` Pending
- `[~]` Partial / acceptable as-is

---

## A — UI/UX

**Goal:** Find visual inconsistencies, missing empty states, misleading UI patterns, and design regressions across every page.

| # | File | Finding | Status |
|---|------|---------|--------|
| UX-1 | `src/app/globals.css` | `.scroll-fade-right` CSS class still present — safe to keep for non-variable-length surfaces (producers table, compare table, ShelfLayoutEditor, SchemaLocalSection) but verify none show phantom fade | `[x]` |
| UX-2 | All pages | Audit every page for missing loading skeletons on async sections | `[x]` 35 loading.tsx files cover every route segment; pinned by NEW-UXA-007 |
| UX-3 | All pages | Audit every empty state: should show informative text AFTER fetch resolves with 0 items, not immediately | `[x]` 327 empty-state checks (length === 0 / empty/Empty pattern); pinned by NEW-UXA-008 + NEW-FEAT-003 |
| UX-4 | `src/components/VnCard.tsx` | Verify cover image aspect-ratio is always 2:3 — no broken stretching | `[x]` VnCard.tsx:313 uses `aspect-[2/3] w-full` on SafeImage container |
| UX-5 | All detail pages | Truncated text fields should have `title` attribute for hover-reveal | `[x]` |
| UX-6 | `src/app/vn/[id]/page.tsx` | Check that all section nodes render coherently with no orphan headers or duplicate labels | `[x]` Section rendering driven by `DetailReorderLayout` + canonical section layout config; pinned by NEW-A11Y-002 + R5-013 |
| UX-7 | All pages | Error states (network failures in client components) should show user-friendly messages, not raw error objects | `[x]` `readApiError()` used across mutating clients; route-level `error.tsx` boundaries with localized copy; pinned by AUD-TS-004 + COMP-008 |
| UX-8 | `src/components/ActivityTimeline.tsx` | ScrollFadeRight migration left .scroll-fade-right on producers/compare tables — verify they still render correctly | `[x]` `.scroll-fade-right` kept on always-overflow surfaces (producers, compare, ShelfLayoutEditor, SchemaLocalSection); variable-length surfaces use `<ScrollFadeRight>` |
| UX-9 | All modals/dialogs | Check that all `ConfirmDialog` instances have proper destruction prevention (e.g. irreversible action confirmation) | `[x]` `ConfirmTone='danger'` applied at every destructive site (RoutesSection delete, SeriesRemoveVn, CoverUploader reset, etc.) |
| UX-10 | `src/app/page.tsx` (home) | Verify home page sections all have consistent card/section padding and margin | `[x]` Home renders strips through `home_section_layout_v1` with shared section chrome — visual parity verified by MR-016 (Playwright PASS=27) |

---

## B — Responsive / Mobile

**Goal:** Every feature must be reachable on a 375px-wide viewport without horizontal scroll on the page body. No `hidden sm:` stripping functionality.

| # | File | Finding | Status |
|---|------|---------|--------|
| R-1 | All pages | Search for `hidden sm:` and `hidden md:` that remove functional elements (labels, buttons, controls) | `[x]` |
| R-2 | `src/components/VnDetailActionsBar.tsx` | Action bar on narrow viewports — verify all actions accessible | `[x]` Toolbar uses `flex-wrap` + shared `.btn`/`.btn-xs` primitives; pinned by R5-021..R5-025 (toolbar shape + parity tests) |
| R-3 | `src/app/staff/[id]/page.tsx` | Staff header chip row wraps cleanly at 375px | `[x]` Staff page chips use `flex-wrap` chip primitives; covered by NEW-RESP-001 (no `hidden sm:inline` traps anywhere) |
| R-4 | `src/app/vn/[id]/page.tsx` | VN detail info grid (`grid-cols-[260px_1fr]`) — stacks at mobile | `[x]` Line 365: `grid grid-cols-1 ... md:grid-cols-[260px_1fr]` — single column under md (768px) |
| R-5 | `src/components/LibraryClient.tsx` | Filter panel controls are accessible on mobile | `[x]` Two-level toolbar pattern documented in CLAUDE.md ("Library toolbar convention"); `<AdvancedFiltersDrawer>` opens on small viewports; active filter chips inline |
| R-6 | `src/app/compare/page.tsx` | Horizontal comparison table — need scroll indicator or alternative layout on mobile | `[x]` Line 245: `.scroll-fade-right overflow-x-auto` wrapper provides the gradient fade hint over the comparison table |
| R-7 | `src/components/ShelfScrollFrame.tsx` | Shelf view on mobile — left/right fades work correctly | `[x]` `<ShelfScrollFrame>` wraps `ShelfSpatialView`; pinned by UXA-040 Playwright (right fade visible at scrollLeft 0, left fade at max scroll, no document overflow) |
| R-8 | All forms | Every `<input>` and `<select>` element is full-width or at least 44px touch target | `[x]` Forms use shared `.input` primitive (`w-full rounded-md ... px-3 py-2` from globals.css); selects within `<label>` wrappers — covered by NEW-A11Y-005 + AUD-UX-019/020/039 |
| R-9 | `src/components/CardDensitySlider.tsx` | Slider is reachable and usable at 375px | `[x]` Slider trigger is a `tap-target` icon button with `aria-label` + `aria-valuenow`; popover positioned via PortalPopover; covered by NEW-A11Y-028 |
| R-10 | Navigation | Mobile nav (md:hidden menu if any) — all routes reachable | `[x]` `MoreNavMenu.tsx:176` Menu button is `md:hidden`; `MobileSheet` (line 347) duplicates every nav entry; covered by RESP-001 |

---

## C — i18n / Translations

**Goal:** All three locales (FR, EN, JA) have identical key coverage. No hardcoded English strings in components. Plurals work correctly.

| # | File | Finding | Status |
|---|------|---------|--------|
| I-1 | `src/lib/i18n/dictionaries.ts` | Run `dictionaries-parity.test.ts` — verify still 0 key mismatches | `[x]` `tests/dictionaries-parity.test.ts` passes (FR/EN/JA key parity enforced) |
| I-2 | All components | Run `i18n-no-hardcoded-labels.test.ts` — verify still 0 violations | `[x]` `tests/i18n-no-hardcoded-labels.test.ts` passes (0 violations) |
| I-3 | `src/lib/i18n/dictionaries.ts` | Check for missing keys for new features added since last audit (ScrollFadeRight has no i18n text; verify no other new component does) | `[x]` `<ScrollFadeRight>` exposes no user-visible copy; parity test would catch any new untranslated key |
| I-4 | All pages | Check that date/number formatting uses `fmtNum` and locale-aware formatters, not `toString()` | `[x]` `grep -rn "\.toLocaleString()"` returns zero hits in src/**/*.{ts,tsx}; pinned by I18NA-009..014 + NEW-I18N-001..011 |
| I-5 | `src/components/ActivityTimeline.tsx` | Date inputs for activity log — locale-aware labels | `[x]` ActivityTimeline reads `useLocale()`; pinned by I18NA-010..012 |
| I-6 | All `aria-label` attributes | Verify ARIA labels use translated strings from dict, not hardcoded English | `[x]` `grep -rn 'aria-label="[A-Z]'` returns zero hits — every aria-label uses a template literal / dict reference; covered by I18NA-002/003 + COMP-017 |
| I-7 | Error messages | All catch-branch error messages shown to users should be translated | `[x]` Mutating clients use `readApiError(r, t.common.error)` — fallback message is the localized `t.common.error`; pinned by COMP-008 |

---

## D — Accessibility

**Goal:** All interactive elements have correct ARIA roles, labels, and keyboard navigation. Focus trap on modals. No `div` acting as buttons.

| # | File | Finding | Status |
|---|------|---------|--------|
| A-1 | All dialogs | `role="dialog"`, `aria-modal="true"`, `aria-labelledby` pointing to title | `[x]` `Dialog.tsx:137-139` enforces the triple; `ConfirmDialog.tsx:210-212` matches (with `role="alertdialog"` when destructive) — covered by NEW-A11Y-029 |
| A-2 | All icon-only buttons | `aria-label` or `title` attribute present | `[x]` Python AST scan (NEW-A11Y-015) over all 478 `<button>` elements found zero icon-only buttons missing `aria-label`/`aria-labelledby` |
| A-3 | All forms | Every `<input>` has an associated `<label>` via `htmlFor` / `id` | `[x]` `<input>` elements are wrapped in `<label>` (implicit association) or carry `aria-label`/`aria-labelledby` — covered by NEW-A11Y-005 + NEW-A11Y-017 |
| A-4 | `src/components/ConfirmDialog.tsx` | Focus trap and restore on close | `[x]` `Dialog.tsx:57-70` captures previously-focused element; line 119 restores on close; `useDialogA11y` (line 177) provides same contract for inline dialogs — covered by NEW-A11Y-007 |
| A-5 | All `<summary>` elements | Screen-reader accessible expand/collapse announcements | `[x]` `<CollapsibleSummary>` renders `group-open:rotate-90` chevron icon; native `<details>`/`<summary>` semantics carry implicit expand/collapse state — covered by AUD-UX-031 |
| A-6 | `src/components/VnCard.tsx` | Cover image `alt` text is meaningful (VN title), not empty | `[x]` `VnCard.tsx:311` `alt={data.title}` — covered by NEW-A11Y-008 |
| A-7 | `src/components/ScrollFadeRight.tsx` | New component — fade overlay has `aria-hidden` ✓; verify no focus issues | `[x]` |
| A-8 | `src/components/SpoilerChip.tsx` | Spoiler-hidden chips — announce state to screen readers | `[x]` SpoilerChip carries `aria-expanded` (line 131), `aria-label={t.spoiler.revealOne/hideOne}` (lines 133, 180), and `aria-pressed` for revealed state — covered by R5-043 |
| A-9 | All tables | `<table>` elements have `<caption>` or `aria-label`; `<th>` has `scope` | `[x]` 3 `<table>` instances (SchemaLocalSection, producers, data); all carry `aria-label`; SchemaLocalSection rows use `<th scope="col">` — covered by NEW-A11Y-011 |
| A-10 | `src/app/shelf/page.tsx` | Drag-and-drop shelf — keyboard accessible alternative? | `[x]` `SortableGrid.tsx:63` wires `KeyboardSensor` with `sortableKeyboardCoordinates`; `ShelfLayoutEditor.tsx:237` mirrors the same; aria-rowcount/aria-colcount set on virtual grid |

---

## E — Feature Integration

**Goal:** Every field that appears on one surface must appear consistently across all relevant surfaces (detail page, library card, filter, sort, chip).

| # | Field/Feature | Check | Status |
|---|---------------|-------|--------|
| F-1 | Density slider | All pages with VN card grids have `DensityScopeProvider` + `CardDensitySlider` | `[x]` 20 surfaces mount both providers (library, wishlist, search, recommendations, top-ranked, upcoming, dumped, egs, staff/[id], producer/[id], character/[id], series/[id], lists/[id], shelf, tags/[id], etc.) — covered by CLAUDE.md "Card density — scoped per page" |
| F-2 | Playtime | Displayed on VN detail, library card chip, VN list entry — all three? | `[x]` VnCard renders playtime breakdown chip (line 360-365 with `t.playtime.mine/vndb/egs`); VN detail uses `PlaytimeCompare` panel — pinned by CLAUDE.md "Playtime model" |
| F-3 | Rating | Score section on detail, VN card chip, library sort — all consistent? | `[x]` VN detail uses `<ScoreSection>`; VnCard chips render rating; library sort accepts `rating`/`average`/`user_rating` keys via `VALID_SORTS` |
| F-4 | Physical location | `group=place` fixed; verify `?place=X` filter and `?group=place` both use `collection_place_index` | `[x]` `db.ts` `collection_place_index` materializes both `collection.physical_location` and `owned_release.physical_location`; `listPlacesForVnsMany` batch-reads it — covered by DB-1 |
| F-5 | Series link | VN detail series-suggest, series page, series breadcrumb — coherent? | `[x]` `SeriesAutoSuggest` on VN detail; `/series/[id]` uses versioned layout; series breadcrumb on `/vn/[id]` reads from `series_vn` — covered by R5-013/014 |
| F-6 | EGS integration | EGS panel, EGS rich details, EGS sync job — all surfaces show EGS data consistently | `[x]` `EgsPanel`, `EgsRichDetails`, `EgsSyncBlock` all hydrate from `egs_game` table; source-pref resolver applies VNDB/EGS choice; pinned by R5-084/085 and the AUD-DEAD-001 vndb-sync.ts cleanup |
| F-7 | Download/sync status | DownloadStatusBar shows all job kinds; no orphan jobs; finish correctly | `[x]` `download-status.ts:18` defines `JobKind` union; `DownloadStatusBar` subscribes to SSE stream; pinned by NEW-A11Y-028 (progressbar ARIA) |
| F-8 | Reading queue | Queue entries appear on VN detail; queue badge on library card; queue filter works | `[x]` |
| F-9 | Saved filters | Saved filters persist; load correctly; rename/delete work; list page shows them | `[x]` `saved_filter` table + `/api/saved-filters` PATCH/DELETE; `<SavedFilters>` shows chips above the library filters — covered by AUD-DB-002 (idx_saved_filter_position) and the F-12 picker code |
| F-10 | Shelf layout | Shelf drag-and-drop; resize; rename; slots/displays CRUD — all endpoints auth-gated (verified T-2) | `[x]` Auth gates on `/api/shelves/*` (SECA-006/007/008); placement via `placeShelfItem` atomic transaction (AUD-DB-007); evicted-on-resize semantics (CLAUDE.md "Shelf layout") |
| F-11 | Tag overlap | Tag co-occurrence section on VN detail renders for in-collection VNs only; no render for non-collection | `[x]` `vn/[id]/page.tsx:968` `if (inCol) { sectionNodes['tag-overlap'] = <TagCoOccurrence ... /> }` — gated on in-collection presence |
| F-12 | Custom sort | Library custom sort drag works; `?sort=custom` persists; density slider on SortableGrid works | `[x]` `LibraryClient.tsx:1348` renders `<SortableGrid>` when `sort=custom`; `KeyboardSensor` + `coordinateGetter` wired; density slider CSS var consumed by the same grid container |

---

## G — Security

**Goal:** Every mutating endpoint has the auth gate. No SSRF. No PHI leakage. No client-side secret exposure.

| # | File | Finding | Status |
|---|------|---------|--------|
| S-1 | `src/app/api/**` | Audit ALL POST/PATCH/DELETE handlers for `requireLocalhostOrToken` (added DELETE erogamescape in prev session) | `[x]` |
| S-2 | `src/lib/vndb-cache.ts` | SSRF allowlist covers all external fetch targets | `[x]` `vndb-cache.ts:14` imports `assertNoPrivateIpRebind` + `isAllowedHttpTarget`; line 186 rejects non-allowlisted URLs; line 200 resolves DNS before fetch — covered by AUD-SEC-014/015/016 |
| S-3 | `src/lib/safe-href.ts` | All external links run through `safeHref` — verify no new `href={...}` bypasses | `[x]` `<VndbMarkup>` rewrites every external URL through `normalizeVndbHref` + scheme allowlist (CLAUDE.md "VNDB BBCode link normalization"); explicit `safeHref` consumers in VnDetailActionsBar/ReleasesSection |
| S-4 | API routes | No route echoes back raw DB errors to the client (stack traces, SQL) | `[x]` |
| S-5 | `src/app/api/vn/[id]/erogamescape/route.ts` | POST, DELETE both auth-gated — verify GET is intentionally public | `[x]` POST line 36, DELETE line 80 both call `requireLocalhostOrToken`; GET is intentionally public for single-user self-hosted read access (CLAUDE.md "Single-user threat model") |
| S-6 | Settings routes | Settings read/write APIs — public read OK; write must be auth-gated | `[x]` GET line 170 and PATCH line 233 both call `requireLocalhostOrToken` — settings hold the VNDB token, Steam key, backup URL; GET is gated because the masked previews still confirm credential existence |

---

## H — Testing

**Goal:** Coverage gaps. Tests for all new components. No test files with empty suites.

| # | File | Finding | Status |
|---|------|---------|--------|
| T-1 | `tests/` | Add source-lint test for `ScrollFadeRight` — verify `relative overflow-x-auto` and `aria-hidden` on fade | `[x]` |
| T-2 | All new API routes since last audit | Auth-gate tests for any route added after `audit-2025-05-22.md` | `[x]` |
| T-3 | `tests/library-spacing.test.ts` | Updated to check `ScrollFadeRight` instead of `overflow-x-auto` — valid | `[x]` |
| T-4 | `tests/va-timeline.test.ts` (new) | Source-lint: `ScrollFadeRight` used; `role="img"` present; `aria-label` set | `[x]` |
| T-5 | `tests/activity-heatmap.test.ts` (new) | Source-lint: `ScrollFadeRight` used | `[x]` |

---

## I — Documentation

**Goal:** CLAUDE.md and in-code JSDoc are complete. No exported symbol without docs.

| # | File | Finding | Status |
|---|------|---------|--------|
| D-1 | `src/components/ScrollFadeRight.tsx` | JSDoc added ✓ (new file has module-level comment) | `[x]` |
| D-2 | `CLAUDE.md` | Verify new ScrollFadeRight pattern is mentioned in "scroll containers" guidance | `[x]` |
| D-3 | Any new utility function added since audit | Verify has JSDoc | `[~]` New utility files (`lib/source-resolve.ts`, `lib/cover-banner-events.ts`, `lib/spoiler-reveal.ts`, `lib/drag-id.ts`, `lib/time-ago.ts`, etc.) all carry module-level docstrings; complex helpers carry per-function JSDoc — verified ad-hoc per CLAUDE.md "Shared hooks" / "Shared `CardData` projection" / etc. |
| D-4 | `docs/` | This todo file — update status as work completes | `[x]` Reconciliation pass 2026-05-27: every open row mapped to its shipped commit/PR or pointed at the canonical R5/AUD-* coverage row |

---

## NOTES

- Test count baseline: **1643 passing / 162 files** (post audit-2025-05-22 commit)
- Test count after 2025-05-22 session: **1664 passing / 166 files**
- Verification pass (2026-05-27): **2231 passing / 218 files**; remaining open rows in this list were already shipped in subsequent rounds (R5, round 4, AUD-*) and are now marked `[x]` with the relevant pointer/test/file evidence
- Branch: `main`
- Package manager: `yarn` only
- All grids use `var(--card-density-px, 220px)` via `DensityScopeProvider` — confirmed
- `scroll-fade-right` CSS class kept for tables/editors that always overflow; variable-length surfaces now use `ScrollFadeRight` component
