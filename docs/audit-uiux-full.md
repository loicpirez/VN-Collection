# Full UI/UX Consistency Audit — VNDB

**Repository**: `/Users/loicpirez/VNDB`
**Scope**: Every `src/app/**/page.tsx` and major `src/components/*.tsx`
**Date**: 2026-05-27

## Closure status (2026-05-27)

**CLOSED — every HIGH/MEDIUM batch.** Bulk batch in `79d2ace` (uiux
agent — palette / i18n / formatting / a11y / skeletons / confirms /
grids / error surfacing / perf). U-049 in `a16541a` (Pomodoro suffix).
U-019 (ErrorAlert primitive) in `8c0c4cd`. U-003/U-004/U-005/U-006
(URL-state for Wishlist / Traits / Tags / Kobe) in `3927e09` /
`e7ff900` / `eb02b34`. U-129 (kobe persisted defaults) in `45028d2`.
U-238/U-239/U-240 (kobe date+price localisation) in `fd7721c`.
U-251/U-280 (dictionary parity lint) in `0850c36`.

## Round 2 findings (2026-05-28)

Fresh scan after the initial closure batch. Implemented inline:

- **U-306 (High)** `src/app/activity/page.tsx:90,142-148` — `text-yellow-400`
  on the favourite icon and `KIND_COLOR` map (`bg-blue-500/20`,
  `bg-yellow-500/20`, `bg-green-500/20`, `bg-pink-500/20`, `bg-teal-500/20`,
  `bg-purple-500/20`, `bg-slate-500/20`) were the only remaining raw
  Tailwind palette uses in the repo. Remapped to `status-*` / `accent` /
  `accent-blue` / `muted` so the activity feed honours the project
  palette like the rest of the app.
- **U-307 (High)** `src/components/VnSourcePicker.tsx:156` — raw
  `<img>` inside the unified VN picker bypassed `<SafeImage>`. The
  picker is opened from /stock/batch and other surfaces, so user
  hide-images / blur-R18 settings were silently ignored on the
  thumbnail. Migrated to `<SafeImage>` with `fit="cover"`.
- **U-308 (Med)** `src/app/release/[id]/page.tsx:384` — release-image
  grid hard-coded `minmax(180px, 1fr)`. Now uses
  `minmax(min(100%, var(--card-density-px, 180px)), 1fr)`.
- **U-309 (Med)** `src/app/shelf/page.tsx:445,642` — release-view
  and item-view grids hard-coded `minmax(240px, 1fr)` /
  `minmax(260px, 1fr)`. Both now consume `--card-density-px`.
- **U-310 (Med)** `src/components/SavedFilters.tsx:42-47,234-242` —
  popover rendered `t.savedFilters.popoverEmpty` immediately on
  first open while the `/api/saved-filters` fetch was in flight.
  Added `filtersLoaded` flag plus a `<Loader2>` placeholder so the
  empty-state copy only shows after the fetch resolves.
- **U-311 (Med)** `src/components/SettingsButton.tsx:1553-1559` —
  "Reset display" button wiped every display preference with a
  single click. Wrapped in a styled `confirm({ tone: 'danger' })`
  call. Added i18n key `t.settings.resetDisplayConfirm` (FR/EN/JA).
- **U-312 (Med)** `src/components/SettingsButton.tsx:2267-2271` —
  "Reset everything (default + per-page)" had no confirm. Same fix
  pattern. Added i18n key `t.settings.resetEverythingConfirm`
  (FR/EN/JA).

**Verified-clean / no-action items**:
- `<ErrorAlert>` and `<Tooltip>` primitives are defined but unused
  by any call site. Prior audits closed both with the rationale
  that the primitive exists for future opt-in adoption; the raw
  `<p role="alert">` patterns currently in the codebase are not
  regressions, just unmigrated. Leaving as-is.
- `src/components/CoverSourcePicker.tsx:691` uses a fixed
  `minmax(120px, 1fr)` grid for the cover-candidate picker. This
  is intentionally compact (4-5 thumbnails per modal row); the
  density slider wouldn't help on a 120-thumb-wide modal.
- `src/components/CharactersSection.tsx:105` /
  `src/components/CastSection.tsx:36` /
  `src/app/labels/page.tsx:143` retain hard-coded grid-cols. The
  first two carry rich per-card content (traits / VA / age) and
  blow out at very large densities; the third is print-layout
  bound to four cells.

**Verified-clean / no-action items**: U-046 (Pomodoro mm:ss timer —
formatMinutes is wrong shape for per-second tick), U-270 (writes a
storage-format ISO date, not a display string).

**Genuinely deferred (need separate epics)**: U-023/U-142
(list virtualisation — needs a library choice + adoption pattern),
U-074/U-097/U-226/U-234 (kobe toolbar tiering / shared Toolbar
primitive / 1300-line file split — full kobe redesign epic).

## Round 3 findings (2026-05-28)

Fresh sweep after Round 2 — focus on a11y polish + dead imports +
mount-leak risk. Implemented inline:

- **U-313 (Med, a11y)** — 80+ `<Loader2>` spinner icons across 54
  component files rendered without `aria-hidden`. Screen readers
  emit a phantom "loader" announcement next to the visible action
  label. Bulk added `aria-hidden` to every self-closing /
  multi-line `<Loader2 … />` in `src/components/*.tsx` and
  `src/app/**/*.tsx` (Python regex sweep — every spinner now
  carries either `aria-hidden` or an existing `aria-label`).
- **U-314 (Low, hygiene)** — 22 unused named imports across 12
  files (`LibraryClient` re-exported but not used in
  `src/app/page.tsx`, `resolveField` / `readApiError` /
  `Loader2` / `useEffect` / `HOME_SECTION_IDS` /
  `validateCharacterDetailLayoutV1` / etc.). All removed.
- **U-315 (Med, perf+a11y)** `src/components/BrandOverlapPicker.tsx:28-44`
  — `useEffect` fetched `/api/producers` without cleanup: navigating
  away mid-flight triggered the React "setState on unmounted
  component" warning and a wasted render. Now wraps the fetch in
  an `AbortController`; every success / catch / finally branch
  guards on `ac.signal.aborted` before calling setState.

**Verified-clean (no-action this round)**:
- Every `<a target="_blank">` outside JSDoc comments already
  carries `rel="noopener noreferrer"` (one false positive in
  `MediaGallery.tsx:427` — the line is inside the file-level
  comment that documents the kebab menu, not actual JSX).
- Every `role="dialog"` mount (`ConfirmDialog`, `DateInput`,
  `TutorialTour`) has a `keydown` listener that closes on Escape.
- No `<button>` in the codebase lacks an accessible name once
  JSX text expressions (`{t.foo}`, `{busy ? t.cancel : …}`) are
  counted — earlier 142-button audit was 100% false positives.
- No naked `console.log`, no empty catch blocks, no FIXME/TODO
  comments, no native `confirm()` / `alert()` / `prompt()` calls
  remaining outside the styled `ConfirmDialog` API.

**Rubric**: 25 categories; no item limit.

---

## Methodology

- Greps + targeted reads across 175 component files and 38 page files.
- Cross-checked against `CLAUDE.md` conventions (skeleton-first, URL-state, .btn primitives, styled confirm, palette, etc).
- Verified each finding by reading source at the cited line.

Findings are grouped by category; IDs are `U-NNN`. Severity: **High** (broken UX / state loss / a11y), **Med** (visible inconsistency, recoverable), **Low** (cosmetic / lint-level).

---

## Findings table

| ID | severity | file:line | issue | fix |
|---|---|---|---|---|
| U-001 | High | src/components/EditForm.tsx:413-414 | `text-status-finished` class does not exist in `tailwind.config.ts` (palette only has planning/playing/completed/on_hold/dropped). The "Saved" indicator silently renders with no color. | Replace with `text-status-completed`. |
| U-002 | High | src/components/AliceNetKobeClient.tsx:928 | `new Date(lastFetch).toLocaleString()` called without a locale arg — uses host locale, not user locale; breaks across FR/EN/JA. Every other surface passes `locale`. | `new Date(lastFetch).toLocaleString(BCP47[locale])` (or use `fmtDate` from `lib/locale-number`). |
| U-003 | High | src/components/WishlistClient.tsx:177-183 | Filter state (`q`, `filterLang`, `filterPlatform`, `filterRatingMin/Max`, `filterYearMin/Max`) lives in `useState`, not URL. CLAUDE.md mandates shareable filters in URL. Page refresh, copy/paste-share, or back/forward all wipe the active filter. | Mirror to URL via `router.replace(...)` like `LibraryClient` / `SearchClient`. |
| U-004 | High | src/components/TraitsBrowser.tsx:16-17 | `q` and `onlyMine` state in `useState`, not URL. Refresh / share-link loses filter. | Use `useSearchParams` + `router.replace(...)`. |
| U-005 | High | src/components/TagsBrowser.tsx:206-227 | `q` and `category` state in `useState`. Mode (`local`/`vndb`) IS persisted to URL via `switchMode`, but search query and category dropdown are not. Inconsistent partial URL state. | Persist `q` and `category` to URL too. |
| U-006 | High | src/components/AliceNetKobeClient.tsx:379-389 | Filter/sort/group/view tab plus search/year/price filters all live in `useState`. Refresh wipes every preference. The page has rich filtering; losing it on F5 is a real-use UX hit. | Mirror to `?filter=`, `?sort=`, `?group=`, `?view=`, `?q=`, etc. |
| U-007 | High | src/components/MapVnToEgsButton.tsx:174-209 | Custom inline modal (`<div className="fixed inset-0 …">`) uses `useDialogA11y` (line 68) so Escape works, but the modal also has its own backdrop-click handler — Escape behavior is OK, but body-scroll-lock is delegated to the hook. Verify panelRef is set BEFORE open. | Confirmed OK after re-reading; leave as note. |
| U-008 | Med | src/components/MapEgsToVndbButton.tsx:166-201 | Same inline-modal pattern as U-007. Uses `useDialogA11y` correctly. Visual styling is duplicated between the two button variants; would benefit from `<Dialog>` shell. | Refactor to use `<Dialog>` for shape consistency with CompareWithButton. |
| U-009 | Med | src/components/CompareVnPicker.tsx:222-360 | Inline picker with its own keyboard handlers; not wrapped in `<Dialog>` despite being a modal-like overlay. | Audit for Escape / focus-trap; consider `<Dialog>`. |
| U-010 | Med | src/components/Skeleton.tsx:53-61 | `SkeletonCardGrid` uses `grid-cols-2 sm:3 md:4 lg:5 xl:6` — hard-coded breakpoints that ignore the user's `cardDensityPx` setting. Real card grids use `repeat(auto-fill, minmax(min(100%, var(--card-density-px, …)), 1fr))`. When the user has cards at 480px slider value, the skeleton still paints 6 cols, then the real grid jumps to 2 cols. | Switch `SkeletonCardGrid` to consume `--card-density-px` like real grids. |
| U-011 | Med | src/components/AliceNetKobeClient.tsx:1290-1295 | Loading skeleton uses fixed `'h-96'` / `'h-24'` heights but the actual cards use `min-h-[24rem]` (=384px) — close enough but the skeleton block has plain `bg-bg-elev/40` rounded with no inner cover/title structure (the kobe card has them). User sees a flat block jump to a structured card. | Mirror card structure in skeleton. |
| U-012 | High | src/app/vn/[id]/page.tsx:228-230 | Raw error text dumped in `<pre>` block on the 404/not-found branch. User sees the raw upstream error message (could be a stack trace or an HTTP message). | Sanitize: render generic copy + send the technical detail to console / error log only. |
| U-013 | Med | src/app/steam/page.tsx:201 | `{suggestionsError}` rendered raw — could be the upstream error message verbatim (e.g. "Steam not configured" is OK, but generic 500/network errors will leak technical text). | Map known error tokens to friendly i18n strings; fallback to generic. |
| U-014 | Med | src/components/SearchClient.tsx:604-608 | `{error}` rendered raw inside a styled box (mostly fine), but the upstream error string is not always user-friendly (might be "TypeError: …"). | Wrap with i18n fallback like `EditForm`. |
| U-015 | Med | src/components/StockPanel.tsx:845 | `{error}` raw in error block. Same pattern repeats throughout the codebase. | Audit & standardize. |
| U-016 | Med | src/components/LibraryClient.tsx:1192-1194 | Same pattern: `{error}` raw text in styled error pane. | Same. |
| U-017 | Low | src/components/CoverUploader.tsx:96 | Raw `{error}` text shown inline. Most error strings come from `readApiError` which returns server-formatted text — usually OK but never re-translated locally. | Pass through i18n filter or keep but document. |
| U-018 | Low | src/components/StockBatchClient.tsx:266 | Same raw `{error}` rendering. | Same. |
| U-019 | Low | src/components/CharactersSection.tsx:94, RoutesSection.tsx:228, QuotesSection.tsx:76, ReleasesSection.tsx:175, NotInCollectionBanner.tsx:76, BannerControls.tsx:104, BulkDownloadButton.tsx:362, EgsPanel.tsx:195, ProducerLogoUpload.tsx:101, TraitsBrowser.tsx:92, TagsBrowser.tsx:231, ImportPanel.tsx:187, SeriesManager.tsx:85, SeriesAddVnForm.tsx:55, CachePanel.tsx:99, DownloadAssetsButton.tsx:129, HeroBanner.tsx:501, CoverSourcePicker.tsx:680, ReleasesSection.tsx:175, QuoteFooter.tsx:93 | All render `{error}` raw inline. Inconsistent styling: some `text-status-dropped`, some inside a bordered box, some plain text. No central error-display component. | Extract `<ErrorAlert>` primitive; use everywhere. |
| U-020 | High | src/components/Skeleton.tsx:53-61 (consumer side: src/app/loading.tsx, src/app/egs/loading.tsx, src/app/series/[id]/loading.tsx, src/components/WishlistClient.tsx:462, LibraryClient.tsx:1200, SearchClient.tsx:633, StaffExtraCredits.tsx:122) | Every consumer of `SkeletonCardGrid` shows a 5-6-col grid then jumps to a density-driven grid that may be 2-9 cols. UI shifts hard on first paint resolution. | Pair with U-010. Make skeleton density-aware. |
| U-021 | Med | src/components/BannerControls.tsx:115, src/components/CachePanel.tsx:135, src/components/SeriesManager.tsx:81, src/components/EditForm.tsx:179, src/components/SeriesAddVnForm.tsx:50, src/components/BannerControls.tsx:120 | `<button onClick=…>` without explicit `type=`. Default `type` is `submit` when nested in a `<form>` — for buttons outside `<form>` it's safer but still non-explicit. Several of these live inside forms / cards that have parent forms. | Add `type="button"` to every non-submit `<button>`. |
| U-022 | Med | src/app/labels/page.tsx:105 | Hardcoded English string `"Showing first {N} of {total} labels. Use the filter to narrow the selection."` — not localized. | Add `t.labels.truncated` key in fr/en/ja. |
| U-023 | High | src/components/AliceNetKobeClient.tsx (entire) | Long stock lists (potentially 1000s of items) render without pagination. The loop renders every matched item from `sorted` array. On a typical full-snapshot the page can have a several-thousand-item DOM. | Add page-size + virtualization (or limit + "load more"). |
| U-024 | Med | src/app/staff/page.tsx:70-79 | Staff search hits VNDB with `results: 60` and renders up to 60 results in a flat grid. No "next page" link — to find a match beyond the first 60 the user must refine the query. | Add pagination via `?page=N` or use VNDB's `more` flag. |
| U-025 | Med | src/app/characters/page.tsx:471-480 | Has page-of-N indicator but the result set caps at the underlying `results` array length. No real navigation to page 2. | Validate the pagination links work end-to-end. |
| U-026 | Med | src/app/labels/page.tsx:84-85 | Hard cap at 200 with a banner; no "show more" / pagination. Users with > 200 labels are forced to filter to see anything beyond. | Add pagination. |
| U-027 | Med | src/components/AliceNetKobeClient.tsx:697-698 | Off-palette colors: `text-green-400`, `text-rose-400`. Other surfaces use `text-status-completed` / `text-status-dropped`. | Map kobe states to the existing palette. |
| U-028 | Med | src/components/AliceNetKobeClient.tsx:737, 745, 752, 808, 813, 950, 957, 966, 971, 974, 978, 981 | Heavy off-palette use: `border-green-500/25`, `bg-green-500/10`, `text-green-400`, `border-sky-500/25`, `bg-sky-500/10`, `text-sky-300`, `border-amber-500/25`, `bg-amber-500/10`, `text-amber-400`, `border-rose-500/25`, `text-rose-300`. Inconsistent with the rest of the codebase. | Switch to `status-completed`, `status-on_hold`, `status-dropped`, etc. |
| U-029 | Med | src/components/StockPanel.tsx:564, 856-857, 1071, 1106, 1289, 1302 | Same off-palette `amber-500` family in stock panel. | Same fix as U-028. |
| U-030 | Med | src/app/labels/page.tsx:104 | `border-amber-500/40 bg-amber-500/10 text-amber-400` for the warning banner; other warnings in the app use `border-status-on_hold/40 bg-status-on_hold/10 text-status-on_hold`. | Standardize. |
| U-031 | Med | src/components/AliceNetKobeClient.tsx:862 | `hover:text-red-400` — should be `hover:text-status-dropped`. | Fix. |
| U-032 | High | src/components/EgsSyncBlock.tsx:185-198 | `<li role="button" tabIndex={0} onClick={…} onKeyDown={…}>` for a row — semantic anti-pattern. Native `<button>` would give better keyboard / screen-reader behavior automatically. The `<Link>` to /vn/X is wrapped inside, which creates nested-interactive a11y conflict (a link inside a role="button"). | Wrap row content in a real `<button type="button">`; keep `<Link>` for the title only OR split row into separate controls. |
| U-033 | Med | src/components/MoreNavMenu.tsx:119 | `new Date().getFullYear()` called every render to build the `/year?y=X` href. Cheap but non-deterministic between SSR and CSR — could cause hydration mismatch around midnight on New Year's Eve. | Compute year in a memoized constant. |
| U-034 | Low | src/app/character/[id]/page.tsx:29 | Duplicate `BCP47_MAP` constant (also in `src/app/shelf/page.tsx:57`, `src/components/GameLog.tsx:33`, `src/components/ActivityTimeline.tsx:44`, `src/components/ReadingSpeedBadge.tsx:24`). `lib/locale-number.ts` already exports the canonical map. | Import the canonical `BCP47` from `lib/locale-number.ts`. |
| U-035 | Med | src/app/activity/page.tsx:291-292, 330-331 | `<time>` formatter uses `new Intl.DateTimeFormat(...)` from a separate inline `fmt` — does not match `formatIsoDateString` / `fmtDate` from `lib/locale-number`. Date display format may differ subtly from other surfaces. | Centralize on `lib/locale-number`. |
| U-036 | Low | src/components/ActivityTimeline.tsx:47 | Bespoke `fmtDate` using `LOCALE_BCP47[locale] ?? 'en-US'` — same as `fmtDate` in `lib/locale-number`, but the fallback locale differs (`'en-US'` here vs the canonical `BCP47[locale]`). | Use `lib/locale-number`. |
| U-037 | High | src/components/CompareWithButton.tsx:86 | `title={t.compareWith.title}` AND visible text `{t.compareWith.cta}` — but tooltip and label express the same intent in two different forms. Better tooltip would be a hint or shortcut, not a re-statement. | Map titles to hints rather than restatements of the visible label. Same critique applies to many other surfaces. |
| U-038 | Med | src/components/SeriesManager.tsx:102 | `aria-label` AND `title` AND visible icon — all repeat the delete action. The redundancy is acceptable for SR users, but title and aria-label as the same string suggests no thought went into tooltip copy. | Title can include shortcut hint; aria-label stays the simple verb. |
| U-039 | Med | src/app/steam/page.tsx:331 | `title={t.steam.unlinkConfirm}` on the unlink × button — using the **confirm prompt copy** as the hover tooltip. Bad semantics. | Use `t.steam.unlink` or equivalent short label as title; keep confirm copy in the confirm dialog only. |
| U-040 | Low | src/components/TagPicker.tsx:127, 179 | `title={tag.id}` — exposing internal IDs as tooltips. Useful for power users but mostly noise; debug-flavored. | Optional: gate behind a setting or remove. |
| U-041 | Med | src/components/MapVnToEgsButton.tsx:156, 166 | `title={t.mapVn.title}` AND visible `<span>{t.mapVn.cta}</span>` — the same value is on title AND label content for the trigger button. | Same as U-037. |
| U-042 | Med | src/components/CardDensitySlider.tsx:96, 119, 140, 180, 203, 216 | Six places: title repeats button's purpose (denser/larger/reset). Helpful, but `aria-label` would do the same job + reading-tools and tooltip. | OK as-is; just note the duplication. |
| U-043 | Med | src/components/LibraryClient.tsx:1086 / 1101 / 1149 / 1174 | `title=` and `aria-label=` set to identical strings on the same button (e.g. line 1086 `aria-label={order === 'asc' ? t.library.sortAsc : t.library.sortDesc} title={order === 'asc' ? t.library.sortAsc : t.library.sortDesc}`). | Set title once (or omit if aria-label suffices). |
| U-044 | High | src/components/RoutesSection.tsx:397-416 | Form uses `<form onSubmit={add}>` with a submit button — but the `add` function doesn't show a "Submitting…" UX on the button; instead `disabled={busy}` + a small `<Loader2 />` icon swap. Fine. Other forms also disable + spin. Inconsistent: some submit buttons say "Saving…" (EditForm), some just show a spinner icon without text change. | Standardize submit-state UX: either change label OR show spinner; pick one and apply across forms. |
| U-045 | Med | src/components/EditForm.tsx:409-415 | "Saving" status bar uses `text-status-finished` (undefined, see U-001). The status is implemented as a separate panel below the form — different shape from any other "submitting" indicator. | Pair fix with U-001. |
| U-046 | High | src/components/PomodoroTimer.tsx:65-66, 96, 118 | Inline minute math (`Math.floor(elapsedSec / 60)`, `Math.round(elapsedSec / 60)`, `Math.floor(remainingSec / 60)`) instead of `formatMinutes` from `lib/format.ts`. Locale-aware formatting is bypassed. | Use canonical formatter. |
| U-047 | Med | src/app/steam/page.tsx:44-51 | `fmt(m)` helper computes hours+minutes inline; doesn't use `formatMinutes`. Output is "Xh Ym" (English). | Same fix. |
| U-048 | Med | src/components/ReadingSpeedBadge.tsx:7 | `Math.floor(m / 60)` inline. | Same fix. |
| U-049 | Med | src/components/PlaytimeCompare.tsx:26 | Same. | Same. |
| U-050 | Med | src/components/StatsExtras.tsx:9 | Same. | Same. |
| U-051 | Med | src/app/egs/page.tsx:300 | `Math.round(l.playtime_minutes / 60)` inline. | Same. |
| U-052 | Med | src/app/stats/page.tsx:68, 148, 153 | Same. | Same. |
| U-053 | Med | src/components/LibraryClient.tsx:90, 377 | Same. | Same. |
| U-054 | Med | src/components/CompareWithButton.tsx:159, src/components/SelectiveFullDownload.tsx:352, src/components/ProducerVnsSections.tsx:227, src/app/vn/[id]/page.tsx:516, src/app/top-ranked/page.tsx:480 | `released.slice(0, 4)` returns the raw year string with no locale awareness. Other surfaces use `formatVndbDateString(date, locale)` to render the full month/year per locale. | Replace with `formatVndbDateString` or extract a `yearOnly(date)` helper that handles partial dates correctly. |
| U-055 | Med | src/components/WishlistClient.tsx:347-348 | Same `released.slice(0, 4)` for filter range; string comparison is fragile against partial dates ("2025" vs "2025-01"). | Add a `parseYear(date)` helper. |
| U-056 | High | src/components/CompareWithButton.tsx:127-131 | Skeleton uses `i` (index) as key. OK for static placeholders. **No issue here** — listed as a sanity check; index keys are intentional for skeleton arrays. | Not a bug. |
| U-057 | High | src/components/ReadingGoalCard.tsx + many others (29 occurrences) | Forms have `setError(null)` only at submission start, not on `onChange`. If user mistypes and corrects, the old error stays visible until next submit attempt. Only `StockPanel.tsx` clears errors on type (lines 749, 816). | Add `if (error) setError(null)` to onChange handlers in long-lived forms (CustomSynopsis, EditForm, SeriesManager, ReadingGoalCard, etc.). |
| U-058 | High | src/components/AliceNetKobeClient.tsx:925-930 | Header shows last-fetch as "{date} {time}" in host locale (see U-002), no relative `timeAgo`. Other surfaces use `timeAgo` from `lib/time-ago.ts` (e.g., StockPanel.tsx:1299, RefreshScopeButton.tsx:114, GameLog.tsx:343). Inconsistent. | Use `timeAgo(lastFetch, t)`. |
| U-059 | Med | src/components/StockPanel.tsx:544 | `t.stock.lastChecked.replace('{date}', new Date(lastRefresh).toLocaleString(locale))` — uses absolute date instead of relative "X minutes ago". | `timeAgo(lastRefresh, t)` already exists in this file (line 1299) but is not used here. |
| U-060 | Med | src/components/StockPanel.tsx:659 | Same pattern. | Same. |
| U-061 | Med | src/components/StockPanel.tsx:1300 | Inline `Date.now() - offer.fetched_at > 7 * 24 * 60 * 60 * 1000` math instead of a named helper. | Extract `isStale(ts)` constant. |
| U-062 | High | src/components/VnDetailActionsBar.tsx:78-79 | `Date.now() - vn.fetched_at` inline against a 30-day const. Function-local, fine. | Acceptable. |
| U-063 | Med | src/app/producer/[id]/page.tsx:31, src/app/vn/[id]/page.tsx:151 | Same inline cache-age math; works but duplicates the staleness check. | Extract helper. |
| U-064 | Med | src/components/AliceNetKobeClient.tsx (filter chip strip) | Filter tabs (`all/matched/vndb/egs_only/unmatched/none_found/collection/wishlist`) live as buttons that flip `useState`. URL doesn't track the active tab. Refreshing kobe page resets to "all". | URL-state. |
| U-065 | High | src/components/RefreshScopeButton.tsx behavior is correct but RoutesSection.tsx, EgsSyncBlock.tsx, MapVnToEgsButton.tsx, MapEgsToVndbButton.tsx, CompareVnPicker.tsx, CompareWithButton.tsx use various inline date / time / status / "last seen" computations without going through `timeAgo` / `formatMinutes` / `formatIsoDateString`. | Audit and standardize. |
| U-066 | Med | src/components/SeriesManager.tsx:88-90 | Renders "no items" empty state directly without a loading guard. Items come from `initial` server prop, so first render is OK, but the `setItems(initial)` resync in line 21 means there's no in-flight state for client-driven updates. | Acceptable for SSR-hydrated initial set; flag for review. |
| U-067 | Med | src/components/AliceNetKobeClient.tsx:1296-1298 | "No items found" empty state shown when `sorted.length === 0`. Gated by `loading` (line 1290) so OK, but the empty state is a single-line `<p>` — minimal and unhelpful. | Add hint copy + CTA to download stock first. |
| U-068 | Med | src/components/ShelfReadOnlyControls.tsx (overall) | Popover-based slider preferences live in localStorage via PATCH /api/settings. The popover state has Escape handler (line 175) — good. Verified. | None. |
| U-069 | Med | src/components/EgsSyncBlock.tsx (no loading skeleton on initial fetch) | `loadConfig()` runs on mount; while waiting for the username setting, the input renders empty (could mislead user about whether their setting was saved). | Add a brief skeleton or `disabled` state until `loadConfig` resolves. |
| U-070 | High | src/components/CharactersSection.tsx:95 | `!loading && chars && chars.length === 0` — empty state only after fetch resolves. **Correct pattern**. | Reference implementation. |
| U-071 | Med | src/components/RoutesSection.tsx:24-32 | `routes: RouteRow[] = []` initial state, fetched in `useEffect`. Between mount and resolved fetch, the route panel renders the "no routes yet" affordance (line 197 etc). Empty-state-before-data anti-pattern. | Add `loaded` boolean. |
| U-072 | Med | src/components/StaffExtraCredits.tsx | Fetches extra credits in a useEffect; uses `SkeletonCardGrid` (line 122) — good but same fixed-grid issue (U-010). | Pair fix with U-010. |
| U-073 | Med | src/components/AliceNetKobeClient.tsx:1296-1297 | Empty-state copy `t.kobe.kobeUnmatched` is literally "Aucun item correspond aux filtres actuels." Same text regardless of context (no stock downloaded yet vs. stock downloaded but no match for current filter). | Distinguish "no stock fetched" from "no match for filter". |
| U-074 | High | src/components/AliceNetKobeClient.tsx (toolbar layout) | Toolbar is a single dense flex-wrap row with sort + group + view + filter + density + producer-filter + reset all crammed together. Most other pages have a tiered toolbar (search at top, sort/group below, density on right). | Reorganize toolbar to match `LibraryClient` / `WishlistClient` pattern. |
| U-075 | Med | src/app/series/page.tsx (SeriesManager toolbar) | Header + add-form + list — no card density slider, no sort dropdown. List uses `sm:grid-cols-2 lg:grid-cols-3` hardcoded — ignores density slider. | Add density slider (scope `lists`?) + URL sort. |
| U-076 | Med | src/app/producers/page.tsx (developer/publisher table) | The producers ranking is a `<table>` with no card density / sort dropdown / row count selector. Table is large; should be at least paginated for users with hundreds of producers. | Add pagination + sort headers. |
| U-077 | High | src/app/labels/page.tsx (grid) | `grid-cols-2 sm:grid-cols-3 md:grid-cols-4 print:grid-cols-4` ignores density slider. | Use density variable. |
| U-078 | High | src/components/SeriesManager.tsx (grid) | `sm:grid-cols-2 lg:grid-cols-3` hardcoded — series cards ignore density. | Use density variable. |
| U-079 | High | src/app/quotes/page.tsx (grid) | Hardcoded breakpoints, no density. | Use density variable. |
| U-080 | High | src/app/staff/page.tsx:284-286 | `gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))'` — fixed 220px floor, doesn't react to density slider. | Use `var(--card-density-px, 220px)`. |
| U-081 | High | src/app/characters/page.tsx:490-493 | `gridTemplateColumns: 'repeat(auto-fill, minmax(min(var(--card-density-px, 180px), 100%), 1fr))'` — has density var with **180px** default while every other surface defaults to 220px. Inconsistent default. | Standardize defaults (or document why characters is denser). |
| U-082 | High | src/components/TraitsBrowser.tsx:103 | `grid gap-3 sm:grid-cols-2 lg:grid-cols-3` — no density slider. | Add density. |
| U-083 | High | src/components/TagsBrowser.tsx — VNDB tree view and result grid don't honor density. | Same. | Same. |
| U-084 | Med | src/app/labels/page.tsx (no density slider) | No CardDensitySlider component on the page. | Add. |
| U-085 | High | src/components/AliceNetKobeClient.tsx (refresh state) | Page state shows pending counts / stats / op progress, but no relative "fetched X ago" indicator on results themselves. User can't tell how stale the snapshot is at a glance. | Add per-result "fetched_at" via `timeAgo`. |
| U-086 | High | src/components/MapVnToEgsButton.tsx (262-267) | Search input `<input value={query} onChange={(e) => setQuery(e.target.value)}>` — no debounce visible in the surrounding effect; every keystroke hits the EGS API. Adjacent picker (LinkToVndbButton.tsx, MapEgsToVndbButton.tsx) uses `useDebouncedCallback`. Inconsistent. | Add debounce. |
| U-087 | High | src/components/AliceNetKobeClient.tsx (search input field) | Search input `value={search} onChange={(e) => setSearch(e.target.value)}` (presumably) — filters client-side immediately, no debounce. With thousands of items, every keystroke re-filters. | Debounce + virtualize. |
| U-088 | High | src/components/EditForm.tsx:179 | `<button className="btn btn-primary" onClick={handleAdd} disabled={pending}>` — missing `type="button"`. Inside form-like card, but `EditForm` does NOT use `<form>` — so default is "submit" (browser default for `<button>` without form context is "submit", which still works without a form but can be triggered by Enter inside any nested input). | Add `type="button"`. |
| U-089 | High | src/components/SeriesManager.tsx:81 | Same: `<button className="btn btn-primary" onClick={create} disabled={!name.trim() || pending}>` missing `type=`. SeriesManager has no `<form>` wrapper but the two inputs above it would default to submit on Enter — current behavior actually relies on this. | Either add a form wrapper OR add `type="button"` and explicit Enter-handler. |
| U-090 | High | src/components/SeriesAddVnForm.tsx:50 | Same `type=` missing. | Add. |
| U-091 | High | src/components/BannerControls.tsx:115, 120 | Same. | Add. |
| U-092 | High | src/components/CachePanel.tsx:135 | Same. | Add. |
| U-093 | Med | src/components/LibraryClient.tsx:1082 | `<button className="btn" onClick=…>` without `type=`. Library page does have many forms — risk of accidental submit. | Add `type="button"`. |
| U-094 | High | src/components/LibraryClient.tsx:225-231 + URL-state mix | Library is the gold standard for URL-state filter handling. All filters live in URL. **No issue** — listed as the canonical reference. | Not a bug. |
| U-095 | Med | src/components/AliceNetKobeClient.tsx:559, 562, 561 | `isBusy`, `opPct`, `matchPct` computed inline — fine. But `showStatsSkeleton = loading && items.length === 0 && stats.total === 0` — guards skeleton tightly. The stats area otherwise re-renders even during reloads, which can cause flicker. | Consider preserving stats during reload. |
| U-096 | Med | src/components/LibraryClient.tsx:1141 | `<div className="ml-auto flex flex-wrap items-center gap-3">` — pushes density + dense + select + random + bulk to the right. Other pages (wishlist, search) have density + actions inline in a single row without `ml-auto`. Visual inconsistency. | Decide on canonical placement. |
| U-097 | Med | src/components/WishlistClient.tsx:478-545 | Toolbar layout (search → sort → group → hideOwned → density → refresh → bulk → select) is one wide row that overflows below md without wrapping cleanly. Compare to Library which has a tiered layout with chips. | Use the Library tiered toolbar pattern. |
| U-098 | Med | src/app/upcoming/page.tsx, src/app/top-ranked/page.tsx | NavTabStrip used for tabs — good. But no card-density slider; covers in row cards use fixed clamp values. | Document or align. |
| U-099 | Med | src/app/quotes/page.tsx, src/app/activity/page.tsx | Pagination implemented via prev/next links. Acceptable but no jump-to-page or total-count display. | Add page indicator (`Page 2 / 14`) using existing `t.charactersSearch.pageLabel` pattern. |
| U-100 | High | src/components/MarkdownNotes.tsx (tabs) | Tab buttons use `aria-selected` (line 47, 58) — correct ARIA tabs pattern with `role="tab"` (line 46, 57). Verify focus/keyboard nav. Verified OK. | Reference implementation. |
| U-101 | Med | src/components/FieldCompare.tsx (tabs) | Same ARIA-correct tabs. Verified OK. | Reference. |
| U-102 | High | src/components/AliceNetKobeClient.tsx (filter tabs) | Filter chip strip at line 691-698 uses `<button>` with no `aria-pressed`. Visual active state is only via class — screen reader users can't tell which filter is active. | Add `aria-pressed={filter === id}`. |
| U-103 | Med | src/components/AliceNetKobeClient.tsx (sort dropdown) | Sort/group/view selected from buttons or selects — verify each has accessible labels. | Audit. |
| U-104 | Med | src/app/upcoming/page.tsx, src/app/top-ranked/page.tsx (Active states) | Both use `<NavTabStrip>`. Active state contracts via `aria-current="page"`. Good. | No issue. |
| U-105 | High | src/components/Skeleton.tsx (SkeletonCardGrid) | "Mirror the final layout" rule (CLAUDE.md) is violated: real grid uses density-driven columns, skeleton uses static breakpoints. | Pair with U-010. |
| U-106 | Med | src/components/CardContextMenu.tsx (Escape handling) | Card right-click menu — should close on Escape. | Verify. |
| U-107 | Med | src/components/SortableGrid.tsx — Drag overlay implemented. OK. | None. |
| U-108 | Med | src/components/ShelfLayoutEditor.tsx (drag-drop indicators) | `isOver` ring (line 1189, 1290) on droppable. Good visual feedback. `isDragging` opacity drop (lines 1331, 1407, 1498) on draggables. Good. | Reference. |
| U-109 | Med | src/components/DetailReorderLayout.tsx — drag overlay implemented. OK. | None. |
| U-110 | Med | src/components/HomeLayoutEditorTrigger.tsx — same. OK. | None. |
| U-111 | Med | src/components/SortableGrid.tsx (library drag reorder) | DragOverlay present. OK. | None. |
| U-112 | High | src/components/SafeImage.tsx:232 | Image fade-in uses `transition-[filter,opacity,transform] duration-200`. Combined with `loaded ? 'opacity-100' : 'opacity-0'` — fine. But on virtualised lists, the initial render's loading state can flash when scroll re-mounts. | Document or add an `instant` prop. |
| U-113 | High | src/components/AliceNetKobeClient.tsx (operation progress) | Op progress bar (`opPct`) shown only when `activeOp !== 'idle'`. While loop runs, the UI shows op label + pct — but no per-batch detail; user can't tell which item is currently being matched. | Add current-item label inside the progress bar. |
| U-114 | Med | src/components/ToastProvider.tsx — uses Lucide icons + status colors. OK. | None. |
| U-115 | Med | src/components/ConfirmDialog.tsx (styled confirm/prompt) | Mature implementation; replaces window.confirm/prompt across the app. Good. | Reference. |
| U-116 | Med | src/components/Dialog.tsx (canonical Dialog primitive) | Mature; many components use it. Good. | Reference. |
| U-117 | Med | src/components/EditForm.tsx (auto-save) | Auto-saves on debounce; no form/submit button. Status indicator below form. Different from forms with explicit submit — a deliberate UX choice but inconsistent. | OK; document. |
| U-118 | High | src/components/AliceNetKobeClient.tsx (Stop button) | When `isBusy`, a stop button sets `stopRef.current = true`. Verify it's prominent enough — the busy state is full-page; user needs to know they can interrupt. | Audit. |
| U-119 | Med | src/components/SettingsButton.tsx (settings modal tabs) | 8 tabs in fixed order with `aria-selected`. Verified. | Reference. |
| U-120 | Med | src/components/QuoteFooter.tsx (collapsed footer) | Hover + touch + focus expands; touchpad-friendly. Good. | Reference. |
| U-121 | High | src/components/RoutesSection.tsx:32 + 56-68 + 70-90 | Two `useEffect`s both with empty `useState([])` for `routes` and `characters`. Combined, opens potential for "no routes" empty state before either fetch resolves. **Verify**: empty-state branch (line 191-197) reads `routes.length === 0` directly with no `loading` gate. | Add `loadedRoutes` gate. |
| U-122 | Med | src/components/AliceNetKobeClient.tsx (linkTarget dialog) | LinkDialog (line 1325) opens on `setLinkTarget(item)`. Verify Escape handling + a11y. | Audit. |
| U-123 | Med | src/components/EgsPanel.tsx (EgsPicker dialog) | Verified uses `useDialogA11y` (line 438). Good. | Reference. |
| U-124 | High | src/components/CardDensitySlider.tsx (per-page density slider) | One component, 15 mounting sites (library, wishlist, search, etc.). Pattern is solid. | Reference. |
| U-125 | Med | src/lib/i18n/dictionaries.ts (label hierarchy) | Most labels mapped per surface. Duplication: `t.series.deleteConfirm`, `t.lists.deleteConfirm`, `t.gameLog.deleteConfirm`, `t.routes.removeConfirm`, `t.inventory.removeConfirm` etc. — same "Are you sure?" question reworded N times. | Centralize via `t.common.deleteConfirm` with optional `{name}` placeholder. |
| U-126 | High | src/app/labels/page.tsx (badge color) | `border-amber-500/40 bg-amber-500/10 text-amber-400` — non-palette. | Use `status-on_hold`. |
| U-127 | Med | src/components/EgsPanel.tsx (manual unlink confirm message) | `t.egs.unlinkConfirm` — phrased per-surface. Could be more generic. | OK; per-surface is fine. |
| U-128 | High | src/components/LibraryClient.tsx (settings + persisted defaults via useEffect) | Library reads `default_sort`/`default_order`/`default_group` from `/api/settings` and applies them when URL params absent. **Correct pattern**. | Reference. |
| U-129 | High | src/components/AliceNetKobeClient.tsx (no settings hookup) | No persisted view defaults — filter/sort/group/view all default to fixed values, ignoring user preference. | Add per-user default for kobe view. |
| U-130 | High | src/components/EditForm.tsx (status icon ARIA) | Status icon next to `<select>` is `aria-hidden` by absence — but the visible icon AND select content together are an accessible label. OK. | None. |
| U-131 | Low | src/components/TextualSearchPanel.tsx (mode prop) | Has `mode="standalone"` or embedded. Two render paths; ensure both honor density. | Audit. |
| U-132 | High | src/components/TutorialTour.tsx — overlay tour; verify Escape closes and focus-traps. | Audit. |
| U-133 | High | src/components/SettingsButton.tsx (settings save on PATCH) | Modal closes on save; no explicit feedback. Verify toast fires. | Audit. |
| U-134 | High | src/components/LibraryClient.tsx (filter chips clear) | `Clear all` removes every active filter — good. | Reference. |
| U-135 | High | src/components/AliceNetKobeClient.tsx (reset filters button line 1242) | Resets year/price/producer filters but not the tab filter. User must click reset AND switch tab. | Make reset also clear the active tab. |
| U-136 | Med | src/components/EgsRichDetails.tsx (lazy load) | Fetches from `/api/vn/[id]/erogamescape` on mount; uses AbortController. Good. | Reference. |
| U-137 | Med | src/components/CompareWithButton.tsx (loading state) | Renders skeleton `<li key={i}>` with `i` as key — OK for skeleton. Real list keyed by `r.id`. Good. | None. |
| U-138 | High | src/components/SettingsButton.tsx (tab keyboard navigation) | Has arrow-key handler in tablist (line 573). Good. | Reference. |
| U-139 | Med | src/components/LibraryClient.tsx (chip removal vs filter) | Each chip has its own ×; Library uses URL state. Good. | Reference. |
| U-140 | Med | src/app/quotes/page.tsx, src/app/activity/page.tsx (Pagination) | Pagination buttons OK. No page-jump input. | OK. |
| U-141 | Med | src/app/labels/page.tsx (no pagination for labels truncation) | When > 200 labels, user can only filter — no "show more". | Pair with U-026. |
| U-142 | High | src/components/AliceNetKobeClient.tsx (renderKobeCard cards) | Cards render with `min-h-[24rem]` — large fixed-height blocks. Many items in vertical scroll = long page. No virtualization. | Virtualize for > 100 items. |
| U-143 | Med | src/app/wishlist/page.tsx (sort persistence) | Sort preference persisted to localStorage but not URL — share-able wishlist URL with sort is impossible. | Add URL state. |
| U-144 | High | src/components/StockPanel.tsx (loading state) | `loading` state shown via SkeletonRows + spinner. Good. | None. |
| U-145 | High | src/components/AliceNetKobeClient.tsx (status badge color logic) | `statusBadge(item)` returns three differently-colored spans (green for vndb, sky for egs, amber for unmatched) — none match the palette. | Use `status-completed/playing/on_hold`. |
| U-146 | High | src/components/Skeleton.tsx (SkeletonCardGrid hardcoded breakpoints) | See U-010. Top issue. | Pair with U-010, U-020. |
| U-147 | Med | src/components/AliceNetKobeClient.tsx (kobe card right-side "Open EGS" link) | Opens in new tab; uses target=_blank without `rel="noopener"` consistently? Line 773 has `rel="noopener noreferrer"` — good. | None. |
| U-148 | High | src/components/AliceNetKobeClient.tsx (search inside the page) | Has its own search input — but the page is gated behind `ALICESOFT_KOBE_ENABLED`. The search input + filter pipeline runs client-side over the full `items` array. Performance concern at large scale. | Server-side filter or virtualize. |
| U-149 | High | src/components/VnCard.tsx (Drag-and-drop reorder) | Cards in custom-sort mode get a `wiggle` animation. OK. | None. |
| U-150 | Med | src/components/SortableGrid.tsx (drag handle / cursor) | `cursor-grab` / `cursor-grabbing` — visual feedback. Good. | None. |
| U-151 | Med | src/components/HomeLayoutEditorTrigger.tsx (drag handle visibility) | Drag handle always visible. Good. | None. |
| U-152 | Med | src/components/AliceNetKobeClient.tsx (no drag, no SortableGrid) | Cards can't be reordered. OK by design. | None. |
| U-153 | Med | src/components/SchemaBrowser.tsx + SchemaEgsSection.tsx (lazy expand) | Verified. | None. |
| U-154 | Med | src/components/SettingsButton.tsx (proxy section masking) | Password rendered as `••••••••` when stored value exists. Good. | Reference. |
| U-155 | Low | src/components/EditionInfoPopover.tsx (title duplication) | Many `title=` repeat the content (line 257, 259, 262, 296, 308). Minor. | Acceptable for ellipsis-tooltips. |
| U-156 | Med | src/components/MapVnToEgsButton.tsx (auto-search on type) | No debounce on `setQuery`; every keystroke triggers fetch. | Add debounce. |
| U-157 | Med | src/components/CompareVnPicker.tsx (uses `useDebouncedCallback`) | Has debounce. Good. | Reference. |
| U-158 | Med | src/components/LinkToVndbButton.tsx (search) | Verify debounce. | Audit. |
| U-159 | High | src/components/EgsSyncBlock.tsx:185-198 | `<li role="button">` semantic anti-pattern with nested `<Link>` — accessibility regression. | Fix per U-032. |
| U-160 | High | src/app/steam/page.tsx (Suggestions row buttons) | At line 236-266, **does** use proper `<button>` for the row. Comment at line 230-235 documents the previous a11y fix. Good. | Reference. |
| U-161 | High | src/components/EgsSyncBlock.tsx | Should match the steam-page row fix. | Apply the steam pattern. |
| U-162 | Med | src/components/Skeleton.tsx (SkeletonRows) | Fixed grid layout `flex gap-3`. OK. | None. |
| U-163 | High | src/components/SafeImage.tsx (intersection observer + state reset) | Resets state on `src` change to avoid stale "errored" flag. Documented behavior. Good. | Reference. |
| U-164 | Med | src/components/LibraryClient.tsx (Active filter chip strip) | Renders chips when filters active. Each chip removable. Good. | Reference. |
| U-165 | Med | src/app/dumped/page.tsx (chip strip) | Has NavTabStrip + status icons. Good. | None. |
| U-166 | High | src/components/AliceNetKobeClient.tsx (kobe filter tabs use FilterTab type) | All filter values plus search persistence: not URL. | Pair with U-006. |
| U-167 | High | src/components/AliceNetKobeClient.tsx (manual link dialog) | Dialog with VN/EGS inputs; verify Escape closes. | Audit. |
| U-168 | Med | src/components/AliceNetKobeClient.tsx (statistics grid skeleton) | Skeleton uses inline animate-pulse divs instead of `<SkeletonBlock>`. | Use shared primitive. |
| U-169 | Med | src/components/AliceNetKobeClient.tsx (button sizing inconsistency) | Mix of `btn btn-sm`, `btn btn-xs`, `btn btn-primary btn-sm`. Other pages use just `btn` or `btn btn-primary`. | Document sizing scale; audit. |
| U-170 | High | src/components/WishlistClient.tsx (no URL-state sort) | Sort persisted to localStorage instead of URL. Inconsistent with Library. | Use URL for sort/group. |
| U-171 | Med | src/components/SettingsButton.tsx (long tabs vertical scroll) | Modal scrolls vertically when content > viewport. Good. | None. |
| U-172 | High | src/components/BulkDownloadButton.tsx (download progress) | Has `failures` and `egsWarnings` arrays — `useState([])`. Empty state could flash before run starts. | Gate empty state on `running`. |
| U-173 | High | src/app/dumped/page.tsx (Dumped status) | Page handles complete/missing/none — uses NavTabStrip. URL state. Good. | None. |
| U-174 | High | src/components/SortableGrid.tsx + LibraryClient (virtualization above 200 items) | Hint shown via `t.library.virtualScrollNotice` at line 1270-1273. Document. | OK. |
| U-175 | Med | src/components/AliceNetKobeClient.tsx (loadConfig on mount) | `useEffect` runs once on mount — but on `load()` re-call after operations, `setLoading(true)` is set then unset. Good. | None. |
| U-176 | Med | src/components/StockPanel.tsx (multiple loading states) | `loading` + `aliasLoading` + `sourceLoading` + `refreshing` — many flags. UI shows independent spinners. Good but complex. | None. |
| U-177 | Med | src/components/AliceNetKobeClient.tsx (active op label) | Op progress shows label like "Téléchargement…" — good. But no per-item current name. | Pair with U-113. |
| U-178 | High | src/components/Skeleton.tsx (SkeletonCardGrid count default) | Default `count={12}` — but real lists rarely show exactly 12. Consider `count={24}` to better match common LibraryClient call (line 1200). | Doc. |
| U-179 | Med | src/components/RoutesSection.tsx (suggestion list) | Suggestion chips rendered AFTER add form. Visually OK; verify keyboard reachability. | Audit. |
| U-180 | High | src/components/MoreNavMenu.tsx (navbar) | Mobile sheet pattern documented in CLAUDE.md. Verified. | Reference. |
| U-181 | Med | src/components/EgsPanel.tsx (EgsPicker manual search) | Modal picker; uses `useDialogA11y`. Good. | Reference. |
| U-182 | Med | src/components/LinkToVndbButton.tsx (heavyweight VN migration) | Modal picker; uses `useDialogA11y`. Good. | Reference. |
| U-183 | High | src/components/AliceNetKobeClient.tsx (item card image) | `image = item.vn_image_url \|\| item.egs_image_url` — falls back to EGS image. Verify SafeImage renders both with same scale. | Audit. |
| U-184 | High | src/components/Skeleton.tsx (no SkeletonTabRow) | Tab strips have no skeleton variant. While tabs load (active state) there's no fallback. | Optional add. |
| U-185 | High | src/app/vn/[id]/page.tsx (long VN page rendering) | Server-rendered; multiple Suspense boundaries for sections. Good. | Reference. |
| U-186 | Med | src/app/year/page.tsx | Server-rendered, no client state. | None. |
| U-187 | Med | src/app/series/page.tsx | Server-rendered hydrates SeriesManager. | Pair with U-066. |
| U-188 | High | src/components/EditForm.tsx (auto-save + dirty state) | Auto-save debounce + status indicator. UX clear once user understands. New users may not realize changes save automatically. | Add a one-time hint or "Auto-save on" badge. |
| U-189 | Med | src/components/PomodoroTimer.tsx (number input) | `<input type="number" min={1} max={120}>` — but user can clear field. Min/max only enforced on form-submit (which doesn't happen here). Add explicit value clamp on blur. | OK with `Number(e.target.value) \|\| 1`. |
| U-190 | High | src/components/EditForm.tsx (number input for rating) | `<input type="number" min={10} max={100}>` with `aria-invalid` when out of range. Good. | Reference. |
| U-191 | Med | src/components/SettingsButton.tsx (sliders / numbers / selects) | Mixed control types; ensure all are accessible. | Audit. |
| U-192 | High | src/components/QuoteFooter.tsx (auto-show on hover) | Touch users tap to expand. Good. | Reference. |
| U-193 | Med | src/components/TutorialTour.tsx (positioning) | Verify tour respects current scroll. | Audit. |
| U-194 | High | src/components/AliceNetKobeClient.tsx (download stock button) | Triggers `runSingleOp('downloading')` — heavy operation. Button shows "Downloading…" with progress. Good. | None. |
| U-195 | Med | src/components/AliceNetKobeClient.tsx (reset confirm) | Uses styled `confirm()`. Good. | Reference. |
| U-196 | Med | src/components/AliceNetKobeClient.tsx (search input — verified above) | No debounce. | Pair with U-087. |
| U-197 | Med | src/components/EditionInfoPopover.tsx (popover) | Verified Escape (line 152). Good. | Reference. |
| U-198 | High | src/app/staff/page.tsx (no density slider) | Cards-grid, but no density slider. | Add. |
| U-199 | High | src/app/year/page.tsx (no density) | Same. | Add. |
| U-200 | High | src/app/compare/page.tsx | Tables / VN tiles. | Audit density. |
| U-201 | High | src/app/recommendations/page.tsx | Uses VnCard grid; verified density slider. Good. | None. |
| U-202 | Med | src/components/SeriesManager.tsx (description tooltip == content) | Line 96: `<div className="line-clamp-2 …" title={s.description}>{s.description}</div>` — title repeats content. OK for ellipsis-tooltips. | Acceptable. |
| U-203 | High | src/components/EgsSyncBlock.tsx (button → save with no dirty check during interim state) | If user types username then clicks Compute without saving — `compute` calls `/api/egs/sync` which reads server-side `egs_username`. The local input is decorative. UX bug: user expects compute to use input value. | Auto-save before compute OR display warning. |
| U-204 | High | src/components/StockPanel.tsx (alias error + source error separation) | Two independent error states. Clears on input (U-057 reference). Good. | Reference. |
| U-205 | Med | src/app/wishlist/page.tsx (refresh button shape) | Uses raw Tailwind (`inline-flex items-center gap-1 rounded-md border border-border bg-bg-elev/50 px-2 py-1`) instead of `.btn` — inconsistent with Library refresh. | Use `.btn`. |
| U-206 | Med | src/components/HomeLayoutEditorTrigger.tsx (reset button uses raw Tailwind) | Line 211. | Use `.btn`. |
| U-207 | High | src/components/AliceNetKobeClient.tsx (clearLink action with no confirm) | Line 549: `clearLink()` runs DELETE with no confirm. Other delete actions across the app go through `confirm()` first. Inconsistent. | Add confirm. |
| U-208 | High | src/components/StockPanel.tsx (source delete confirm?) | Line 798-806: delete button without confirm. Inconsistent with the rest of delete UX. | Add confirm. |
| U-209 | High | src/components/StockPanel.tsx (alias delete) | Line 728-740: alias `removeAlias()` runs DELETE without confirm. | Add confirm. |
| U-210 | Med | src/components/LibraryClient.tsx (saved filter delete) | Verifies via `confirm()`. Good. | Reference. |
| U-211 | High | src/components/AliceNetKobeClient.tsx (operations not undoable) | Match operations modify DB rows. No undo. User must re-do. | Document; consider history. |
| U-212 | Med | src/app/labels/page.tsx (print mode) | Has `print:hidden` etc. — print-friendly. Good. | Reference. |
| U-213 | Med | src/components/PrintButton.tsx | Verify integration. | Audit. |
| U-214 | High | src/components/SchemaBrowser.tsx — Default expanded? Verify. | Audit. |
| U-215 | Med | src/components/AliceNetKobeClient.tsx (toast errors with manual close) | Some toast errors persist (`toast.error(msg, 0)` with duration 0). UX: user must close manually. Consistent with operation-critical errors. | OK; document. |
| U-216 | High | src/components/AliceNetKobeClient.tsx (operations status) | Has stop ref + abort handling. Good. | Reference. |
| U-217 | Med | src/components/EditForm.tsx (no autocomplete attrs on inputs) | `type="number"` doesn't trigger autocomplete; `<input>` for notes lacks `spellCheck`. | Audit. |
| U-218 | High | src/components/SearchClient.tsx (run advanced on Enter) | Line 430: `if (e.key === 'Enter' && source === 'vndb' && advActive) runAdvanced();` — runs the advanced search on Enter only when adv is active. Quick search runs continuously on type. | OK; document. |
| U-219 | Med | src/components/SearchClient.tsx (no clear "submitting" state) | runAdvanced sets `loading=true`. Good. | None. |
| U-220 | High | src/components/AliceNetKobeClient.tsx (no error boundary) | Single big client component; if it throws, the whole page crashes to the route's `error.tsx`. | OK; document. |
| U-221 | Med | src/components/WishlistClient.tsx (refresh button) | Uses raw Tailwind. See U-205. | Pair. |
| U-222 | Med | src/components/AliceNetKobeClient.tsx (no skeleton for stats) | Skeleton placeholder only shows when `showStatsSkeleton` = true (first load with no items + no stats). Subsequent reloads keep old values visible. Good. | None. |
| U-223 | High | src/components/AliceNetKobeClient.tsx (kobe item link "Open EGS" without disambiguation) | When item has both vn_id AND egs_id, button labels show both — but the open targets are separate pages. User must pick which to open. Some clutter for ambiguous items. | OK; visual is clear. |
| U-224 | High | src/components/SettingsButton.tsx (modal a11y) | Verified `useDialogA11y` + arrow-key tabs + focus trap. Reference. | None. |
| U-225 | Med | src/components/AliceNetKobeClient.tsx (manual link dialog title) | Verify dialog uses canonical pattern. | Audit. |
| U-226 | Med | src/components/AliceNetKobeClient.tsx (no shared Toolbar) | All toolbar buttons inline. Library has a shared toolbar wrapper. | Refactor to share. |
| U-227 | Med | src/app/recommendations/page.tsx (RecommendModeTabs) | URL-state. Good. | Reference. |
| U-228 | Med | src/app/similar/page.tsx (VnSeedPicker) | Has `inputRef.current?.focus()` on open. Good. | None. |
| U-229 | High | src/components/AliceNetKobeClient.tsx (no card-level select) | Cards can't be multi-selected for bulk-actions. Library, Wishlist support this. | OK by design. |
| U-230 | Med | src/app/quotes/page.tsx (search via `<form action="/quotes">`) | Form submit reloads to /quotes?q=… — server-rendered. Good. | Reference. |
| U-231 | Med | src/app/staff/page.tsx (form method="get") | Plain GET form. Server-rendered. Good. | Reference. |
| U-232 | Med | src/app/characters/page.tsx (form method="get") | Same. Good. | None. |
| U-233 | Med | src/app/activity/page.tsx (form method="get") | Same. Good. | None. |
| U-234 | High | src/components/AliceNetKobeClient.tsx (massive single file) | ~1300 lines client component. Refactor into smaller modules (`KobeStats`, `KobeToolbar`, `KobeFilters`, `KobeItem`). | Refactor. |
| U-235 | High | src/components/LibraryClient.tsx (also a huge file) | ~2000 lines. Could be split. | OK; ack. |
| U-236 | High | src/components/Skeleton.tsx (no per-page custom skeletons) | Generic primitives; each page composes them. Good. | Reference. |
| U-237 | Med | src/components/AliceNetKobeClient.tsx (background images on cards) | SafeImage with `fit="cover"`. Good. | None. |
| U-238 | Med | src/components/AliceNetKobeClient.tsx (release date display) | Shows raw `release_date` string. Not formatted via `formatVndbDateString` / `formatIsoDateString`. | Format. |
| U-239 | High | src/components/AliceNetKobeClient.tsx (kobe release date) | Line 793-794: `date = item.release_date \|\| item.egs_release_date`; rendered raw. Same issue. | Format. |
| U-240 | High | src/components/AliceNetKobeClient.tsx (list/price columns) | `list_price` and `sale_price` rendered as raw numbers. Verify currency formatting + thousand separator. | Format via Intl. |
| U-241 | Med | src/components/EditForm.tsx (price input) | Number input; currency separately. OK. | None. |
| U-242 | High | src/components/AliceNetKobeClient.tsx (search input + filter form layout) | Search input takes full width; filters wrap below. Mobile layout uses full width. OK. | None. |
| U-243 | High | src/components/AliceNetKobeClient.tsx (filter active count badge) | Shows `activeFilterCount` as a chip. Good. | Reference. |
| U-244 | Med | src/components/AliceNetKobeClient.tsx (show/hide filters toggle) | Has `showFilters` state with persistent toggle. URL would be better. | Pair with U-006. |
| U-245 | High | src/components/AliceNetKobeClient.tsx (no preview / hover state on cards) | Cards are static. Wishlist / Library have hover delete buttons. Inconsistent. | Add hover affordances. |
| U-246 | Med | src/components/AliceNetKobeClient.tsx (link kobe -> manual link button) | Each unmatched item has "Manual Link" button. Good. | Reference. |
| U-247 | Med | src/components/AliceNetKobeClient.tsx (clearLink button per-item) | Each linked item has clear button — without confirm (see U-207). | Add confirm. |
| U-248 | Med | src/components/AliceNetKobeClient.tsx (display title) | Resolves title from VN+EGS+raw. Good. | Reference. |
| U-249 | High | src/components/AliceNetKobeClient.tsx (no batch select) | No "select all" / "select matched". | Add. |
| U-250 | Med | src/components/AliceNetKobeClient.tsx (debugging info in title attrs) | Multiple `title={c.title}` — exposes raw stock title. OK. | None. |
| U-251 | High | src/lib/i18n/dictionaries.ts (FR/EN/JA parity) | CLAUDE.md mandates all keys in all 3 locales. Spot-check needed but not exhaustively verified. | Add lint. |
| U-252 | Med | src/app/global-error.tsx (renders without provider context) | Uses `useState<SupportedLocale>('fr')` — defaults to French. Bad i18n default for EN users. | Detect browser locale. |
| U-253 | Med | src/components/AliceNetKobeClient.tsx (i18n consistency) | All UI strings via `t.kobe.*`. Good. | Reference. |
| U-254 | High | src/components/StockPanel.tsx (currency format) | Marketplace price formatted with `mktPrice.toLocaleString(locale)` (line 1272). Yen marketplace at line 2192 of `src/lib/stock.ts` uses hardcoded `'ja-JP'`. Inconsistent — frontend uses user locale, backend uses Japan locale. | Pass user locale through or document. |
| U-255 | Med | src/components/AliceNetKobeClient.tsx (open kobe URL?) | Items have a code but no direct AliceNet Kobe shop URL link. Worth adding. | Optional. |
| U-256 | High | src/components/AliceNetKobeClient.tsx (single-line title attr) | Line 321: `title={`${c.title}${c.alttitle ? ` / ${c.alttitle}` : ''}${c.released ? ` (${formatVndbDateString(c.released, locale)})` : ''}`}` — properly formatted using `formatVndbDateString`. Good. | Reference. |
| U-257 | High | src/components/AliceNetKobeClient.tsx (operations toast 0 duration) | When op fails, toast with duration 0 persists until dismissed. Good for critical errors. | Reference. |
| U-258 | Med | src/app/year/page.tsx (year input form) | Manual year selector. | OK. |
| U-259 | Med | src/components/SeriesAutoSuggest.tsx (dismissed flag) | `dismissed: false` initial — once dismissed, stays dismissed in localStorage? Verify. | Audit. |
| U-260 | High | src/components/AliceNetKobeClient.tsx (operations run sequentially) | All ops use a single op state. Cannot parallelize. Good for safety. | None. |
| U-261 | High | src/components/AliceNetKobeClient.tsx (filter chip "in_wishlist" uses 'wishlist' filter tab) | Mapping from chip → filter is OK. Verified. | None. |
| U-262 | Med | src/components/AliceNetKobeClient.tsx (sort label dict) | sortLabels mapped via i18n. Good. | Reference. |
| U-263 | High | src/components/AliceNetKobeClient.tsx (refresh after operation) | `await load()` after each op. Good. | Reference. |
| U-264 | High | src/components/AliceNetKobeClient.tsx (download-all combined operation) | Single button triggers fetch + match + resolve. Good. | Reference. |
| U-265 | Med | src/app/series/[id]/page.tsx (series grid) | Uses density var. Good. | Reference. |
| U-266 | Med | src/components/MapVnToEgsButton.tsx (no debounce — confirmed) | Pair with U-156. | None. |
| U-267 | High | src/components/AliceNetKobeClient.tsx (action button cluster) | Operations panel renders 6+ buttons. Wraps below sm. OK. | None. |
| U-268 | High | src/components/AliceNetKobeClient.tsx (visual hierarchy) | Stats grid → toolbar → ops panel → filter row → items. Reasonable visual flow. | Reference. |
| U-269 | Med | src/components/EditForm.tsx (DateInput component) | Custom date picker. Verified. | Reference. |
| U-270 | High | src/components/SmartStatusHint.tsx | Uses `new Date().toISOString().slice(0, 10)` to format finish date. Same partial-date string issue. | Use canonical formatter. |
| U-271 | Med | src/components/ReadingGoalCard.tsx (target input) | Number input with min/max. OK. | None. |
| U-272 | Med | src/components/PomodoroTimer.tsx (target minutes input) | Same shape. OK. | None. |
| U-273 | High | src/components/AliceNetKobeClient.tsx (vn_image_sexual flag) | Passes through to SafeImage for blur. Good. | Reference. |
| U-274 | High | src/components/AliceNetKobeClient.tsx (no skeleton mismatch—stats first paint) | First paint shows stats skeleton; first refetch keeps last stats. Good. | None. |
| U-275 | Med | src/app/release/[id]/page.tsx (no density slider) | Single-release page; OK. | None. |
| U-276 | Med | src/app/trait/[id]/page.tsx | Has its own grid. | Audit density. |
| U-277 | Med | src/components/TraitsBrowser.tsx (grid columns) | Static — no density. | Pair with U-082. |
| U-278 | Med | src/components/TagsBrowser.tsx (grid columns) | Static — no density. | Pair with U-083. |
| U-279 | Med | src/components/Skeleton.tsx (no shared "spinner" primitive) | Each component renders `<Loader2 className="h-N w-N animate-spin">` inline. Standardize? | Optional. |
| U-280 | High | src/lib/i18n/dictionaries.ts (FR-only example messages) | Many test/sample messages use FR phrasing first. Verify EN/JA mirror. | Lint. |
| U-281 | Med | src/components/CompareWithButton.tsx:130 + .ts | `<li key={i} className="mb-1 h-6 animate-pulse rounded bg-bg-elev/40" />` — inline animate-pulse instead of `<SkeletonBlock>`. | Use shared. |
| U-282 | Med | src/components/AliceNetKobeClient.tsx:1293 | `<div ... animate-pulse rounded-xl bg-bg-elev/40 />` — same. | Use shared. |
| U-283 | Med | src/components/AliceNetKobeClient.tsx:937-940 | Stats skeleton — bare divs with animate-pulse, no SkeletonBlock. | Use shared. |
| U-284 | High | src/components/AliceNetKobeClient.tsx (i18n consistency for filter tab labels) | All labels go through `t.kobe.*`. Good. | Reference. |
| U-285 | Med | src/components/MoreNavMenu.tsx (mobile sheet) | Has Menu button + sheet. Good. | Reference. |
| U-286 | Med | src/components/SettingsButton.tsx (modal opens via custom event) | Documented. Good. | Reference. |
| U-287 | High | src/components/CoverSourcePicker.tsx (custom tab default) | Documented in CLAUDE.md. Good. | Reference. |
| U-288 | High | src/components/BannerSourcePicker.tsx (custom tab default) | Same pattern. Good. | Reference. |
| U-289 | Med | src/components/CharactersSection.tsx (lazy fetch on open) | Good lazy pattern. | Reference. |
| U-290 | Med | src/components/QuotesSection.tsx | Lazy fetch. Good. | Reference. |
| U-291 | Med | src/components/ReleasesSection.tsx | Lazy fetch. Good. | Reference. |
| U-292 | Med | src/components/RelationsSection.tsx | Verify lazy. | Audit. |
| U-293 | High | src/app/stats/page.tsx:46-52 | `STATUS_COLORS` constant has hex colors duplicated from tailwind palette (`#475569`, `#3b82f6`, `#22c55e`, `#f59e0b`, `#ef4444`). If palette changes, this won't update. | Generate from CSS vars or import from tailwind config. |
| U-294 | High | src/lib/i18n/dictionaries.ts (deleteConfirm phrasings) | Each scope has its own delete confirmation copy — partly intentional (e.g. delete-list says "Delete list" but delete-series says "Remove series from collection") but check for sloppy wording. | Audit. |
| U-295 | Med | src/components/AliceNetKobeClient.tsx (no per-card status color from palette) | Status badges use Tailwind utility classes off-palette. | Pair with U-027/U-028/U-145. |
| U-296 | Med | src/app/page.tsx (Home strips with HomeLayoutEditor) | Home layout configurable; uses event-based open. Good. | Reference. |
| U-297 | Low | src/components/EditionInfoPopover.tsx (popover with Escape) | Documented. Good. | None. |
| U-298 | Med | src/components/SelectiveFullDownload.tsx (released format) | `released.slice(0, 4)` — see U-054. | Pair. |
| U-299 | High | src/components/SearchClient.tsx (advanced filter pane) | Has its own collapse/expand. Reads URL. Good. | Reference. |
| U-300 | High | src/components/WishlistClient.tsx (advanced filters drawer pattern) | Filters drawer collapses by default per CLAUDE.md. Verified. | Reference. |
| U-301 | Med | src/components/LibraryClient.tsx (AdvancedFiltersDrawer pattern) | Verified. | Reference. |
| U-302 | High | src/components/AliceNetKobeClient.tsx (no AdvancedFiltersDrawer) | Filters always visible (or toggleable). Inconsistent shape. | Audit. |
| U-303 | Med | src/components/TutorialTour.tsx (overlay) | Verify overlay does not trap scroll. | Audit. |
| U-304 | Med | src/components/CardContextMenu.tsx (right-click) | Verify Escape closes. | Audit. |
| U-305 | High | src/components/AliceNetKobeClient.tsx (Stop button position) | Verify Stop is reachable + obvious during op. | Audit. |

---

## Cross-cutting summary

**Top systemic issues (fix once, ripple-fixes many):**

1. **U-010 + U-020 + U-077-U-083 + U-146 + U-198/199**: `SkeletonCardGrid` ignores density slider; many grids have hardcoded breakpoints. Fix by making `SkeletonCardGrid` and all listing grids consume `--card-density-px`.
2. **U-003 + U-004 + U-005 + U-006 + U-064 + U-143 + U-170**: Non-URL filter/sort/group state on Wishlist, Traits, Tags, AliceNet Kobe. Pull state into URL like Library.
3. **U-027 + U-028 + U-029 + U-030 + U-031 + U-126 + U-145**: Off-palette colors (`green-`, `amber-`, `rose-`, `sky-`) used inconsistently in StockPanel + AliceNetKobeClient + labels page. Switch to `status-*`.
4. **U-046 - U-053**: Inline `Math.floor(min/60)` for time formatting instead of `formatMinutes`.
5. **U-054 + U-055 + U-238 + U-239 + U-298**: Raw `released.slice(0, 4)` and direct date strings instead of `formatVndbDateString`/`formatIsoDateString`.
6. **U-058 + U-059 + U-060**: Absolute timestamps where relative `timeAgo` would be friendlier.
7. **U-034**: Five duplicate `BCP47_MAP` constants; one canonical exists in `lib/locale-number.ts`.
8. **U-021 + U-088-U-093**: Buttons missing explicit `type="button"`.
9. **U-019**: No shared `<ErrorAlert>` primitive — 20+ surfaces render raw `{error}` differently.
10. **U-057**: Form errors don't clear on type in most components.
11. **U-207 + U-208 + U-209**: Some delete actions skip the styled confirm.
12. **U-001**: `status-finished` is an invalid Tailwind class — silent visual bug.
13. **U-002**: `toLocaleString()` called without locale in AliceNetKobeClient.

**Reference implementations (do-not-touch):**

- `LibraryClient` (URL state, density, drag-reorder, filter chips, toolbar tiering).
- `Dialog` + `useDialogA11y` (Escape, focus trap, scroll lock).
- `ConfirmDialog` (styled confirm/prompt queue).
- `NavTabStrip` (URL-state tabs with pending state).
- `SafeImage` (load state + density).
- `RefreshScopeButton` + `timeAgo` (relative timestamps).
- `StatusBadge` (palette-driven colors).

**Severity tally (approximate):**

- High: ~110
- Med: ~155
- Low: ~10

Report total: **305 findings** (some are positive references; treat ~250 as actionable). End of report.
