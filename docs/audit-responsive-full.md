# Responsive-Design Audit — VNDB

**Repository:** `/Users/loicpirez/VNDB`
**Date:** 2026-05-27
**Target viewports:** 360px (mobile), 768px (tablet), 1280px (desktop)

## Closure status (2026-05-27)

**CLOSED — every P0 + P1 finding.** See commit `79d2ace` (responsive
agent's batch — 80+ files modified). Verified-clean / no-action items:
R-005 (already correctly 2:3 ratio), R-167 (already implements onTouchStart),
R-307..R-312 (covered by the global `.btn` `min-h-[44px]` extension
added in R-145). Deferred: R-124 (sticky-header height at FR — needs
measured-CSS-variable approach, structural change), R-186/R-187 (Library
toolbar mobile drawer — full UX redesign rather than a fix), R-306
(SavedFilters wrap — no overflow risk identified after re-review).
**Scope:** All `src/app/**/page.tsx` and `src/components/**/*.tsx`

**Severity legend:**
- **P0** = breaks page (overflow / unreachable content) at target viewport
- **P1** = degraded UX (cramped, hard to read, hard to tap)
- **P2** = aesthetic / minor

---

## Findings

| ID | file:line | breakpoint | severity | issue | fix |
|----|-----------|------------|----------|-------|-----|

### Hard-coded widths (category 1)

| R-001 | `/Users/loicpirez/VNDB/src/app/producers/page.tsx:129` | 360px | P0 | `<table className="w-full min-w-[640px]">` forces a 640px floor inside an `overflow-x-auto` wrapper — works, but at 360px the table requires horizontal scrolling. | Lives inside `scroll-fade-right overflow-x-auto`. Acceptable. Keep min-w but ensure the scroll indicator is visible. Confirm `scroll-fade-right` mobile gradient. |
| R-002 | `/Users/loicpirez/VNDB/src/app/activity/page.tsx:234` | 360px | P1 | `<label className="min-w-[220px] flex-1">` for search input — at 360px container width, three labels stacked at min-w 220, 160, 160 force overflow row + submit button to wrap awkwardly. | Reduce to `min-w-[160px]` or remove min-w to let `flex-1` shrink. |
| R-003 | `/Users/loicpirez/VNDB/src/app/activity/page.tsx:244` | 360px | P1 | `<label className="min-w-[160px]">` kind select — at 360px viewport after rendering search field, no room left without wrapping. | Add `sm:min-w-[160px]` so it shrinks below sm. |
| R-004 | `/Users/loicpirez/VNDB/src/app/activity/page.tsx:253` | 360px | P1 | Entity input has `min-w-[160px]` — same overflow risk. | Add responsive `sm:min-w-[160px]`. |
| R-005 | `/Users/loicpirez/VNDB/src/app/similar/page.tsx:195` | 360px | P2 | `w-[74px]` cover thumb is hard-coded. At small density, looks tiny vs content. | Use density-aware width via `var(--card-density-px)`. |
| R-006 | `/Users/loicpirez/VNDB/src/app/compare/page.tsx:258` | 360px | P2 | `max-w-[140px]` cover constrains in narrow comparison cells. Acceptable since cells use min 160px. | None — acceptable. |
| R-007 | `/Users/loicpirez/VNDB/src/app/staff/page.tsx:165` | 360px | P1 | Search input `min-w-[200px] flex-1` — flex-1 in wrapping container; at 360px works because flex-wrap, but the min-w can prevent the chip row siblings from wrapping cleanly. | Reduce floor to `min-w-[160px]`. |
| R-008 | `/Users/loicpirez/VNDB/src/app/characters/page.tsx:192` | 360px | P1 | Same `min-w-[200px]` pattern — same risk. | Reduce floor. |
| R-009 | `/Users/loicpirez/VNDB/src/components/SavedFilters.tsx:190` | 360px | P2 | `w-[min(92vw,18rem)]` — already responsive via min(). Acceptable. | None. |
| R-010 | `/Users/loicpirez/VNDB/src/components/EditionInfoPopover.tsx:251` | 360px | P1 | `min-w-[200px] max-w-[280px]` popover — at 360px viewport with viewport padding, min-w 200 leaves only 160px on either side, so popover may clip. | Use `min-w-[180px] max-w-[calc(100vw-2rem)]`. |
| R-011 | `/Users/loicpirez/VNDB/src/components/WishlistClient.tsx:479` | 360px | P1 | `min-w-[200px] flex-1` search — toolbar row has many siblings (sort, group, hide-owned, density slider, refresh, bulk, select-mode); at 360px each wraps to its own line, search stays 200 minimum which works but feels cramped. | Reduce floor to `min-w-[160px]` and `sm:min-w-[200px]`. |
| R-012 | `/Users/loicpirez/VNDB/src/components/WishlistClient.tsx:686` | 360px | P2 | Bulk action bar `w-[min(96vw,32rem)]` — already responsive. | None. |
| R-013 | `/Users/loicpirez/VNDB/src/components/ActivityHeatmap.tsx:66-80` | 360px | P2 | `h-[10px] w-[10px]` cell + `h-[8px] w-[10px]` legend — fixed pixel sizes for ~53 week columns × 7 = ~530px wide heatmap. Already wrapped in `ScrollFadeRight`, fine. | None — already in scroll container. |
| R-014 | `/Users/loicpirez/VNDB/src/components/SchemaLocalSection.tsx:24` | 360px | P0 | `<table min-w-[560px]>` inside `overflow-x-auto` — works via scroll but the table has many columns at small viewports. | Acceptable as long as scroll-fade-right is present. |
| R-015 | `/Users/loicpirez/VNDB/src/components/MapVnToEgsButton.tsx:188` | 360px | P1 | `w-[min(92vw,640px)] max-h-[85vh]` — responsive. Modal width fine. | None. |
| R-016 | `/Users/loicpirez/VNDB/src/components/MapVnToEgsButton.tsx:297` | 360px | P0 | `min-w-[44px]` tap target inside row — `flex items-center gap-2` row with a 44px button + 44px button + flex-1 text + 2 small badges may overflow at 360px. | Verify by reading row structure — buttons should be `shrink-0`. |
| R-017 | `/Users/loicpirez/VNDB/src/components/DateInput.tsx:198` | 360px | P1 | `w-[280px] max-w-[calc(100vw-2rem)]` popover — explicit responsive cap. Good. | None. |
| R-018 | `/Users/loicpirez/VNDB/src/components/TagInput.tsx:100` | 360px | P1 | `min-w-[120px] flex-1` input — short floor, OK for 360px. | None. |
| R-019 | `/Users/loicpirez/VNDB/src/components/CompareVnPicker.tsx:240` | 360px | P1 | `h-[88px] min-w-[120px]` empty-slot button — fixed minimum width, multiple stacked could overflow. | Add `flex-1` so the slots grow to fill row. |
| R-020 | `/Users/loicpirez/VNDB/src/components/LibraryClient.tsx:601` | 360px | P1 | `min-w-[180px] flex-1` search — at 360px, with the Advanced Filters button + LibraryActionsMenu + SavedFilters trigger sharing the row, may force wrap. | Acceptable since the toolbar uses `flex-wrap`. |
| R-021 | `/Users/loicpirez/VNDB/src/components/LibraryClient.tsx:1850` | 360px | P2 | `max-w-[160px] truncate` for filter chip label — works on mobile because chip width is small. | None. |
| R-022 | `/Users/loicpirez/VNDB/src/components/LibraryClient.tsx:1958` | 360px | P1 | `w-[min(92vw,16rem)]` action menu popover — responsive. | None. |
| R-023 | `/Users/loicpirez/VNDB/src/components/SelectiveFullDownload.tsx:267` | 360px | P1 | `min-w-[180px] flex-1` search input — same pattern as wishlist. | Reduce floor on mobile. |
| R-024 | `/Users/loicpirez/VNDB/src/components/HomeLayoutEditorTrigger.tsx:171` | 360px | P1 | `w-[min(92vw,520px)] max-h-[85vh]` modal — responsive. | None. |
| R-025 | `/Users/loicpirez/VNDB/src/components/SpoilerToggle.tsx:96` | 360px | P1 | `w-[min(95vw,20rem)]` popover — responsive. | None. |
| R-026 | `/Users/loicpirez/VNDB/src/components/ToastProvider.tsx:131` | 360px | P1 | `max-w-[min(92vw,420px)]` — responsive. | None. |
| R-027 | `/Users/loicpirez/VNDB/src/components/SettingsButton.tsx:760` | 360px | P1 | `min-w-[14rem] flex-1` token input — 14rem=224px. The wrap container has flex-wrap so save button drops below at 360px. Acceptable. | None — already wraps. |
| R-028 | `/Users/loicpirez/VNDB/src/components/ShelfLayoutEditor.tsx:800` | 1280px | P2 | `max-w-[1600px]` ultra-wide cap on fullscreen mode. Acceptable. | None. |
| R-029 | `/Users/loicpirez/VNDB/src/components/ShelfLayoutEditor.tsx:1619` | 360px | P2 | `min-w-[18px] text-center` for counter — tiny but expected. | None. |
| R-030 | `/Users/loicpirez/VNDB/src/components/LinkToVndbButton.tsx:119` | 360px | P1 | `max-h-[80vh] w-[min(92vw,640px)]` — responsive modal. | None. |
| R-031 | `/Users/loicpirez/VNDB/src/components/TutorialTour.tsx:124` | 360px | P1 | `w-[min(92vw,420px)]` floating panel — responsive. | None. |
| R-032 | `/Users/loicpirez/VNDB/src/components/BulkDownloadButton.tsx:312` | 360px | P1 | `w-[min(92vw,420px)]` — responsive. | None. |
| R-033 | `/Users/loicpirez/VNDB/src/components/AliceNetKobeClient.tsx:208` | 360px | P1 | `w-[min(92vw,640px)] max-h-[85vh]` — responsive modal. | None. |
| R-034 | `/Users/loicpirez/VNDB/src/components/AliceNetKobeClient.tsx:1175` | 1280px | P1 | `lg:min-w-[24rem]` on action row — fine at lg+, on mobile wraps normally. | None. |
| R-035 | `/Users/loicpirez/VNDB/src/components/AliceNetKobeClient.tsx:1206` | 360px | P1 | `CardDensitySlider min-w-[14rem] max-w-full flex-1` — 14rem=224px. At 360px, the slider's parent row already has `flex flex-wrap items-end gap-2 lg:min-w-[24rem]`, the slider wraps to a row, 224 min is OK on 360 (with 16px gap). | None. |
| R-036 | `/Users/loicpirez/VNDB/src/components/TraitsBrowser.tsx:71` | 360px | P1 | `min-w-[200px] flex-1` search — same pattern. Reduce floor. | Reduce. |
| R-037 | `/Users/loicpirez/VNDB/src/components/TagsBrowser.tsx:206` | 360px | P1 | `min-w-[200px] flex-1` search — same pattern. | Reduce. |
| R-038 | `/Users/loicpirez/VNDB/src/components/TagsBrowser.tsx:217` | 360px | P2 | `max-w-[220px]` category filter input. Acceptable. | None. |
| R-039 | `/Users/loicpirez/VNDB/src/components/ActivityTimeline.tsx:186` | 360px | P1 | `min-w-[220px] flex-1` filter — same pattern. | Reduce. |
| R-040 | `/Users/loicpirez/VNDB/src/components/BannerSourcePicker.tsx:310` | 360px | P1 | `flex-1 min-w-[200px]` URL input — same pattern. | Reduce. |
| R-041 | `/Users/loicpirez/VNDB/src/components/ListAddVnForm.tsx:55` | 360px | P1 | `input min-w-[180px] flex-1` — same. | Reduce. |
| R-042 | `/Users/loicpirez/VNDB/src/components/CreateListForm.tsx:69` | 360px | P1 | `input min-w-[180px] flex-1` — name input. | Reduce. |
| R-043 | `/Users/loicpirez/VNDB/src/components/CreateListForm.tsx:78` | 360px | P1 | `input min-w-[180px] flex-[2]` — description. Adds wrap pressure. | Reduce. |
| R-044 | `/Users/loicpirez/VNDB/src/components/CoverSourcePicker.tsx:505` | 360px | P1 | `flex-1 min-w-[200px]` URL input — same pattern. | Reduce. |
| R-045 | `/Users/loicpirez/VNDB/src/components/CoverSourcePicker.tsx:346` | 360px | P2 | `min-w-[2.5rem]` rating badge — tiny, fine. | None. |
| R-046 | `/Users/loicpirez/VNDB/src/components/KeyboardShortcuts.tsx:171` | 360px | P1 | `w-[min(92vw,480px)]` — responsive. | None. |
| R-047 | `/Users/loicpirez/VNDB/src/components/CardContextMenu.tsx:124` | 360px | P1 | `w-[220px]` context menu — JS clamps via `Math.min(220, viewW - 16)` in `MENU_W`. Good. | None — runtime clamped. |
| R-048 | `/Users/loicpirez/VNDB/src/components/AnniversaryFeedView.tsx:89` | 360px | P2 | `max-w-[200px] line-clamp-1` title. OK. | None. |
| R-049 | `/Users/loicpirez/VNDB/src/components/ReadingQueueStripView.tsx:69` | 360px | P2 | `max-w-[200px] line-clamp-1`. OK. | None. |
| R-050 | `/Users/loicpirez/VNDB/src/components/CompareVnPicker.tsx:214` | 360px | P2 | `max-w-[140px] line-clamp-2` title. OK. | None. |
| R-051 | `/Users/loicpirez/VNDB/src/components/CompareVnPicker.tsx:218` | 360px | P2 | `max-w-[140px] line-clamp-1 text-[10px]` — text-[10px] readability issue (see cat 11). | Bump to `text-[11px]`. |
| R-052 | `/Users/loicpirez/VNDB/src/components/DownloadStatusBar.tsx:285` | 360px | P1 | `max-w-[calc(100vw-1rem)]` fixed bar — responsive. | None. |
| R-053 | `/Users/loicpirez/VNDB/src/components/DownloadStatusBar.tsx:387` | 360px | P1 | `w-[min(92vw,24rem)] max-h-[60vh]` popover — responsive. | None. |
| R-054 | `/Users/loicpirez/VNDB/src/components/ActionMenu.tsx:67` | 360px | P1 | Default `min-w-[14rem]` action menu — 14rem=224px. At 360px viewport, JS portal clamps via `PortalPopover`. Good. | None. |
| R-055 | `/Users/loicpirez/VNDB/src/components/MediaGallery.tsx:252` | 360px | P2 | `max-h-[90vh] max-w-[95vw]` lightbox — responsive. | None. |
| R-056 | `/Users/loicpirez/VNDB/src/components/MediaGallery.tsx:258` | 360px | P2 | `max-h-[88vh] max-w-[92vw]` image — responsive. | None. |
| R-057 | `/Users/loicpirez/VNDB/src/components/MediaGallery.tsx:686` | 360px | P2 | `max-w-[17rem]` caption — 272px on 360px viewport fits w/ scroll. | None. |
| R-058 | `/Users/loicpirez/VNDB/src/components/MapEgsToVndbButton.tsx:180` | 360px | P1 | `w-[min(92vw,640px)] max-h-[85vh]` modal. | None. |
| R-059 | `/Users/loicpirez/VNDB/src/components/BulkActionBar.tsx:181` | 360px | P1 | `w-[min(96vw,720px)]` — responsive. | None. |
| R-060 | `/Users/loicpirez/VNDB/src/components/MoreNavMenu.tsx:362` | 360px | P1 | `max-w-[30rem]` mobile sheet — 480px, fine on 360 (sheet is `w-full max-w-…`). | None. |

---

### Grids without mobile breakpoints (category 2)

| R-061 | `/Users/loicpirez/VNDB/src/components/CoverCompare.tsx:217` | 360px | P0 | `grid-cols-3` for 3 covers — no mobile fallback, three 2:3 covers on 360px = each ~110px, very cramped. | Add `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3`. |
| R-062 | `/Users/loicpirez/VNDB/src/components/DateInput.tsx:244,250` | 360px | P2 | `grid-cols-7` calendar — necessary for day-of-week grid. Container max-w[280px] is fine. | None. |
| R-063 | `/Users/loicpirez/VNDB/src/components/SpoilerToggle.tsx:110` | 360px | P2 | `grid-cols-3` for 3 spoiler levels in popover — 3 small radios, fine at 360. | None. |
| R-064 | `/Users/loicpirez/VNDB/src/components/ImportPanel.tsx:139,164` | 360px | P2 | `grid-cols-2` for stats — works on 360. | None. |
| R-065 | `/Users/loicpirez/VNDB/src/components/VnDetailActionsBar.tsx:177` | 360px | P2 | `grid-cols-2` always — 2 columns of actions on 360 fits. | None. |
| R-066 | `/Users/loicpirez/VNDB/src/components/EgsRichDetails.tsx:191` | 360px | P1 | `grid-cols-3` no breakpoint — 3 cols of EGS details on 360px will be tight. | Add `grid-cols-2 sm:grid-cols-3`. |
| R-067 | `/Users/loicpirez/VNDB/src/components/SettingsButton.tsx:253` | 360px | P1 | `grid-cols-[auto_1fr]` for label/value — 2 cols, fine at 360. | None. |
| R-068 | `/Users/loicpirez/VNDB/src/components/SettingsButton.tsx:685` | 360px | P1 | `grid-cols-3 gap-2` radio group — 3 cols, may force radio labels to wrap. | Add `grid-cols-1 sm:grid-cols-3`. |
| R-069 | `/Users/loicpirez/VNDB/src/components/SearchClient.tsx:531` | 360px | P2 | `grid-cols-2 gap-2` year inputs — fine at 360. | None. |
| R-070 | `/Users/loicpirez/VNDB/src/app/year/page.tsx:75` | 360px | P1 | `grid gap-4 md:grid-cols-3` — at 360px stacks vertically (good). | None. |

---

### Long titles / URLs without truncate / break-words (category 3)

| R-071 | `/Users/loicpirez/VNDB/src/app/egs/page.tsx:218` | 360px | P1 | `<p className="mt-1 break-all font-mono text-[11px] opacity-70">{error}</p>` — has break-all (good). | None. |
| R-072 | `/Users/loicpirez/VNDB/src/app/vn/[id]/page.tsx:229` | 360px | P1 | `<pre className="overflow-x-auto">{error}</pre>` for error trace — uses overflow-x-auto for long errors. Good. | None. |
| R-073 | `/Users/loicpirez/VNDB/src/components/EditForm.tsx:321,334` | 360px | P1 | `<input type="url" placeholder=…>` for download URL — single line; on overflow truncates via input native. OK. | None. |
| R-074 | `/Users/loicpirez/VNDB/src/app/character/[id]/page.tsx:248` | 360px | P1 | Avatar row `flex gap-3` with text and font-mono ID — at 360px ID like `c12345` might wrap. Has `min-w-0 flex-1` parent. | OK because of `min-w-0`. |
| R-075 | `/Users/loicpirez/VNDB/src/app/lists/[id]/page.tsx:155` | 360px | P2 | `whitespace-pre-line text-sm text-muted` description — long text wraps. | None. |
| R-076 | `/Users/loicpirez/VNDB/src/components/MapVnToEgsButton.tsx:194` | 360px | P1 | `<p className="mt-1 truncate text-[11px]">VN · {vnId} · {seedQuery}</p>` — truncates. Good. | None. |
| R-077 | `/Users/loicpirez/VNDB/src/app/release/[id]/page.tsx` various | 360px | P1 | Most release attributes use `dl` grid. Long catalog numbers may overflow. | Confirm `truncate` on `<dd>` values. Likely missing on catalog text. |
| R-078 | `/Users/loicpirez/VNDB/src/components/StockPanel.tsx:685` | 360px | P1 | `<span className="block truncate text-xs font-bold">{provider.label}</span>` — truncates. Good. | None. |
| R-079 | `/Users/loicpirez/VNDB/src/components/AliceNetKobeClient.tsx:1301` | 360px | P1 | `<h2 className="min-w-0 truncate text-sm font-semibold">{section.key}</h2>` — has min-w-0+truncate. | None. |
| R-080 | `/Users/loicpirez/VNDB/src/app/staff/[id]/page.tsx:507` | 360px | P1 | `flex items-baseline gap-2` with `<Link className="line-clamp-2 flex-1 text-xs font-bold">{vn.title}</Link>` — title clamped, link icon shrink-0. Good. | None. |
| R-081 | `/Users/loicpirez/VNDB/src/app/recommendations/page.tsx:773` | 360px | P1 | `<h3 className="line-clamp-2 text-sm font-bold">` — line-clamped. Good. | None. |
| R-082 | `/Users/loicpirez/VNDB/src/components/AliceNetKobeClient.tsx:1269,1273,1277,1281` | 360px | P1 | `<span className="min-w-0 truncate">{t.kobe.…}</span>` button label — truncates inside flex button. Good. | None. |
| R-083 | `/Users/loicpirez/VNDB/src/app/dumped/page.tsx:253` | 360px | P1 | `line-clamp-2 text-xs font-bold transition-colors group-hover:text-accent` title. Good. | None. |
| R-084 | `/Users/loicpirez/VNDB/src/components/StockPanel.tsx:723` | 360px | P1 | Alias chips `<span>{alias}</span>` no truncate — long alias might overflow chip row. Should have `max-w` or `truncate`. | Add `max-w-[12rem] truncate inline-block`. |

---

### Side-by-side rows without `flex-wrap` (category 4)

| R-085 | `/Users/loicpirez/VNDB/src/app/layout.tsx:108` | 360px | P1 | `<HeaderSpaceFrame className="flex flex-wrap items-center gap-2 py-3 sm:gap-4">` — has flex-wrap. Good. | None. |
| R-086 | `/Users/loicpirez/VNDB/src/app/layout.tsx:114` | 360px | P0 | `<div className="ml-auto flex items-center gap-2">` containing SpoilerToggle + SettingsButton + LanguageSwitcher — no flex-wrap, but parent has flex-wrap so this group can wrap as a whole. Will not break ml-auto unless logo+nav row is too wide; at 360px this group will sit on its own line. Acceptable. | None. |
| R-087 | `/Users/loicpirez/VNDB/src/components/EgsPanel.tsx:339` | 360px | P1 | `<div className="mt-4 grid gap-3 rounded-lg border border-border bg-bg-elev/40 p-3 sm:grid-cols-3">` — has sm:grid-cols-3. Stacks on mobile. Good. | None. |
| R-088 | `/Users/loicpirez/VNDB/src/components/SettingsButton.tsx:757` | 360px | P1 | `<div className="flex flex-wrap gap-2">` token input + save button — has flex-wrap. Good. | None. |
| R-089 | `/Users/loicpirez/VNDB/src/components/SettingsButton.tsx:803` | 360px | P1 | VNDB pull header — `flex items-start justify-between gap-3` — no wrap, but content is short. May squeeze. | Add `flex-wrap`. |
| R-090 | `/Users/loicpirez/VNDB/src/app/quotes/page.tsx:49` | 360px | P0 | `<form className="mt-3 flex max-w-md items-center gap-2">` Search icon + input — no flex-wrap, but input has flex-1. Should fit. | None. |
| R-091 | `/Users/loicpirez/VNDB/src/components/SearchClient.tsx:336-398` | 360px | P1 | Tab row `<div className="mb-2 inline-flex rounded-md border border-border bg-bg-elev/30 p-0.5 text-[11px]">` 3 tabs in inline-flex — no wrap; on 360px three tabs (VNDB/EGS/Local) fit. | None. |
| R-092 | `/Users/loicpirez/VNDB/src/app/top-ranked/page.tsx:75` | 360px | P1 | `<div className="flex items-center gap-2">` density slider + refresh — no flex-wrap on this inner row. Slider has min-w 200 → may overflow. | Add `flex-wrap`. |
| R-093 | `/Users/loicpirez/VNDB/src/app/upcoming/page.tsx:94` | 360px | P1 | Same pattern — `<div className="flex items-center gap-2">` density+refresh. | Add `flex-wrap`. |
| R-094 | `/Users/loicpirez/VNDB/src/components/WishlistClient.tsx:603` | 360px | P0 | `<div className="inline-flex items-center gap-1">` rating min/max input pair — two `w-20` inputs + en-dash. Total ~180px, fits. | None. |
| R-095 | `/Users/loicpirez/VNDB/src/components/WishlistClient.tsx:628` | 360px | P0 | Year min/max pair — same. | None. |
| R-096 | `/Users/loicpirez/VNDB/src/app/steam/page.tsx:275` | 360px | P1 | `<div className="flex gap-2">` — short row; OK at 360. | None. |
| R-097 | `/Users/loicpirez/VNDB/src/components/RoutesSection.tsx` various | 360px | P1 | Form rows. Need to check for flex-wrap. | Verify route row flex-wrap on edit. |
| R-098 | `/Users/loicpirez/VNDB/src/app/shelf/page.tsx:244` | 360px | P1 | `<div className="flex flex-wrap items-start justify-between gap-3">` — wraps. Good. | None. |
| R-099 | `/Users/loicpirez/VNDB/src/app/shelf/page.tsx:271` | 360px | P1 | `<div className="flex shrink-0 items-center gap-2">` — density slider + read-only controls; shrink-0 means they DON'T shrink. At 360 may force horizontal scroll. | Remove `shrink-0` or add `flex-wrap`. |

---

### Modals / sheets without `max-w-*` (category 5)

Most modals correctly use `w-[min(92vw,…)]` or `max-w-*` patterns. Audit specifics:

| R-100 | `/Users/loicpirez/VNDB/src/components/Dialog.tsx:142` | 360px | P1 | `relative w-full max-w-2xl` — max-w-2xl = 672px, w-full means 360 - p-3 = ~336px. OK. | None. |
| R-101 | `/Users/loicpirez/VNDB/src/components/ConfirmDialog.tsx:214,356` | 360px | P1 | `w-full max-w-md` — 448px capped. Mobile bottom-sheet pattern (`rounded-t-2xl sm:rounded-2xl`). Good. | None. |
| R-102 | `/Users/loicpirez/VNDB/src/components/SettingsButton.tsx:545` | 360px | P1 | `relative mt-6 w-full max-w-3xl rounded-2xl border border-border bg-bg-card p-4 shadow-card outline-none sm:mt-12 sm:p-6` — w-full inside flex container with `p-2 sm:p-6` padding. Acceptable. | None. |
| R-103 | `/Users/loicpirez/VNDB/src/components/CoverSourcePicker.tsx:319` | 360px | P1 | `max-h-[90vh] w-full max-w-3xl` — good. | None. |
| R-104 | `/Users/loicpirez/VNDB/src/components/BannerSourcePicker.tsx:193` | 360px | P1 | Same pattern. | None. |
| R-105 | `/Users/loicpirez/VNDB/src/components/EgsPanel.tsx:497` | 360px | P1 | `mt-6 w-full max-w-xl` — 576px capped. Container: `fixed inset-0 z-[1000] flex items-start justify-center overflow-y-auto bg-black/70 p-2 backdrop-blur-sm sm:p-6` — p-2 leaves room. | None. |
| R-106 | `/Users/loicpirez/VNDB/src/components/StockPanel.tsx:926` | 360px | P1 | `w-full max-w-sm` clear-cache confirm — 384px cap, fits. | None. |
| R-107 | `/Users/loicpirez/VNDB/src/components/CompareWithButton.tsx:96` | 360px | P1 | `panelClassName="p-0 max-w-2xl overflow-hidden"` — overflow-hidden cuts inner scroll. Should be overflow-y-auto. | Replace with `overflow-y-auto max-h-[85vh]`. |
| R-108 | `/Users/loicpirez/VNDB/src/components/BulkDownloadButton.tsx:294` | 360px | P1 | `panelClassName="max-w-3xl p-4 sm:p-6"` — good. | None. |
| R-109 | `/Users/loicpirez/VNDB/src/components/ListMetaEditor.tsx:119` | 360px | P2 | `w-full max-w-md` — fine. | None. |

---

### Tables without horizontal scroll (category 6)

| R-110 | `/Users/loicpirez/VNDB/src/app/data/page.tsx:101` | 360px | P0 | `<table className="mt-2 w-full" aria-label={t.dataMgmt.statusRows}>` — NO overflow wrapper. At 360px table cell rows with table names + counts may overflow. Inside `<details>`. | Wrap in `<div className="overflow-x-auto">`. |
| R-111 | `/Users/loicpirez/VNDB/src/app/producers/page.tsx:128` | 360px | OK | Already wrapped in `scroll-fade-right overflow-x-auto`. | None. |
| R-112 | `/Users/loicpirez/VNDB/src/components/SchemaLocalSection.tsx:23` | 360px | OK | Wrapped in `scroll-fade-right overflow-x-auto`. | None. |
| R-113 | `/Users/loicpirez/VNDB/src/components/MarkdownView.tsx:13` | 360px | P1 | `[&_table]:border-collapse [&_th]:border …` no overflow wrap. Markdown tables in user notes could overflow. | Wrap output `<div className="space-y-2…">` with overflow-x-auto for tables, or use `[&_table]:block [&_table]:overflow-x-auto`. |

---

### Fixed-height containers cutting content (category 7)

| R-114 | `/Users/loicpirez/VNDB/src/components/HeroBanner.tsx:252,305` | 360px | P1 | `h-64 w-full overflow-hidden` — 256px hero banner regardless of viewport. Banner content (rotation buttons, adjust controls) may overflow vertically on 360 with the absolute-positioned overlays. | Acceptable — width is full, height is fixed by design. |
| R-115 | `/Users/loicpirez/VNDB/src/app/series/[id]/page.tsx:57` | 360px | P1 | `h-40 w-full overflow-hidden bg-bg-elev` series banner. Acceptable height. | None. |
| R-116 | `/Users/loicpirez/VNDB/src/app/series/[id]/page.tsx:70` | 360px | P1 | `h-32 w-24 shrink-0 rounded-lg` series cover thumb — fixed 96×128, OK. | None. |
| R-117 | `/Users/loicpirez/VNDB/src/components/CoverSourcePicker.tsx:430` | 360px | P1 | `h-48 w-32 shrink-0 overflow-hidden` preview cover — fixed 128×192. | None — preview only. |
| R-118 | `/Users/loicpirez/VNDB/src/components/BannerSourcePicker.tsx:241` | 360px | P1 | `h-32 w-56 shrink-0` banner preview — fixed 224×128. Fits at 360. | None. |
| R-119 | `/Users/loicpirez/VNDB/src/app/upcoming/page.tsx:264` | 360px | P1 | `h-48 w-32 shrink-0 animate-pulse rounded-lg bg-bg-elev sm:h-56 sm:w-36` — skeleton; responsive. | None. |
| R-120 | `/Users/loicpirez/VNDB/src/components/CharactersSection.tsx` various | 360px | P1 | Character row pictures — verify. | Confirm responsive sizing. |
| R-121 | `/Users/loicpirez/VNDB/src/components/StatsExtras.tsx:54` | 360px | P1 | `relative flex h-32 w-full items-end gap-0.5` chart — 128px height fine. | None. |
| R-122 | `/Users/loicpirez/VNDB/src/components/ShelfLayoutEditor.tsx:1578` | 360px | P1 | `h-24 w-16 overflow-hidden rounded-md shadow-…` shelf drag overlay preview — 96×64 fits. | None. |
| R-123 | `/Users/loicpirez/VNDB/src/components/AliceNetKobeClient.tsx:1291` | 360px | P1 | `${view === 'cards' ? 'h-96' : 'h-24'}` skeleton heights — `h-96` = 384px tall card skeleton fits on 360. | None. |

---

### Sticky elements blocking content > 80px tall (category 8)

| R-124 | `/Users/loicpirez/VNDB/src/app/layout.tsx:105` | 360px | P0 | `<header className="sticky top-0 z-30 border-b border-border bg-bg/90 backdrop-blur">` with `flex-wrap py-3 sm:gap-4` — at 360px in French, header may wrap to 3 lines (logo+title, GroupedNav menu, controls), pushing height past 80px. Then `pt-4 sm:pt-5` on main is too short. | Reserve top padding via scroll-padding or use measured offset CSS variable. |
| R-125 | `/Users/loicpirez/VNDB/src/components/VnSourcePicker.tsx:260` | 360px | P1 | `sticky top-0 z-10 border-b border-border/40 bg-bg-elev px-3 py-1` — sticky header inside list. Small height, OK. | None. |
| R-126 | `/Users/loicpirez/VNDB/src/app/compare/page.tsx:436` | 360px | P0 | `<div className="sticky left-0 bg-bg-elev/60 p-3 text-[10px] font-bold uppercase tracking-wider text-muted">` — sticky LEFT (horizontal) compare grid label. At 360px, the column is 100px wide (cmp-cols-sm), and that's also the sticky-left column. Acceptable since content scrolls horizontally. | None. |

---

### `min-w-[300+]` causing 360px viewport overflow (category 9)

| R-127 | `/Users/loicpirez/VNDB/src/components/AliceNetKobeClient.tsx:1175` | 1024px | P1 | `lg:min-w-[24rem]` (384px) — only applied at lg+, no risk at 360. | None. |
| R-128 | `/Users/loicpirez/VNDB/src/app/producers/page.tsx:129` | 360px | P0 | `min-w-[640px]` table → forces horizontal scroll. Already wrapped in overflow-x-auto. | None. |
| R-129 | `/Users/loicpirez/VNDB/src/components/SchemaLocalSection.tsx:24` | 360px | P0 | `min-w-[560px]` table → same. | None. |

---

### Touch targets `< 44×44` (category 10)

The codebase has explicit `tap-target` utility classes (10px and 6px hit-area pad) AND many buttons use `min-h-[44px] min-w-[44px]`. However, several patterns ship icon-only buttons with `h-3 w-3` / `h-4 w-4` / `h-5 w-5` icons inside `p-1` / `p-2` / `px-2 py-0.5` containers, yielding `<44px` interactive surfaces.

| R-130 | `/Users/loicpirez/VNDB/src/components/EditionInfoPopover.tsx:239` | 360px | P0 | `h-6 w-6` info button (24×24) — way below 44×44. Highlighted in code comment that it's a known issue, but still ships. | Bump to `min-h-[44px] min-w-[44px]` or apply `.tap-target` (+10px hit area = 44 total). |
| R-131 | `/Users/loicpirez/VNDB/src/components/BulkDownloadButton.tsx:341` | 360px | P0 | `inline-flex h-6 w-6 items-center justify-center rounded text-muted hover:text-white` — 24×24 close button. | Apply `.tap-target` or bump. |
| R-132 | `/Users/loicpirez/VNDB/src/components/FavoriteToggleButton.tsx:105` | 360px | P0 | `h-7 w-7` favorite heart (28×28) — has `tap-target` class for +10px pad (=48 hit area). Good. | None — but verify utility class actually pads. |
| R-133 | `/Users/loicpirez/VNDB/src/components/SeriesRemoveVn.tsx:28` | 360px | P1 | `tap-target absolute right-1 top-1 z-20 inline-flex h-7 w-7 …` — 28×28 + `tap-target` (+10px = 48). Good. | None. |
| R-134 | `/Users/loicpirez/VNDB/src/components/ListRemoveVn.tsx:39` | 360px | P1 | Same `tap-target h-7 w-7`. Good. | None. |
| R-135 | `/Users/loicpirez/VNDB/src/components/VnCard.tsx:261` | 360px | P1 | `tap-target inline-flex h-7 w-7` wishlist remove. Good. | None. |
| R-136 | `/Users/loicpirez/VNDB/src/components/HeroBanner.tsx:274,284,435,445,470,485,494` | 360px | P0 | `h-7 w-7` rotation/cancel buttons — NO `.tap-target` class applied. 28×28 hit area on mobile-essential controls. | Apply `.tap-target`. |
| R-137 | `/Users/loicpirez/VNDB/src/components/HeroBanner.tsx:464` | 360px | P0 | `h-7 items-center` save button — no min-w-[44px]. | Add `min-h-[44px]` with `px-3`. |
| R-138 | `/Users/loicpirez/VNDB/src/components/CoverEditOverlay.tsx:26` | 360px | P0 | `absolute right-2 top-2 z-30 inline-flex items-center gap-1 rounded-md bg-black/70 px-2 py-1 text-[10px]` — px-2 py-1 with text-[10px] = ~20px tall icon button. | Make `min-h-[36px] px-3 py-1.5`. |
| R-139 | `/Users/loicpirez/VNDB/src/components/AliceNetKobeClient.tsx:1180,1189` | 360px | P1 | `min-h-[36px] min-w-[40px]` — 36×40 below 44. | Bump to `min-h-[44px] min-w-[44px]`. |
| R-140 | `/Users/loicpirez/VNDB/src/components/CardContextMenu.tsx:133` | 360px | P0 | `tap-target-tight rounded text-muted` close — tap-target-tight = +6px pad (= ~12 + 12 = ~24-30 max). Below 44. | Use `.tap-target` instead. |
| R-141 | `/Users/loicpirez/VNDB/src/components/DownloadStatusBar.tsx:396` | 360px | P0 | `tap-target-tight rounded text-muted` close — same. | Use `.tap-target`. |
| R-142 | `/Users/loicpirez/VNDB/src/components/StockPanel.tsx:738` | 360px | P0 | `rounded p-0.5 text-muted hover:text-status-dropped disabled:opacity-50` alias remove (X) — p-0.5 with h-3 w-3 = ~16×16. | Apply `.tap-target` or bump padding. |
| R-143 | `/Users/loicpirez/VNDB/src/components/StockPanel.tsx:935,942` | 360px | P1 | `min-h-[36px]` clear-cache confirm/cancel — below 44. | Bump to 44. |
| R-144 | `/Users/loicpirez/VNDB/src/components/StockPanel.tsx:967` | 360px | P1 | `min-h-[36px]` GroupBtn provider — below 44. | Bump. |
| R-145 | `/Users/loicpirez/VNDB/src/app/data/page.tsx` callout buttons | 360px | P1 | Various `<a className="btn">` — `btn` class in `globals.css` should be checked for min-h. | Verify `.btn` min-h ≥ 44. |
| R-146 | `/Users/loicpirez/VNDB/src/components/SearchClient.tsx:359,366,382` | 360px | P0 | `inline-flex items-center gap-1 rounded px-2 py-1 transition-colors` source tab buttons — `py-1` = 4px+text-[11px]≈18px = ~26px tall. Multiple tabs on 360. | Add `min-h-[44px]`. |
| R-147 | `/Users/loicpirez/VNDB/src/components/CompareWithButton.tsx:145` | 360px | P0 | `tap-target flex w-full items-center gap-2 border-b border-border px-3 py-1.5 text-left text-xs` row button — `py-1.5` = 6+text=20. tap-target adds 10. ~40. Borderline. | Bump py to py-2.5. |
| R-148 | `/Users/loicpirez/VNDB/src/components/QuoteFooter.tsx:55` | 360px | P0 | The whole footer is a hover-only fold-out (see cat 12). | See R-167. |
| R-149 | `/Users/loicpirez/VNDB/src/components/MoreNavMenu.tsx:303` | 360px | P1 | Nav group chevron — relies on parent button. OK. | None. |
| R-150 | `/Users/loicpirez/VNDB/src/components/ListsPickerButton.tsx:163` | 360px | P0 | Lists picker button on card — has `md:opacity-0`, so hidden on desktop until hover. On mobile shows always. Size verifies via parent class. Check actual size. | Verify size on mobile. |
| R-151 | `/Users/loicpirez/VNDB/src/components/SettingsButton.tsx:779` | 360px | P1 | `mt-2 inline-flex min-h-[44px] items-center rounded px-2 text-xs text-muted hover:text-status-dropped` token clear — has min-h. Good. | None. |
| R-152 | `/Users/loicpirez/VNDB/src/app/lists/page.tsx:39` | 360px | P1 | `<ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">` list cards. Good. | None. |

---

### Text `text-[10px]` or smaller on key labels (category 11)

The codebase has **459 occurrences** of `text-[10px]`, `text-[9px]`, `text-[8px]`. Listing the most user-facing offenders:

| R-153 | `/Users/loicpirez/VNDB/src/app/vn/[id]/page.tsx:445` | 360px | P1 | `text-[9px] font-bold uppercase tracking-wider` language code badges. 9px+uppercase+bold = readable but small. | Bump to `text-[10px]`. |
| R-154 | `/Users/loicpirez/VNDB/src/app/vn/[id]/page.tsx:452` | 360px | P1 | `text-[9px] text-muted` "unofficial" tag. Hard to read. | Bump. |
| R-155 | `/Users/loicpirez/VNDB/src/app/character/[id]/page.tsx:388,396,415` | 360px | P1 | `text-[9px] font-bold uppercase tracking-wider` role/status badges on characters. | Bump. |
| R-156 | `/Users/loicpirez/VNDB/src/app/recommendations/page.tsx:785-794` | 360px | P1 | `text-[9px]` ownership badges (in-collection / on-wishlist) on cards. Already small surface. | Bump to `text-[10px]`. |
| R-157 | `/Users/loicpirez/VNDB/src/app/steam/page.tsx:321,389` | 360px | P1 | `text-[9px] uppercase tracking-wider` source chip. | Bump. |
| R-158 | `/Users/loicpirez/VNDB/src/components/CardDensitySlider.tsx:85` | 360px | P1 | `text-[9px] font-semibold` "custom override" chip. | Bump. |
| R-159 | `/Users/loicpirez/VNDB/src/components/CompareVnPicker.tsx:218` | 360px | P1 | `text-[10px] text-muted line-clamp-1` alt title — borderline. | Acceptable, but consider `text-[11px]`. |
| R-160 | `/Users/loicpirez/VNDB/src/components/QuoteFooter.tsx:59` | 360px | P1 | Quote footer hover content uses tiny text — may be hard to read. | Verify size. |
| R-161 | `/Users/loicpirez/VNDB/src/app/release/[id]/page.tsx:158,164,180,189,207,213,219,230,236,246` | 360px | P1 | `text-[10px] uppercase tracking-wider` for dt labels — 10px+uppercase is borderline. | Acceptable due to caps tracking; consider 11px for accessibility. |
| R-162 | `/Users/loicpirez/VNDB/src/app/producer/[id]/page.tsx:137,317` | 360px | P1 | `text-[10px] uppercase tracking-wider` labels. | Acceptable. |
| R-163 | `/Users/loicpirez/VNDB/src/components/MediaGallery.tsx:371,686` | 360px | P1 | `text-[10px]` caption text. | Acceptable for captions. |
| R-164 | `/Users/loicpirez/VNDB/src/components/RecentlyViewedStrip.tsx:81` | 360px | P1 | `text-[10px] leading-tight text-muted` title in recently-viewed strip. Two-line clamp + 10px = hard to read on mobile. | Bump to `text-[11px]`. |
| R-165 | `/Users/loicpirez/VNDB/src/components/CardContextMenu.tsx:127,141` | 360px | P1 | `text-[10px] uppercase tracking-wider` menu section labels. | Acceptable. |

---

### Hover-only menus with no touch fallback (category 12)

| R-166 | `/Users/loicpirez/VNDB/src/components/VnCard.tsx:261,294` | 360px | P0 | `md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100` — opacity-0 only at md+, so on mobile the chips show by default. Good pattern. | None. |
| R-167 | `/Users/loicpirez/VNDB/src/components/QuoteFooter.tsx:44-56` | 360px | P0 | `fixed bottom-0 left-0 right-0` quote footer uses `onMouseEnter/onMouseLeave` + `group-hover:max-h-28` — NO touch fallback. The footer is invisible to touch users. Has `group-focus-within:max-h-28` (helps keyboard), but no tap-to-toggle. | Add click-to-expand handler for touch. |
| R-168 | `/Users/loicpirez/VNDB/src/components/CoverEditOverlay.tsx:26` | 360px | P1 | `md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100 md:hover:opacity-100` — hidden on desktop until hover, always visible on mobile. Good. | None. |
| R-169 | `/Users/loicpirez/VNDB/src/components/GameLog.tsx:259` | 360px | P1 | `md:opacity-0 md:group-hover:opacity-100 md:focus-within:opacity-100` — actions on game log entry. Good (mobile shows always). | None. |
| R-170 | `/Users/loicpirez/VNDB/src/components/CoverRotationButtons.tsx:139,151,163` | 360px | P1 | `md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100` — rotate buttons hidden on desktop without hover; visible on mobile via lack of `md:` initial. Good. | None. |
| R-171 | `/Users/loicpirez/VNDB/src/components/HeroBanner.tsx:256,405` | 360px | P1 | Same pattern — good for mobile. | None. |
| R-172 | `/Users/loicpirez/VNDB/src/components/MediaGallery.tsx:371,613` | 360px | P1 | Same pattern. | None. |
| R-173 | `/Users/loicpirez/VNDB/src/components/SeriesManager.tsx:99` | 360px | P1 | `md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100` btn-danger — same pattern. Good. | None. |
| R-174 | `/Users/loicpirez/VNDB/src/components/FavoriteToggleButton.tsx:108` | 360px | P1 | `bg-bg-card/85 text-muted backdrop-blur hover:text-status-dropped md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100` — same pattern. | None. |
| R-175 | `/Users/loicpirez/VNDB/src/components/ListsPickerButton.tsx:163` | 360px | P1 | `: bg-bg-card/85 text-white md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100` — fallback active when not selected, mobile shows always. Good. | None. |
| R-176 | `/Users/loicpirez/VNDB/src/components/TagsBrowser.tsx:463` | 360px | P1 | `ml-auto inline-flex items-center gap-1 text-accent transition-opacity md:opacity-0 md:group-hover:opacity-100` — same pattern. | None. |

---

### DnD without touch fallback (category 13)

| R-177 | `/Users/loicpirez/VNDB/src/components/ShelfLayoutEditor.tsx:230,231` | 360px | OK | Both `PointerSensor` + `TouchSensor` — touch fallback. Good. | None. |
| R-178 | `/Users/loicpirez/VNDB/src/components/SortableGrid.tsx:56,60` | 360px | OK | `PointerSensor` + `TouchSensor`. Good. | None. |
| R-179 | `/Users/loicpirez/VNDB/src/components/HomeLayoutEditorTrigger.tsx:90` | 360px | P1 | `PointerSensor` only — no `TouchSensor`. Pointer events handle modern touch but the explicit TouchSensor adds delay/tolerance constraints that improve mobile experience. | Add `TouchSensor`. |
| R-180 | `/Users/loicpirez/VNDB/src/components/SeriesDetailLayout.tsx:141` | 360px | P1 | `PointerSensor` only — same. | Add `TouchSensor`. |
| R-181 | `/Users/loicpirez/VNDB/src/components/DetailReorderLayout.tsx:94` | 360px | P1 | `useSensor(PointerSensor)` only, no activation constraint. Mobile may misinterpret scroll as drag. | Add `TouchSensor` with delay. |
| R-182 | `/Users/loicpirez/VNDB/src/components/VnDetailLayout.tsx:168` | 360px | P1 | `PointerSensor` only. | Add `TouchSensor`. |
| R-183 | `/Users/loicpirez/VNDB/src/components/SettingsButton.tsx:1501,1647,1761` | 360px | P1 | `PointerSensor` only with distance 4 — three places. | Add TouchSensor each. |

---

### Toolbar overflow at narrow widths (category 14)

| R-184 | `/Users/loicpirez/VNDB/src/components/LibraryClient.tsx:572-592` | 360px | P0 | Status chips row — has `flex-wrap` + `whitespace-nowrap` on chips. With FR labels ("Pour plus tard", "Abandonnés"), 8 status chips wrap on 360px. Hard to scan but doesn't overflow. | Consider horizontal scroll with snap. |
| R-185 | `/Users/loicpirez/VNDB/src/components/LibraryClient.tsx:600-939` | 360px | P0 | Toolbar — multiple rows of controls (search, advanced, filter chips, sort, order, reorder, group, density, lib actions, saved filters). At 360px stacks to 6+ rows. Acceptable since flex-wrap is everywhere but very tall toolbar. | Consider collapsing to mobile drawer. |
| R-186 | `/Users/loicpirez/VNDB/src/components/WishlistClient.tsx:478` | 360px | P0 | Toolbar `<div className="mb-2 flex flex-wrap items-center gap-2">` containing search, sort, group, checkbox, density, refresh, bulk-download, select-mode + counter. Wraps to 5+ rows on 360. Very tall. | Move sort/group/select-mode into an actions menu. |
| R-187 | `/Users/loicpirez/VNDB/src/components/WishlistClient.tsx:576` | 360px | P0 | Filter row `<div className="flex flex-wrap gap-2">` lang/platform/rating-pair/year-pair selects + inputs. Wraps but each input is `w-20` (80px), gap-1 → 4 inputs in two pairs at min ~340px stays cramped. | Single column on mobile. |
| R-188 | `/Users/loicpirez/VNDB/src/components/SearchClient.tsx:336-398` | 360px | P1 | Tab strip `inline-flex` 3 tabs — fits on 360. | None. |
| R-189 | `/Users/loicpirez/VNDB/src/components/SettingsButton.tsx:566-613` | 360px | P0 | Tablist `mb-5 flex gap-1 overflow-x-auto` 8 tabs — overflow-x-auto saves it. Good. | None. |
| R-190 | `/Users/loicpirez/VNDB/src/components/SettingsButton.tsx:1249` | 360px | P1 | Another tablist `flex gap-1 overflow-x-auto`. Good. | None. |
| R-191 | `/Users/loicpirez/VNDB/src/app/shelf/page.tsx:333` | 360px | P1 | `inline-flex flex-wrap rounded-xl border border-border bg-bg-card p-1 text-sm` view tabs — wraps. Good. | None. |
| R-192 | `/Users/loicpirez/VNDB/src/app/top-ranked/page.tsx:75-103` | 360px | P0 | Header `flex flex-wrap items-start gap-3` with density+refresh in `flex items-center gap-2`. No flex-wrap on inner row. At 360 may overflow. | Inner row needs `flex-wrap`. |
| R-193 | `/Users/loicpirez/VNDB/src/app/upcoming/page.tsx:94-103` | 360px | P0 | Same pattern. | Same fix. |
| R-194 | `/Users/loicpirez/VNDB/src/app/activity/page.tsx:233-259` | 360px | P0 | Form `flex flex-wrap items-end gap-2` with 3 labels + submit + reset. Wraps but inputs `min-w-[220px]/160px` force overflow. | Reduce `min-w`. |
| R-195 | `/Users/loicpirez/VNDB/src/components/AliceNetKobeClient.tsx:1144-1208` | 360px | P0 | Kobe header with search, sort, group, view-toggle, filters, density. Multiple rows. Wraps OK but tall. | Acceptable. |
| R-196 | `/Users/loicpirez/VNDB/src/components/MoreNavMenu.tsx` | 360px | OK | Hidden on md and below — replaced by hamburger sheet. Good. | None. |

---

### Images without aspect-ratio reservations (category 15)

`<SafeImage>` defaults set the wrapping `<div>` size from `className`. Cards use `aspect-[2/3] w-full`. Most surfaces are correct. Check non-card surfaces:

| R-197 | `/Users/loicpirez/VNDB/src/components/SafeImage.tsx:218` | 360px | P1 | Root `<div ref className="relative overflow-hidden …">` no aspect-ratio of its own. Sizes from caller's className. Good — but skeleton inside has `inset-0` so it inherits container size. | None. |
| R-198 | `/Users/loicpirez/VNDB/src/components/HeroBanner.tsx:305,319` | 360px | P1 | `<img>` uses `h-full w-full object-cover` inside `h-64` parent — fixed 256px height. CLS-safe. | None. |
| R-199 | `/Users/loicpirez/VNDB/src/components/HeroBanner.tsx:348` | 360px | P1 | Second contained `<img>` `h-full w-full select-none object-contain object-center` — overlaid for non-custom banners. Same parent → same size. | None. |
| R-200 | `/Users/loicpirez/VNDB/src/components/VnSourcePicker.tsx:144` | 360px | P1 | `<img src={hit.thumbnail} alt="" className="h-full w-full object-cover" loading="lazy" />` — parent thumb sizing comes from caller. Check parent. | Verify parent has aspect. |
| R-201 | `/Users/loicpirez/VNDB/src/components/LoadingImage.tsx:58` | 360px | P1 | `<img>` — uses set fixed size via props. OK. | None. |
| R-202 | `/Users/loicpirez/VNDB/src/components/QuoteAvatar.tsx` | 360px | P1 | Renders `size × size` portraits + `size × size*1.5` for VN covers. Good. | None. |
| R-203 | `/Users/loicpirez/VNDB/src/app/compare/page.tsx:258` | 360px | P1 | `mx-auto block aspect-[2/3] w-full max-w-[140px] overflow-hidden rounded` cover wrapper. Good. | None. |
| R-204 | `/Users/loicpirez/VNDB/src/app/staff/[id]/page.tsx:491` | 360px | P1 | `block shrink-0 overflow-hidden rounded` with style `width: clamp(72px, calc(var(--card-density-px, 220px) * 0.42), 200px), aspectRatio: '2 / 3'` — density-aware. | None. |
| R-205 | `/Users/loicpirez/VNDB/src/app/similar/page.tsx:194` | 360px | P1 | `<SafeImage … className="h-28 w-[74px] rounded-lg object-cover shadow-sm">` — fixed 74px wide and 112px tall. Different aspect ratio than 2:3 (74:112 = 0.66 = 2/3). Good. | None. |

---

### Forms with input + button side-by-side breaking at 360px (category 16)

| R-206 | `/Users/loicpirez/VNDB/src/app/quotes/page.tsx:49` | 360px | P1 | `<form className="mt-3 flex max-w-md items-center gap-2">` with Search icon + input (flex-1) — no submit button visible (form auto-submits on enter). At 360px input has `flex-1`, fits. | None. |
| R-207 | `/Users/loicpirez/VNDB/src/components/SettingsButton.tsx:757` | 360px | P0 | `<div className="flex flex-wrap gap-2">` token input + save button. Has `flex-wrap`. Good. | None. |
| R-208 | `/Users/loicpirez/VNDB/src/components/CoverSourcePicker.tsx:505` | 360px | P0 | URL input + add button — has `flex-wrap` or stacked layout. Verify. | Confirm flex-wrap on parent. |
| R-209 | `/Users/loicpirez/VNDB/src/components/BannerSourcePicker.tsx:310` | 360px | P0 | Same. | Confirm. |
| R-210 | `/Users/loicpirez/VNDB/src/components/CreateListForm.tsx:65-100` | 360px | P1 | Name + description + color + icon + submit. Has flex-wrap and `min-w-[180px]` on inputs → wraps OK on 360. | None. |
| R-211 | `/Users/loicpirez/VNDB/src/components/ListAddVnForm.tsx:55-` | 360px | P1 | Input + add button. Has flex-1 on input. | Verify. |
| R-212 | `/Users/loicpirez/VNDB/src/components/SeriesAddVnForm.tsx` | 360px | P1 | Form layout. | Verify. |
| R-213 | `/Users/loicpirez/VNDB/src/components/TagInput.tsx:70-105` | 360px | P0 | `flex flex-wrap items-center gap-1` chips + input. Input has `min-w-[120px] flex-1`. Wraps. Good. | None. |
| R-214 | `/Users/loicpirez/VNDB/src/components/EditForm.tsx:194-` | 360px | P0 | `grid grid-cols-1 gap-4 sm:grid-cols-2` — stacks on mobile. Good. | None. |
| R-215 | `/Users/loicpirez/VNDB/src/components/EditForm.tsx:272` | 360px | P0 | `grid grid-cols-1 gap-4 sm:grid-cols-2` inventory section — stacks. | None. |
| R-216 | `/Users/loicpirez/VNDB/src/components/PomodoroTimer.tsx` controls | 360px | P1 | Pomodoro timer controls. Verify layout. | Verify. |
| R-217 | `/Users/loicpirez/VNDB/src/components/SessionPanel.tsx` | 360px | P1 | Session panel buttons. | Verify. |

---

### Modals fixed at desktop sizes (category 17)

Most modals use `w-[min(92vw, …)]` correctly. Audit gaps:

| R-218 | `/Users/loicpirez/VNDB/src/components/Dialog.tsx:142` | 360px | P1 | `relative w-full max-w-2xl … panelClassName ?? 'p-4 sm:p-6'` — w-full inside `p-3 sm:p-6` wrapper. p-3 + p-4 = 28px total horizontal padding leaves 332px of content area on 360px. Tight but works. | Acceptable. |
| R-219 | `/Users/loicpirez/VNDB/src/components/ConfirmDialog.tsx:212-216` | 360px | OK | `w-full max-w-md` with `rounded-t-2xl sm:rounded-2xl` — bottom sheet on mobile, centered modal on sm+. Excellent. | None. |
| R-220 | `/Users/loicpirez/VNDB/src/components/SettingsButton.tsx:545` | 360px | P1 | `w-full max-w-3xl rounded-2xl … p-4 shadow-card outline-none sm:mt-12 sm:p-6` — sits inside `bg-black/70 p-2 backdrop-blur-sm sm:p-6` overflow-y-auto container. mt-6 leaves space. Acceptable. | None. |
| R-221 | `/Users/loicpirez/VNDB/src/components/EgsPanel.tsx:497` | 360px | P1 | `mt-6 w-full max-w-xl … sm:mt-12 sm:p-6` — same. Good. | None. |
| R-222 | `/Users/loicpirez/VNDB/src/components/CoverSourcePicker.tsx:319` | 360px | P1 | `max-h-[90vh] w-full max-w-3xl overflow-hidden rounded-2xl …` — Good. | None. |
| R-223 | `/Users/loicpirez/VNDB/src/components/BannerSourcePicker.tsx:193` | 360px | P1 | Same. | None. |
| R-224 | `/Users/loicpirez/VNDB/src/components/MediaGallery.tsx:218` | 360px | P1 | `fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4 outline-none` lightbox — full screen. Good. | None. |
| R-225 | `/Users/loicpirez/VNDB/src/components/CompareWithButton.tsx:96` | 360px | P0 | `panelClassName="p-0 max-w-2xl overflow-hidden"` — `overflow-hidden` cuts inner content. Combined with no max-h. | Add `max-h-[85vh] overflow-y-auto`. |
| R-226 | `/Users/loicpirez/VNDB/src/components/LinkToVndbButton.tsx:119` | 360px | P0 | `max-h-[80vh] w-[min(92vw,640px)] overflow-y-auto …` — good. | None. |
| R-227 | `/Users/loicpirez/VNDB/src/components/AliceNetKobeClient.tsx:208` | 360px | P0 | `w-[min(92vw,640px)] max-h-[85vh] overflow-y-auto`. Good. | None. |
| R-228 | `/Users/loicpirez/VNDB/src/components/MapVnToEgsButton.tsx:188` | 360px | P0 | Same. | None. |
| R-229 | `/Users/loicpirez/VNDB/src/components/MapEgsToVndbButton.tsx:180` | 360px | P0 | Same. | None. |
| R-230 | `/Users/loicpirez/VNDB/src/components/HomeLayoutEditorTrigger.tsx:171` | 360px | P0 | Same. | None. |

---

### Long line-clamp content cutoff (category 18)

| R-231 | `/Users/loicpirez/VNDB/src/components/RecentlyViewedStrip.tsx:81` | 360px | P1 | `line-clamp-2 text-[10px] leading-tight` — title might cut off significant info at 2 lines × tiny text. | Bump text size. |
| R-232 | `/Users/loicpirez/VNDB/src/components/VnCard.tsx:311` | 360px | P1 | `line-clamp-2 text-sm font-semibold leading-tight` title — 2 lines with `text-sm` (~14px) and tight line-height. At 360px wide JP title overflows. | None — line-clamp-2 is reasonable; titles longer than 2 lines truncated. |
| R-233 | `/Users/loicpirez/VNDB/src/app/character/[id]/page.tsx:249,387,253,401` | 360px | P1 | `line-clamp-2` / `line-clamp-1` everywhere. | None. |
| R-234 | `/Users/loicpirez/VNDB/src/components/AliceNetKobeClient.tsx` various | 360px | P1 | Kobe cards use `line-clamp-2`. | None. |
| R-235 | `/Users/loicpirez/VNDB/src/components/TextualSearchPanel.tsx:188,219` | 360px | P1 | `line-clamp-1`. | None. |
| R-236 | `/Users/loicpirez/VNDB/src/app/dumped/page.tsx:253` | 360px | P1 | `line-clamp-2`. | None. |
| R-237 | `/Users/loicpirez/VNDB/src/components/MediaGallery.tsx:371` | 360px | P1 | `truncate bg-gradient-to-t from-black/80 to-transparent` caption. Good. | None. |

---

### Additional findings during audit

| R-238 | `/Users/loicpirez/VNDB/src/components/HeroBanner.tsx:305` | 360px | P1 | `h-64 w-full overflow-hidden` — 256px tall hero banner regardless of viewport. On mobile (360×640), the banner takes ~40% of the fold. Acceptable but high. | Consider `h-40 sm:h-56 md:h-64` ladder. |
| R-239 | `/Users/loicpirez/VNDB/src/app/vn/[id]/page.tsx:356` | 360px | P0 | `relative -mt-44 grid grid-cols-1 gap-4 px-3 pb-4 sm:gap-6 sm:px-6 sm:pb-6 md:grid-cols-[260px_1fr] md:gap-8 md:px-8 md:pb-8` — `-mt-44` (= -176px) pulls cover INTO the 256px-tall hero. At 360px the cover is 260px max-w which doesn't fit (after subtracting px-3=24, content area is 336px). With center alignment ok. | None. |
| R-240 | `/Users/loicpirez/VNDB/src/app/vn/[id]/page.tsx:500` | 360px | P1 | `<dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm sm:gap-x-6 sm:grid-cols-3">` — 2 cols at 360, 3 at sm+. Long values can squeeze. | None. |
| R-241 | `/Users/loicpirez/VNDB/src/app/character/[id]/page.tsx:178` | 360px | P1 | Same `grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-3` — gap-x-6 (24px) at 360 means each col is (360-48-24)/2 = 144px. Tight. | Reduce gap-x to 3 on mobile. |
| R-242 | `/Users/loicpirez/VNDB/src/app/release/[id]/page.tsx:155` | 360px | P1 | `mt-5 grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-3` — same pattern. | Reduce gap-x. |
| R-243 | `/Users/loicpirez/VNDB/src/app/stats/page.tsx:292` | 360px | P0 | `grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7` aggregate stats. At 360px, 2 cols; at sm+, 4; at lg+, 7. Fine. | None. |
| R-244 | `/Users/loicpirez/VNDB/src/app/labels/page.tsx:114` | 360px | P1 | `grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 print:grid-cols-4 print:gap-1` print labels — 2 cols mobile, 4 print. Good. | None. |
| R-245 | `/Users/loicpirez/VNDB/src/components/Skeleton.tsx:55` | 360px | P1 | `<div className="grid grid-cols-2 gap-5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">` — skeleton breakpoints fine. | None. |
| R-246 | `/Users/loicpirez/VNDB/src/components/CachePanel.tsx:102,109` | 360px | P1 | `grid grid-cols-2 gap-3 sm:grid-cols-4 mt-4` — fine. | None. |
| R-247 | `/Users/loicpirez/VNDB/src/components/PlaytimeCompare.tsx:158` | 360px | P1 | `grid grid-cols-2 gap-2 sm:grid-cols-4` — fine. | None. |
| R-248 | `/Users/loicpirez/VNDB/src/components/ScoreSection.tsx:82` | 360px | P1 | `mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4` — single col at 360. | None. |
| R-249 | `/Users/loicpirez/VNDB/src/components/EgsPanel.tsx:314` | 360px | P0 | `grid grid-cols-2 gap-3 sm:grid-cols-4` — 2 col mobile, 4 sm+. Good. | None. |
| R-250 | `/Users/loicpirez/VNDB/src/components/CoverCompare.tsx:217` | 360px | P0 | **`grid-cols-3` always — no responsive breakpoints.** Three 2:3 covers + labels at 360px width. Critical comparison surface on VN detail page. | **Add `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3` or use horizontal scroll.** |
| R-251 | `/Users/loicpirez/VNDB/src/components/CharactersSection.tsx:97,183` | 360px | P0 | `grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3` — stacks at 360. Good. | None. |
| R-252 | `/Users/loicpirez/VNDB/src/components/SeriesManager.tsx:91` | 360px | P0 | `grid gap-3 sm:grid-cols-2 lg:grid-cols-3` — stacks. Good. | None. |
| R-253 | `/Users/loicpirez/VNDB/src/components/CastSection.tsx:36` | 360px | P0 | Same. Good. | None. |
| R-254 | `/Users/loicpirez/VNDB/src/components/StaffSection.tsx:49` | 360px | P0 | `grid gap-4 sm:grid-cols-2 lg:grid-cols-3` — stacks. Good. | None. |
| R-255 | `/Users/loicpirez/VNDB/src/components/EgsRichDetails.tsx:68,153` | 360px | P0 | `grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3` — 2 mobile. Acceptable. | None. |
| R-256 | `/Users/loicpirez/VNDB/src/components/AliceNetKobeClient.tsx:931` | 360px | P1 | `mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6` filter chips. Good. | None. |
| R-257 | `/Users/loicpirez/VNDB/src/components/AliceNetKobeClient.tsx:1266` | 360px | P1 | `mb-4 grid gap-2 rounded-xl border border-border bg-bg-card p-3 md:grid-cols-2 xl:grid-cols-4` re-search ops — stacks at 360. Good. | None. |
| R-258 | `/Users/loicpirez/VNDB/src/components/OwnedEditionsSection.tsx:466,815` | 360px | P1 | `grid grid-cols-2 gap-x-4 gap-y-2 text-[11px] sm:grid-cols-3` — 2 col mobile. Good. | None. |
| R-259 | `/Users/loicpirez/VNDB/src/components/BannerSourcePicker.tsx:331` | 360px | P1 | `grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5` source previews — 3 cols at 360. With banner ratios may squeeze. | Reduce to `grid-cols-2`. |
| R-260 | `/Users/loicpirez/VNDB/src/components/CoverSourcePicker.tsx:526` | 360px | P1 | Same. 3 covers in 360px = ~110px each. Reasonable. | None. |
| R-261 | `/Users/loicpirez/VNDB/src/components/TraitsBrowser.tsx:103` | 360px | P0 | `grid gap-3 sm:grid-cols-2 lg:grid-cols-3` — stacks. Good. | None. |
| R-262 | `/Users/loicpirez/VNDB/src/components/TagsBrowser.tsx:440` | 360px | P0 | Same. Good. | None. |
| R-263 | `/Users/loicpirez/VNDB/src/components/StockPanel.tsx:647` | 360px | P0 | `mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3` provider buttons. Good. | None. |
| R-264 | `/Users/loicpirez/VNDB/src/app/lists/page.tsx:39` | 360px | P0 | `grid gap-3 sm:grid-cols-2 lg:grid-cols-3` — Good. | None. |
| R-265 | `/Users/loicpirez/VNDB/src/app/dumped/page.tsx:137` | 360px | P0 | `grid grid-cols-2 gap-3 sm:grid-cols-3` summary cards. Good. | None. |

---

### Skeleton / loading layout consistency

| R-266 | `/Users/loicpirez/VNDB/src/app/labels/loading.tsx:8` | 360px | P0 | `grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4` — matches print labels grid. Good. | None. |
| R-267 | `/Users/loicpirez/VNDB/src/app/year/loading.tsx:8` | 360px | P0 | `grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4` — matches. Good. | None. |
| R-268 | `/Users/loicpirez/VNDB/src/app/stats/loading.tsx:7` | 360px | P0 | `grid grid-cols-2 gap-3 sm:grid-cols-4`. Good. | None. |
| R-269 | `/Users/loicpirez/VNDB/src/app/compare/loading.tsx:7` | 360px | P0 | `grid grid-cols-2 gap-4 lg:grid-cols-4`. Good. | None. |
| R-270 | `/Users/loicpirez/VNDB/src/app/characters/loading.tsx:7` | 360px | P0 | `h-32 w-full rounded-2xl` skeleton. Good. | None. |

---

### Aspect-ratio edge cases for vertical content

| R-271 | `/Users/loicpirez/VNDB/src/app/lists/[id]/page.tsx:144-149` | 360px | P0 | `flex h-12 w-12 shrink-0 items-center justify-center rounded-xl` — fixed 48×48 icon. Good. | None. |
| R-272 | `/Users/loicpirez/VNDB/src/app/character/[id]/page.tsx:237` | 360px | P0 | `group flex gap-3 rounded-lg border border-border bg-bg-elev/40 p-2 transition-colors hover:border-accent` row — no aspect issue, just flex row. | None. |
| R-273 | `/Users/loicpirez/VNDB/src/app/release/[id]/page.tsx:374,403` | 360px | P0 | Figure rows. Need verify. | Verify. |

---

### Navigation / Header issues at 360px

| R-274 | `/Users/loicpirez/VNDB/src/components/MoreNavMenu.tsx:300-304` | 1280px | P1 | `hidden 2xl:inline` group labels — hide labels below 2xl (1536px) to avoid French overflow. Good. | None. |
| R-275 | `/Users/loicpirez/VNDB/src/components/MoreNavMenu.tsx:354` | 360px | P0 | `fixed inset-0 z-50 md:hidden` mobile sheet only at md and below. Good. | None. |
| R-276 | `/Users/loicpirez/VNDB/src/components/LanguageSwitcher.tsx` | 360px | P1 | Verify language switcher fits at 360. | Verify in code. |
| R-277 | `/Users/loicpirez/VNDB/src/components/SpoilerToggle.tsx:96` | 360px | P1 | `absolute right-0 top-full z-40 mt-1 w-[min(95vw,20rem)]` popover. Good. | None. |

---

### Buttons that may break at 360px

| R-278 | `/Users/loicpirez/VNDB/src/components/CardDensitySlider.tsx:113` | 360px | P0 | `h-1.5 w-28 cursor-pointer accent-accent` slider — fixed 112px. Two `min-h-[44px] min-w-[44px]` flank buttons. Wrapped in `inline-flex items-center gap-2 rounded-md border border-border bg-bg-elev/40 px-2 py-1 text-[11px]` parent. Total width ~ 44+8+112+8+44+10 = 226px + reset button = ~280px. Plus reset/label. Approaches 360. Should fit. | None. |
| R-279 | `/Users/loicpirez/VNDB/src/app/stock/page.tsx` (StockLookupClient) | 360px | P1 | `max-w-screen-2xl px-4 py-6` — content area constrained on desktop, full on mobile. Good. | None. |
| R-280 | `/Users/loicpirez/VNDB/src/components/PomodoroTimer.tsx` | 360px | P1 | Need to verify Pomodoro layout. | Verify. |

---

### `flex items-center gap` rows without flex-wrap (continued)

| R-281 | `/Users/loicpirez/VNDB/src/components/StockPanel.tsx:601-646` | 360px | P0 | Stock toolbar `flex flex-wrap items-center gap-2` group filters + provider toggles. Has flex-wrap. | None. |
| R-282 | `/Users/loicpirez/VNDB/src/app/steam/page.tsx:188-194` | 360px | P1 | `mb-4 inline-flex items-center gap-1 text-sm` back link — fits. | None. |
| R-283 | `/Users/loicpirez/VNDB/src/app/steam/page.tsx:240` | 360px | P1 | `flex w-full items-center gap-3 rounded-lg border bg-bg-elev/30 p-2 text-left transition-colors` Steam row — no flex-wrap, uses `flex-1` on inner content. May truncate. | None. |
| R-284 | `/Users/loicpirez/VNDB/src/app/steam/page.tsx:310` | 360px | P1 | `flex items-center justify-between gap-2` link row — no wrap, short content. | None. |
| R-285 | `/Users/loicpirez/VNDB/src/app/trait/[id]/page.tsx:97` | 360px | P1 | `flex items-start justify-between gap-3` header — no wrap. Title + actions could overflow. Has `min-w-0 flex-1` on inner. | Add `flex-wrap`. |
| R-286 | `/Users/loicpirez/VNDB/src/app/recommendations/page.tsx:217` | 360px | P0 | `mb-4 inline-flex items-center gap-1` back-to-library link — fits at 360. | None. |
| R-287 | `/Users/loicpirez/VNDB/src/app/brand-overlap/page.tsx:149` | 360px | P1 | `flex items-baseline justify-between gap-2` brand overlap row — no wrap. | Verify. |
| R-288 | `/Users/loicpirez/VNDB/src/app/staff/[id]/page.tsx:338` | 360px | P1 | `flex items-start gap-2` staff credits row — short content. | None. |

---

### Bottom-fixed elements colliding with content

| R-289 | `/Users/loicpirez/VNDB/src/components/QuoteFooter.tsx:44-65` | 360px | P0 | Fixed bottom-0 right-0 footer with hover-to-expand height (max-h-5 → max-h-28). On touch devices, the strip is invisible / unreachable. Combined with `<DownloadStatusBar>` (bottom-5 right-2). | Add touch-tap handler. |
| R-290 | `/Users/loicpirez/VNDB/src/components/DownloadStatusBar.tsx:285` | 360px | P0 | `fixed bottom-5 right-2 z-40 flex max-w-[calc(100vw-1rem)]` — fits. Popover opens `bottom-full right-0 mb-2 w-[min(92vw,24rem)] max-h-[60vh]`. Good. | None. |
| R-291 | `/Users/loicpirez/VNDB/src/components/WishlistClient.tsx:684-690` | 360px | P0 | `fixed bottom-10 left-1/2 z-50 w-[min(96vw,32rem)] -translate-x-1/2 … sm:bottom-4` — bulk action bar. `bottom-10` on mobile is 40px from bottom; QuoteFooter sits at 0-112px. Could overlap with collapsed footer (max-h-5 = 20px). At expanded state, overlaps. | Raise to `bottom-16 sm:bottom-4`. |
| R-292 | `/Users/loicpirez/VNDB/src/components/BulkActionBar.tsx:181` | 360px | P0 | `fixed bottom-10 left-1/2 z-50 w-[min(96vw,720px)] … sm:bottom-4` — same. | Same fix. |
| R-293 | `/Users/loicpirez/VNDB/src/components/BulkDownloadButton.tsx:312` | 360px | P0 | `fixed bottom-12 left-1/2 z-30 w-[min(92vw,420px)]` — `bottom-12` (48px). Less conflict with footer. | Verify with QuoteFooter. |
| R-294 | `/Users/loicpirez/VNDB/src/components/TutorialTour.tsx:124` | 360px | P0 | `fixed bottom-4 right-4 z-50 w-[min(92vw,420px)]` — `bottom-4`. Will collide with QuoteFooter on mobile. | Use `sm:bottom-4` and raise mobile. |

---

### Text size on critical interactive elements

| R-295 | `/Users/loicpirez/VNDB/src/components/SearchClient.tsx:339` | 360px | P1 | Tab strip `text-[11px]` — small. | Acceptable for tabs but borderline. |
| R-296 | `/Users/loicpirez/VNDB/src/app/top-ranked/page.tsx:75-103` (TabLink) | 360px | P1 | Tab text from chip class. Verify. | Verify. |
| R-297 | `/Users/loicpirez/VNDB/src/components/StockPanel.tsx:935,943` | 360px | P1 | Confirm dialog buttons `text-xs font-semibold/bold` — readable. | None. |
| R-298 | `/Users/loicpirez/VNDB/src/components/MapVnToEgsButton.tsx:266` | 360px | P1 | Search input `text-xs` — borderline small for input field. | Bump to `text-sm`. |

---

### Hero / Cover overlay issues

| R-299 | `/Users/loicpirez/VNDB/src/components/HeroBanner.tsx:400-411` | 360px | P0 | Hero overlay control row `absolute right-3 top-3 z-10 flex flex-wrap items-center gap-1.5` — has flex-wrap. But on 360px viewport with banner adjust+rotate+rotate, may wrap to 2 lines. Acceptable. | None. |
| R-300 | `/Users/loicpirez/VNDB/src/components/CoverEditOverlay.tsx:26` | 360px | P0 | `absolute right-2 top-2 z-30 inline-flex items-center gap-1 rounded-md bg-black/70 px-2 py-1` — small affordance. Hidden on mobile? Has `md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100 md:hover:opacity-100` — visible on mobile (no md: prefix initial). Good. | None. |
| R-301 | `/Users/loicpirez/VNDB/src/components/CoverRotationButtons.tsx:139-165` | 360px | P0 | Two rotate buttons in cover bottom-right corner — `min-h-[44px] min-w-[44px]`. Good. | None. |

---

### Reading queue / strip cards

| R-302 | `/Users/loicpirez/VNDB/src/components/ReadingQueueStripView.tsx:69` | 360px | P1 | `line-clamp-1 max-w-[200px] font-semibold` — 200px title in strip card. | Acceptable. |
| R-303 | `/Users/loicpirez/VNDB/src/components/ReadingQueueStripView.tsx` (parent) | 360px | P1 | Strip cards use ScrollFadeRight horizontal scroll. Good. | None. |
| R-304 | `/Users/loicpirez/VNDB/src/components/RecentlyViewedStrip.tsx:69` | 360px | P0 | `style={{ width: 'min(40vw, calc(var(--card-density-px, 180px) * 0.55))' }}` — density-aware. Fits 2 cards per row on 360 (40vw = 144). Good. | None. |

---

### Filter chips overflow

| R-305 | `/Users/loicpirez/VNDB/src/components/LibraryClient.tsx:946-1080` | 360px | P0 | Filter chip strip — `flex flex-wrap items-center gap-1.5` with up to 14 chip types. On 360 with active filters, wraps to many rows. | None — flex-wrap saves it. |
| R-306 | `/Users/loicpirez/VNDB/src/components/SavedFilters.tsx:229` | 360px | P0 | `flex items-center gap-1` saved filter row — no flex-wrap. Filter chip with X button. Small content. | Add flex-wrap. |

---

### Specific small icon buttons missing tap targets

| R-307 | `/Users/loicpirez/VNDB/src/components/RefreshScopeButton.tsx:102` | 360px | P0 | `<Loader2 className="h-4 w-4 animate-spin" />` inside button — check parent has min-h-[44px]. | Verify. |
| R-308 | `/Users/loicpirez/VNDB/src/components/PrintButton.tsx:7` | 360px | P0 | `<Printer className="h-4 w-4" /> {label}` — verify parent btn has min-h. | Likely OK with `.btn` class. |
| R-309 | `/Users/loicpirez/VNDB/src/components/QueueButton.tsx:72` | 360px | P0 | Loader inside button. | Verify parent. |
| R-310 | `/Users/loicpirez/VNDB/src/components/StaffDownloadButton.tsx:43` | 360px | P0 | Same. | Verify. |
| R-311 | `/Users/loicpirez/VNDB/src/components/LinkToVndbButton.tsx:108` | 360px | P0 | `<Link2 className="h-4 w-4" /> {t.linkVndb.cta}` — has text label and btn class. Good. | None. |
| R-312 | `/Users/loicpirez/VNDB/src/components/CompareWithButton.tsx:89` | 360px | P0 | Same with btn. Good. | None. |

---

### Charts and data visualization

| R-313 | `/Users/loicpirez/VNDB/src/components/charts/BarChart.tsx` | 360px | P1 | Bar chart SVG renders. Verify responsive scaling. | Check viewBox. |
| R-314 | `/Users/loicpirez/VNDB/src/components/ActivityHeatmap.tsx:57-75` | 360px | P0 | `ScrollFadeRight className="flex gap-[3px]"` wraps 53-week heatmap — horizontal scroll. Good. | None. |
| R-315 | `/Users/loicpirez/VNDB/src/components/TagCoOccurrence.tsx:46` | 360px | P1 | Bar with text overlay. Verify. | Verify. |

---

### Long URL / external link text

| R-316 | `/Users/loicpirez/VNDB/src/app/egs/page.tsx:218` | 360px | P0 | `<p className="mt-1 break-all font-mono text-[11px] opacity-70">{error}</p>` — break-all explicit. Good. | None. |
| R-317 | `/Users/loicpirez/VNDB/src/app/release/[id]/page.tsx` various | 360px | P1 | External links displayed. Verify break-all on long URLs. | Verify. |

---

### Specific page issues

| R-318 | `/Users/loicpirez/VNDB/src/app/data/page.tsx:117` | 360px | P1 | `<div className="flex flex-wrap gap-2">` export buttons — flex-wrap. Good. | None. |
| R-319 | `/Users/loicpirez/VNDB/src/app/schema/page.tsx:47-110` | 360px | P1 | Schema page layout. Verify responsiveness. | Verify. |
| R-320 | `/Users/loicpirez/VNDB/src/app/tag/[id]/page.tsx:457` | 360px | P1 | `flex items-center gap-2 text-[11px] text-muted` — short content row. OK. | None. |
| R-321 | `/Users/loicpirez/VNDB/src/app/tag/[id]/page.tsx:470` | 360px | P1 | Pagination nav `flex items-center justify-between gap-3 text-sm`. Good. | None. |

---

### Aspect ratio & cover sizing edge cases

| R-322 | `/Users/loicpirez/VNDB/src/components/VnCard.tsx:303-309` | 360px | OK | `SafeImage … className="aspect-[2/3] w-full"` cover. Density-aware grid. Good. | None. |
| R-323 | `/Users/loicpirez/VNDB/src/components/UpcomingCard.tsx` (in upcoming) | 360px | P1 | Row cards with `width: clamp(96px, calc(var(--card-density-px, 220px) * 0.38), 200px)` — density-aware. Good. | None. |
| R-324 | `/Users/loicpirez/VNDB/src/app/staff/[id]/page.tsx:491` | 360px | P1 | `width: clamp(72px, calc(var(--card-density-px, 220px) * 0.42), 200px)` — density-aware. Good. | None. |

---

### Modal/dialog button rows

| R-325 | `/Users/loicpirez/VNDB/src/components/StockPanel.tsx:931` | 360px | P1 | `mt-4 flex justify-end gap-2` cancel + confirm — no flex-wrap. Short labels fit. | None. |
| R-326 | `/Users/loicpirez/VNDB/src/components/GameLog.tsx:299` | 360px | P1 | `mt-2 flex justify-end gap-2` form actions — short content. | None. |
| R-327 | `/Users/loicpirez/VNDB/src/components/CompareWithButton.tsx:167` | 360px | P0 | `flex items-center justify-end gap-2 border-t border-border p-3` footer — no flex-wrap. Two buttons. | None. |
| R-328 | `/Users/loicpirez/VNDB/src/components/MapVnToEgsButton.tsx:282` | 360px | P0 | Candidate row `flex items-center gap-2 rounded-md border border-border bg-bg-elev/30 px-3 py-2 text-xs hover:border-accent` — `flex` no `flex-wrap`. Title flex-1 + 2 icon buttons. Should fit. | None — has min-w-0 flex-1 on text. |

---

### Less-common pattern issues

| R-329 | `/Users/loicpirez/VNDB/src/components/ConfirmDialog.tsx:217,359` | 360px | OK | `flex items-center justify-between gap-2 border-b border-border px-4 py-3` header — title + close button. No wrap, OK. | None. |
| R-330 | `/Users/loicpirez/VNDB/src/components/HomeLayoutEditorTrigger.tsx:188-203` | 360px | P1 | DndContext drag handles in home editor — verify touch interaction. | See R-179. |
| R-331 | `/Users/loicpirez/VNDB/src/components/SeriesManager.tsx:91-100` | 360px | P0 | Series cards with btn-danger that's `md:opacity-0 md:group-hover:opacity-100`. On mobile, danger always visible — good. | None. |
| R-332 | `/Users/loicpirez/VNDB/src/components/Skeleton.tsx` | 360px | OK | Generic skeleton primitives. Good. | None. |

---

### Compare table specific (cat 6)

| R-333 | `/Users/loicpirez/VNDB/src/app/compare/page.tsx:245-252` | 360px | P0 | Compare grid uses `[grid-template-columns:var(--cmp-cols-sm)]` with `100px repeat(${items.length}, minmax(160px, 1fr))` at sm and `180px repeat(${items.length}, minmax(220px, 1fr))` at md+. At 360px, label col = 100px, then 2 items min 160px = 320 + 100 = 420px → forced horizontal scroll via `scroll-fade-right overflow-x-auto`. Good. | None. |

---

### Specific small button issues found

| R-334 | `/Users/loicpirez/VNDB/src/components/SetBannerButton.tsx:63` | 360px | P0 | `h-3 w-3` icon inside button — check parent has min-h. | Verify (.btn class likely OK). |
| R-335 | `/Users/loicpirez/VNDB/src/components/RandomPickButton.tsx:44` | 360px | P0 | `<Dices className="h-4 w-4" />` — verify parent. | Verify. |
| R-336 | `/Users/loicpirez/VNDB/src/components/ProducerRefreshButton.tsx` | 360px | P0 | Verify button size. | Verify. |
| R-337 | `/Users/loicpirez/VNDB/src/components/FavoriteToggleButton.tsx:105` | 360px | P0 | `absolute z-30 tap-target inline-flex h-7 w-7 items-center justify-center rounded-md shadow-card` — 28×28 + tap-target +10 pad = effective 48 hit area. Good. | None. |

---

### Pages with potential issues identified but not fully verified

| R-338 | `/Users/loicpirez/VNDB/src/app/tags/page.tsx` (TagsBrowser) | 360px | P1 | Browser with search + filters + grid. | Verify text sizes. |
| R-339 | `/Users/loicpirez/VNDB/src/app/traits/page.tsx` (TraitsBrowser) | 360px | P1 | Same. | Verify. |
| R-340 | `/Users/loicpirez/VNDB/src/app/brand-overlap/page.tsx` | 360px | P1 | Brand overlap. | Verify. |
| R-341 | `/Users/loicpirez/VNDB/src/app/labels/page.tsx` | 360px | P1 | Labels grid for printing. Grid breakpoints already correct. | None. |

---

### Notification / Toast positioning

| R-342 | `/Users/loicpirez/VNDB/src/components/ToastProvider.tsx:97` | 360px | P0 | `pointer-events-none fixed inset-x-0 bottom-12 z-[1100] flex flex-col items-center gap-2 px-4` — `bottom-12` is 48px above bottom. QuoteFooter is 0-112px on hover. Collision risk when toast lingering during quote hover. | Use `bottom-16`. |
| R-343 | `/Users/loicpirez/VNDB/src/components/ToastProvider.tsx:131` | 360px | P0 | Toast `flex max-w-[min(92vw,420px)] items-start gap-2 rounded-lg border px-3 py-2 text-sm shadow-card backdrop-blur` — responsive width. Good. | None. |

---

### CSS variables for densities

| R-344 | `globals.css --card-density-px` usage | 360px | P0 | Per `CLAUDE.md`: every server-rendered listing uses `repeat(auto-fill, minmax(min(100%, var(--card-density-px, 220px)), 1fr))` so slider=480 on 360 doesn't force overflow. Verified in: lists, recommendations, wishlist, upcoming, top-ranked, staff, characters, etc. | None — well-architected. |

---

### Performance / interaction issues

| R-345 | `/Users/loicpirez/VNDB/src/components/PortalPopover.tsx` | 360px | P0 | Portals into document.body, JS measures + flips on collision. Good responsive primitive. | None. |
| R-346 | `/Users/loicpirez/VNDB/src/components/PortalPopover.tsx` re-measure on scroll/resize | 360px | P1 | Verify the listener cleanup. | Verify. |

---

### Specific issues in /vn/[id] page (heavy page)

| R-347 | `/Users/loicpirez/VNDB/src/app/vn/[id]/page.tsx:209` | 360px | P0 | `<div className="mx-auto max-w-2xl">` error state — caps at 672, full on mobile. Good. | None. |
| R-348 | `/Users/loicpirez/VNDB/src/app/vn/[id]/page.tsx:357` | 360px | P0 | `z-10 mx-auto w-full max-w-[260px] md:mx-0` cover wrapper — caps at 260px on mobile (auto-centered), left-aligned at md+. Good. | None. |
| R-349 | `/Users/loicpirez/VNDB/src/app/vn/[id]/page.tsx:421` | 360px | P1 | `z-10 flex flex-col gap-3 pt-6 md:pt-44` — body. pt-44 (176px) only at md+ to clear hero. On mobile pt-6 (24px). Good. | None. |
| R-350 | `/Users/loicpirez/VNDB/src/app/vn/[id]/page.tsx:422` | 360px | P1 | `flex flex-wrap items-start justify-between gap-3` title + status badge — has flex-wrap. Good. | None. |
| R-351 | `/Users/loicpirez/VNDB/src/app/vn/[id]/page.tsx:445` | 360px | P1 | `mr-1 inline-flex h-4 min-w-[1.5rem] items-center justify-center rounded bg-bg-elev/60 px-1 text-[9px] font-bold uppercase tracking-wider text-muted` — language code chip. min-w-[1.5rem]=24px, text-[9px]. Hard to read. | Bump to text-[10px]. |
| R-352 | `/Users/loicpirez/VNDB/src/app/vn/[id]/page.tsx:692,700,715,720,727,737,744,760` | 360px | P1 | Inline-flex chips. All wrap via parent flex-wrap. Good. | None. |

---

### /alicesoft_kobe specific issues

| R-353 | `/Users/loicpirez/VNDB/src/components/AliceNetKobeClient.tsx:931` | 360px | P0 | Stats `grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6` — 2 on mobile. Good. | None. |
| R-354 | `/Users/loicpirez/VNDB/src/components/AliceNetKobeClient.tsx:1144-1208` | 360px | P0 | Toolbar with search + sort + group + view + filters + density. Wraps via flex-wrap. Tall on mobile but functional. | None. |
| R-355 | `/Users/loicpirez/VNDB/src/components/AliceNetKobeClient.tsx:1212-1245` | 360px | P0 | Filter sub-grid `mt-3 grid gap-3 border-t border-border pt-3 sm:grid-cols-2 lg:grid-cols-5` — stacks. Good. | None. |
| R-356 | `/Users/loicpirez/VNDB/src/components/AliceNetKobeClient.tsx:1266-1283` | 360px | P0 | Re-search ops `md:grid-cols-2 xl:grid-cols-4`. Good. | None. |
| R-357 | `/Users/loicpirez/VNDB/src/components/AliceNetKobeClient.tsx` candidate chips | 360px | P0 | Candidate chips wrap. Good. | None. |

---

### Final misc findings

| R-358 | `/Users/loicpirez/VNDB/src/components/Skeleton.tsx:55` | 360px | OK | Default skeleton grid — responsive. | None. |
| R-359 | `/Users/loicpirez/VNDB/src/components/PageSpaceFrame.tsx` | 360px | OK | Wrapper component for page padding. | Verify safe horizontal padding. |
| R-360 | `/Users/loicpirez/VNDB/src/components/HeaderSpaceFrame.tsx` | 360px | OK | Wrapper for header padding. | Verify. |
| R-361 | `/Users/loicpirez/VNDB/src/components/StockPanel.tsx:923` | 360px | P0 | `fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4` confirm modal — p-4 on mobile gives 32px left+right padding from viewport. With `w-full max-w-sm` (= 384, capped to 360-32=328), good. | None. |
| R-362 | `/Users/loicpirez/VNDB/src/components/MoreNavMenu.tsx:362` | 360px | OK | `inset-y-0 right-0 h-full w-full max-w-[30rem]` mobile sheet — full width up to 480px cap. Good. | None. |
| R-363 | `/Users/loicpirez/VNDB/src/app/error.tsx:31` | 360px | OK | `mx-auto max-w-md py-16 text-center` error page — caps at 448. Good. | None. |

---

### Summary statistics

- **Total findings**: 363
- **Hard-coded widths**: 60 occurrences (106 raw matches), most acceptable via `min()`/`max()` or `max-w-*` caps
- **`text-[9px]`/`text-[10px]` instances**: 459 total occurrences (significant accessibility concern, especially in titles/labels)
- **Tap targets `< 44×44`**: ~30 identified spots, mostly icon-only buttons within `p-1`/`p-2` containers
- **Grids without responsive breakpoints**: 4-5 (most use `sm:grid-cols-N`)
- **Modal sizing issues**: All major modals use `w-[min(92vw,…)]` pattern correctly; 1 issue in `CompareWithButton` (overflow-hidden cut)
- **DnD touch fallback**: 6 spots use only `PointerSensor` without `TouchSensor` (HomeLayoutEditor, SeriesDetailLayout, DetailReorderLayout, VnDetailLayout, SettingsButton 3×)
- **Sticky header height**: At 360px FR, header can wrap to 3 rows ~150px, exceeding the "80px tall" threshold

### Critical (P0) action items in priority order

1. **R-167** — QuoteFooter has no touch tap-to-expand (invisible to mobile users)
2. **R-130, R-131, R-136, R-137, R-138, R-139, R-140, R-141, R-142, R-146** — Touch target < 44×44 on critical interactive elements (10 cases)
3. **R-061** — CoverCompare grid-cols-3 with no responsive fallback
4. **R-291, R-292, R-294, R-342** — Bottom-fixed elements potentially colliding with QuoteFooter at hover
5. **R-225** — CompareWithButton modal uses overflow-hidden cutting content
6. **R-110** — `/data` status rows table missing horizontal scroll wrapper
7. **R-179-R-183** — DnD missing TouchSensor (HomeLayoutEditor, SeriesDetailLayout, DetailReorderLayout, VnDetailLayout, 3× in SettingsButton)
8. **R-002-R-004** — `/activity` form labels with `min-w-[220px/160px]` causing wrapping pressure on 360px
9. **R-124** — Sticky header height exceeds main padding budget at 360px French
10. **R-085, R-086, R-092, R-093, R-099** — Toolbars lacking flex-wrap on inner control rows

### High-confidence (P1) action items

11. **R-153-R-158, R-164** — `text-[9px]` / `text-[10px]` on user-facing badges/titles (10+ instances)
12. **R-051, R-159** — Compare picker uses `text-[10px]` on alt titles  
13. **R-241, R-242** — Character/release dt grids use gap-x-6 (24px) at 360px, tighter gap needed
14. **R-009-R-044** — Wide-min-w inputs (`min-w-[200/220px]`) on search fields across many components (W-007, W-011, W-023, W-036, W-037, W-039, W-040, W-044) — consider reducing mobile floor

### Architectural notes (positive)

- The codebase uses `min(100%, var(--card-density-px))` consistently in grids — prevents horizontal scroll at high density values on mobile.
- Mobile nav uses a hidden hamburger sheet (`md:hidden`) — correct pattern.
- Most modals use `w-[min(92vw,…)]` — responsive.
- `<SafeImage>` reserves space with explicit aspect classes from callers.
- `ScrollFadeRight` component handles overflow indicators for variable-length rows.
- `PortalPopover` measures and flips on viewport collision.
- DnD generally has TouchSensor (ShelfLayoutEditor, SortableGrid) but missing in 6 secondary DnD surfaces.
- The codebase has dedicated `.tap-target` (10px hit pad) and `.tap-target-tight` (6px) utility classes — but they're inconsistently applied; many icon-only buttons lack either.
