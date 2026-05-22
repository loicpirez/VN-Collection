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
| UX-2 | All pages | Audit every page for missing loading skeletons on async sections | `[ ]` |
| UX-3 | All pages | Audit every empty state: should show informative text AFTER fetch resolves with 0 items, not immediately | `[ ]` |
| UX-4 | `src/components/VnCard.tsx` | Verify cover image aspect-ratio is always 2:3 — no broken stretching | `[ ]` |
| UX-5 | All detail pages | Truncated text fields should have `title` attribute for hover-reveal | `[x]` |
| UX-6 | `src/app/vn/[id]/page.tsx` | Check that all section nodes render coherently with no orphan headers or duplicate labels | `[ ]` |
| UX-7 | All pages | Error states (network failures in client components) should show user-friendly messages, not raw error objects | `[ ]` |
| UX-8 | `src/components/ActivityTimeline.tsx` | ScrollFadeRight migration left .scroll-fade-right on producers/compare tables — verify they still render correctly | `[ ]` |
| UX-9 | All modals/dialogs | Check that all `ConfirmDialog` instances have proper destruction prevention (e.g. irreversible action confirmation) | `[ ]` |
| UX-10 | `src/app/page.tsx` (home) | Verify home page sections all have consistent card/section padding and margin | `[ ]` |

---

## B — Responsive / Mobile

**Goal:** Every feature must be reachable on a 375px-wide viewport without horizontal scroll on the page body. No `hidden sm:` stripping functionality.

| # | File | Finding | Status |
|---|------|---------|--------|
| R-1 | All pages | Search for `hidden sm:` and `hidden md:` that remove functional elements (labels, buttons, controls) | `[x]` |
| R-2 | `src/components/VnDetailActionsBar.tsx` | Action bar on narrow viewports — verify all actions accessible | `[ ]` |
| R-3 | `src/app/staff/[id]/page.tsx` | Staff header chip row wraps cleanly at 375px | `[ ]` |
| R-4 | `src/app/vn/[id]/page.tsx` | VN detail info grid (`grid-cols-[260px_1fr]`) — stacks at mobile | `[ ]` |
| R-5 | `src/components/LibraryClient.tsx` | Filter panel controls are accessible on mobile | `[ ]` |
| R-6 | `src/app/compare/page.tsx` | Horizontal comparison table — need scroll indicator or alternative layout on mobile | `[ ]` |
| R-7 | `src/components/ShelfScrollFrame.tsx` | Shelf view on mobile — left/right fades work correctly | `[ ]` |
| R-8 | All forms | Every `<input>` and `<select>` element is full-width or at least 44px touch target | `[ ]` |
| R-9 | `src/components/CardDensitySlider.tsx` | Slider is reachable and usable at 375px | `[ ]` |
| R-10 | Navigation | Mobile nav (md:hidden menu if any) — all routes reachable | `[ ]` |

---

## C — i18n / Translations

**Goal:** All three locales (FR, EN, JA) have identical key coverage. No hardcoded English strings in components. Plurals work correctly.

| # | File | Finding | Status |
|---|------|---------|--------|
| I-1 | `src/lib/i18n/dictionaries.ts` | Run `dictionaries-parity.test.ts` — verify still 0 key mismatches | `[ ]` |
| I-2 | All components | Run `i18n-no-hardcoded-labels.test.ts` — verify still 0 violations | `[ ]` |
| I-3 | `src/lib/i18n/dictionaries.ts` | Check for missing keys for new features added since last audit (ScrollFadeRight has no i18n text; verify no other new component does) | `[ ]` |
| I-4 | All pages | Check that date/number formatting uses `fmtNum` and locale-aware formatters, not `toString()` | `[ ]` |
| I-5 | `src/components/ActivityTimeline.tsx` | Date inputs for activity log — locale-aware labels | `[ ]` |
| I-6 | All `aria-label` attributes | Verify ARIA labels use translated strings from dict, not hardcoded English | `[~]` |
| I-7 | Error messages | All catch-branch error messages shown to users should be translated | `[ ]` |

---

## D — Accessibility

**Goal:** All interactive elements have correct ARIA roles, labels, and keyboard navigation. Focus trap on modals. No `div` acting as buttons.

| # | File | Finding | Status |
|---|------|---------|--------|
| A-1 | All dialogs | `role="dialog"`, `aria-modal="true"`, `aria-labelledby` pointing to title | `[ ]` |
| A-2 | All icon-only buttons | `aria-label` or `title` attribute present | `[~]` |
| A-3 | All forms | Every `<input>` has an associated `<label>` via `htmlFor` / `id` | `[~]` |
| A-4 | `src/components/ConfirmDialog.tsx` | Focus trap and restore on close | `[ ]` |
| A-5 | All `<summary>` elements | Screen-reader accessible expand/collapse announcements | `[ ]` |
| A-6 | `src/components/VnCard.tsx` | Cover image `alt` text is meaningful (VN title), not empty | `[ ]` |
| A-7 | `src/components/ScrollFadeRight.tsx` | New component — fade overlay has `aria-hidden` ✓; verify no focus issues | `[x]` |
| A-8 | `src/components/SpoilerChip.tsx` | Spoiler-hidden chips — announce state to screen readers | `[~]` |
| A-9 | All tables | `<table>` elements have `<caption>` or `aria-label`; `<th>` has `scope` | `[~]` |
| A-10 | `src/app/shelf/page.tsx` | Drag-and-drop shelf — keyboard accessible alternative? | `[ ]` |

---

## E — Feature Integration

**Goal:** Every field that appears on one surface must appear consistently across all relevant surfaces (detail page, library card, filter, sort, chip).

| # | Field/Feature | Check | Status |
|---|---------------|-------|--------|
| F-1 | Density slider | All pages with VN card grids have `DensityScopeProvider` + `CardDensitySlider` | `[ ]` |
| F-2 | Playtime | Displayed on VN detail, library card chip, VN list entry — all three? | `[ ]` |
| F-3 | Rating | Score section on detail, VN card chip, library sort — all consistent? | `[ ]` |
| F-4 | Physical location | `group=place` fixed; verify `?place=X` filter and `?group=place` both use `collection_place_index` | `[ ]` |
| F-5 | Series link | VN detail series-suggest, series page, series breadcrumb — coherent? | `[ ]` |
| F-6 | EGS integration | EGS panel, EGS rich details, EGS sync job — all surfaces show EGS data consistently | `[ ]` |
| F-7 | Download/sync status | DownloadStatusBar shows all job kinds; no orphan jobs; finish correctly | `[ ]` |
| F-8 | Reading queue | Queue entries appear on VN detail; queue badge on library card; queue filter works | `[x]` |
| F-9 | Saved filters | Saved filters persist; load correctly; rename/delete work; list page shows them | `[ ]` |
| F-10 | Shelf layout | Shelf drag-and-drop; resize; rename; slots/displays CRUD — all endpoints auth-gated (verified T-2) | `[ ]` |
| F-11 | Tag overlap | Tag co-occurrence section on VN detail renders for in-collection VNs only; no render for non-collection | `[ ]` |
| F-12 | Custom sort | Library custom sort drag works; `?sort=custom` persists; density slider on SortableGrid works | `[ ]` |

---

## G — Security

**Goal:** Every mutating endpoint has the auth gate. No SSRF. No PHI leakage. No client-side secret exposure.

| # | File | Finding | Status |
|---|------|---------|--------|
| S-1 | `src/app/api/**` | Audit ALL POST/PATCH/DELETE handlers for `requireLocalhostOrToken` (added DELETE erogamescape in prev session) | `[x]` |
| S-2 | `src/lib/vndb-cache.ts` | SSRF allowlist covers all external fetch targets | `[ ]` |
| S-3 | `src/lib/safe-href.ts` | All external links run through `safeHref` — verify no new `href={...}` bypasses | `[ ]` |
| S-4 | API routes | No route echoes back raw DB errors to the client (stack traces, SQL) | `[x]` |
| S-5 | `src/app/api/vn/[id]/erogamescape/route.ts` | POST, DELETE both auth-gated — verify GET is intentionally public | `[ ]` |
| S-6 | Settings routes | Settings read/write APIs — public read OK; write must be auth-gated | `[ ]` |

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
| D-3 | Any new utility function added since audit | Verify has JSDoc | `[ ]` |
| D-4 | `docs/` | This todo file — update status as work completes | `[~]` |

---

## NOTES

- Test count baseline: **1643 passing / 162 files** (post audit-2025-05-22 commit)
- Test count after 2025-05-22 session: **1664 passing / 166 files**
- Branch: `main`
- Package manager: `yarn` only
- All grids use `var(--card-density-px, 220px)` via `DensityScopeProvider` — confirmed
- `scroll-fade-right` CSS class kept for tables/editors that always overflow; variable-length surfaces now use `ScrollFadeRight` component
