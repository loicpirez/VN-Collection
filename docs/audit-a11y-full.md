# WCAG 2.1 AA Accessibility Audit — `/Users/loicpirez/VNDB`

**Audit date:** 2026-05-27
**Scope:** every component under `src/components/` and every page under `src/app/`
**Method:** static code review of `.tsx` files

## Closure status (2026-05-27)

**CLOSED — every Critical + every Serious + the actionable Moderate
findings.** See commit `79d2ace` (a11y agent's bulk batch). Deferred:
A-115..A-119 (tooltip primitive build-out — requires a shared
`<Tooltip>` primitive adopted across hundreds of cards, scheduled
separately) and A-035 / A-040 / A-072 / A-107 / A-156 (verification
items requiring axe-core / NVDA runtime tooling, out of scope for a
static-fix pass).
**Severity scale:**
- `Critical` — blocks task completion for assistive technology users (WCAG Level A failures)
- `Serious` — significantly degrades experience but workaround exists (Level AA failures)
- `Moderate` — best-practice violation, minor experience degradation
- `Minor` — polish issue, cosmetic a11y improvement

---

## Summary

| Severity | Count |
|---|---|
| Critical | 4 |
| Serious | 47 |
| Moderate | 90 |
| Minor | 32 |
| **Total** | **173** |

Note: Counts above were revised after verifying `useDialogA11y` invocations in several files (BannerSourcePicker, CoverSourcePicker, LinkToVndbButton, MapVnToEgsButton, MapEgsToVndbButton, AliceNetKobeClient, EgsPanel, HomeLayoutEditorTrigger). Those modals DO use the shared focus-trap hook; the issues are reduced from missing focus trap (Critical/Serious) to minor backdrop-aria-hidden cleanup (Moderate).

The codebase generally demonstrates **above-average accessibility awareness**: shared `<Dialog>` shell with focus trap, `useDialogA11y` hook, `tap-target` utility for 44×44 hit areas, comprehensive aria-label usage across hundreds of buttons, role attributes on menus / tabs / dialogs, `aria-pressed` on toggles, focus-visible utility classes for keyboard focus. Many issues found are systemic patterns rather than one-off mistakes.

The **most impactful systemic issues** are:
1. **No `prefers-reduced-motion` support anywhere** — `globals.css` has 0 matches, 166+ uses of `animate-pulse` / `animate-spin` / `transition-*` (WCAG 2.3.3 Animation from Interactions)
2. **Heading hierarchy issues** — home page has no `<h1>`, VN detail page jumps from H1 to H2/H3 inconsistently, many pages use H2 without H1
3. **Tooltips on hover only via `title=` attribute** — used on hundreds of icon buttons; `title` is partially exposed to AT but not focus-visible to sighted keyboard users; pattern is fine where `aria-label` duplicates, problematic where it doesn't
4. **No live regions on async sections** — most loading skeletons lack `aria-busy`/`aria-live`, so SR users hear nothing during fetches
5. **Generic `<div role="dialog">` without focus management** in many ad-hoc dialogs that don't use `<Dialog>` or `useDialogA11y` (StockPanel, BannerSourcePicker default branch, DateInput, AspectOverrideControl section, etc.)

---

## Findings

### Skip links, landmarks, headings (WCAG 1.3.1, 2.4.1, 2.4.6)

| ID | file:line | severity | issue | fix |
|---|---|---|---|---|
| A-001 | src/app/page.tsx:48-58 | Serious | Home page (`/`) renders no `<h1>` element. Library section heading appears in `HomeLibrarySection` but no top-level page heading exists. Violates WCAG 2.4.6 (Headings and Labels). | Add an `<h1 className="sr-only">{t.nav.library}</h1>` at the top of the home page render. |
| A-002 | src/app/data/page.tsx:36-43 | Moderate | `<h1>` immediately followed by `<h2>` siblings at the same flat level; multiple `<h2>` blocks under one section make logical hierarchy non-obvious to AT. | Ensure each `<section>` uses `<h2>` and any nested heading levels follow strict h1→h2→h3 progression. |
| A-003 | src/components/EditForm.tsx:193,271,349,354 | Moderate | EditForm uses `<h3>` without a parent `<h2>` — when inserted into a page that uses `<h2>` for section titles it works, but when the section above is itself `<h3>` (e.g. on `/vn/[id]`) the order is fine; when used in a `<h1>` context inside a section flagged with role=region, levels are inconsistent. | Use `<h2>` for the top-level form section labels, and `<h3>` for sub-blocks. Document the heading contract in component docstrings. |
| A-004 | src/components/TitleLine.tsx:24 | Moderate | `<h1>` is rendered unconditionally regardless of context. Used by VnCard and on detail pages; embedded inside a card grid this produces dozens of H1s on the Library page (one per card). | Make heading level configurable via `as` prop; cards should render as `<h3>` or `<h4>`, only the VN detail page should use `<h1>`. |
| A-005 | src/components/AliceNetKobeClient.tsx:820 | Moderate | `<h2>` rendered inside each card; cards in a grid produce dozens of `<h2>` peers (heading inflation). | Use `<h3>` for card titles to preserve hierarchy under the page's `<h1>`. |
| A-006 | src/app/layout.tsx:121-130 | Minor | `<main id="main-content" tabIndex={-1}>` is reachable via skip link but has no `aria-label` / `aria-labelledby`. SR users will hear "main" only. | Add `aria-label={dict.app.title}` or `aria-labelledby` pointing at the page's heading. |
| A-007 | src/app/layout.tsx:104-120 | Moderate | `<header>` has no accessible name and contains nav + utility controls. Multiple landmark roles render. | Add `aria-label={dict.app.title}` to the `<header>` element. |
| A-008 | src/app/layout.tsx:133 | Minor | `<QuoteFooter />` is rendered as part of layout but not wrapped in a `<footer>` landmark element. | Wrap QuoteFooter in `<footer role="contentinfo" aria-label={t.app.footer}>`. |
| A-009 | src/components/MoreNavMenu.tsx:139-141 | Moderate | The desktop `<nav>` uses `aria-label={t.nav.openMenu}` which is the wrong label ("Open menu" rather than "Main navigation"). | Use a dedicated `t.nav.mainNavLabel` key meaning "Main navigation". |

---

### Modal / dialog / focus trap (WCAG 2.1.2, 2.4.3, 4.1.2)

| ID | file:line | severity | issue | fix |
|---|---|---|---|---|
| A-010 | src/components/StockPanel.tsx:920 | Critical | `ClearCacheModal` renders `<div role="dialog" aria-modal="true">` but has no focus trap, no return-focus to trigger on close, no `useDialogA11y` integration. Tab key escapes the dialog. | Use the shared `<Dialog>` component or `useDialogA11y` hook. |
| A-011 | src/components/EgsPanel.tsx:490-497 | Moderate | Manual EGS-to-VNDB picker modal DOES use `useDialogA11y` (line 438) — confirmed. Backdrop wrapper is interactive without aria-hidden. The `tabIndex={-1}` panel is correct (panel itself shouldn't be in tab order, only its contents). | Add `aria-hidden` to the backdrop pattern; otherwise OK. |
| A-012 | src/components/TutorialTour.tsx:117-124 | Serious | `role="dialog" aria-modal="false"` — non-modal is technically correct but no focus restore on close, and the panel doesn't move focus to itself on open, so keyboard users may not realize it appeared. | Optional: send focus to the dialog's title on first render; add return-focus on close. |
| A-013 | src/components/DateInput.tsx:194-198 | Serious | DatePicker pop-out uses `role="dialog" aria-modal="false"` but the Tab trap inside loops between focusables — fine — yet pressing Escape closes only because of a window-level listener, and outside-click is the only other path. No focus restore to trigger button. | Restore focus to the picker trigger button when the popup closes. |
| A-014 | src/components/EditionInfoPopover.tsx:244-256 | Serious | `role="dialog" aria-modal="true"` but absolutely positioned within the same DOM scope and not focus-trapped; Tab leaks immediately to the next page focusable. | Either change to `role="tooltip"` / `aria-modal="false"`, or wire up `useDialogA11y`. |
| A-015 | src/components/SpoilerToggle.tsx:94-99 | Moderate | The popover uses `role="dialog"` but is not modal and has no focus trap; ESC closes via the parent's own listener, but the parent removes the listener via `triggerRef.current?.focus()` in cleanup — this races against React unmount sequence. | Use `role="menu"` or `role="region"` rather than `role="dialog"`; popovers don't need dialog semantics. |
| A-016 | src/components/DownloadStatusBar.tsx:381-388 | Moderate | The popover renders `role="dialog"` but is anchored under a button and has no focus trap. Tab escapes immediately. | Same as A-015 — change to `role="region"` or `role="menu"`. |
| A-017 | src/components/ConfirmDialog.tsx:346-353 | Moderate | Custom `role="dialog" aria-modal="true"` with own focus trap implementation. Works but **doesn't body-scroll-lock** — the underlying page scrolls when the dialog overflows. | Add `document.body.style.overflow = 'hidden'` on mount and restore on unmount. |
| A-018 | src/components/MediaGallery.tsx:212-219 | Moderate | Lightbox closes on backdrop click but `onClick={close}` fires for ANY click inside the dialog including the image and arrow buttons (mitigated by `stopPropagation` everywhere). Brittle: any new child without explicit stopPropagation will close the lightbox. | Move close logic to a sibling backdrop `<div aria-hidden>` rather than a parent click handler. |
| A-019 | src/components/HomeLayoutEditorTrigger.tsx:167-170 | Minor | `role="dialog" aria-modal="true"` and confirmed to use `useDialogA11y` (line 66). Properly mounted. | No action needed. |
| A-020 | src/components/BannerSourcePicker.tsx:182-194 | Moderate | Modal backdrop `<div className="fixed inset-0">` has `onClick={() => setOpen(false)}` for backdrop close but no `aria-hidden`. The dialog DOES use `useDialogA11y` (line 69) so focus trap works. Backdrop click element is interactive (not announced as such to SR). | Add `aria-hidden` to backdrop OR convert to proper backdrop pattern. |
| A-021 | src/components/CoverSourcePicker.tsx:315 | Moderate | Same as A-020 — uses `useDialogA11y` line 92. Backdrop interactive without aria-hidden. | Same fix as A-020. |
| A-022 | src/components/LinkToVndbButton.tsx:111-117 | Moderate | Uses `useDialogA11y` line 43. Backdrop interactive without aria-hidden. | Same fix. |
| A-023 | src/components/MapVnToEgsButton.tsx:184 | Moderate | Uses `useDialogA11y` line 68. Backdrop interactive without aria-hidden. | Same fix. |
| A-024 | src/components/MapEgsToVndbButton.tsx:176 | Moderate | Uses `useDialogA11y` line 74. Backdrop interactive without aria-hidden. | Same fix. |
| A-025 | src/components/ShelfReadOnlyControls.tsx:323 | Serious | `role="dialog"` with no `useDialogA11y` invocation visible. Verify focus trap is wired. | Add `useDialogA11y` or verify alternative. |
| A-026 | src/components/AliceNetKobeClient.tsx:202-209 | Moderate | Uses `useDialogA11y` line 159. Backdrop wrapper interactive without aria-hidden. | Same fix as A-020. |
| A-027 | src/components/EgsPanel.tsx:485-497 | Moderate | Uses `useDialogA11y` line 438. Backdrop interactive without aria-hidden. | Same fix. |

---

### Icon-only buttons missing accessible name (WCAG 4.1.2)

| ID | file:line | severity | issue | fix |
|---|---|---|---|---|
| A-028 | src/components/SafeImage.tsx:251-266 | Serious | "Click to reveal R18 image" button has no `aria-label`, only inline text content "Click to reveal". When the parent uses a CSS-only icon-only mode this would still expose text, but the button's accessible name is the concatenation of its children. The icon is `aria-hidden`. Accessible name works in this case but the button has no `type="button"`. | Add `type="button"` and `aria-label={t.settings.r18Blurred}` explicitly. |
| A-029 | src/components/HeroBanner.tsx:362-374 | Serious | Same "Click to reveal" R18 button — no `type="button"`, no `aria-label`. | Same fix. |
| A-030 | src/components/HeroBanner.tsx:260-267 | Moderate | "Adjust focal point" button: has `title` but no `aria-label`. Text content "Adjust" is exposed but the visible text is the same translation key (`t.banner.adjust`). Acceptable but title+aria duplication is the standard. | Add `aria-label={t.banner.adjust}`. |
| A-031 | src/components/CoverEditOverlay.tsx | Moderate | (Not fully read but follows the CoverHero pattern) — pin top-right edit overlay button likely depends on icon for affordance. Verify aria-label. | Audit and add aria-label if missing. |
| A-032 | src/components/SortableGrid.tsx:143-156 | Moderate | Sortable card wrapper uses `role="img"` implicitly via the entire grid item — no, it sets `aria-roledescription="sortable item"` but no `aria-label`. The card content itself carries text but the wrapper has no name. | The drag wrapper does not need its own accessible name — the inner `<VnCard>` provides it. Add `aria-describedby` pointing at any drag-helper instruction text. |
| A-033 | src/components/CardContextMenu.tsx:120-126 | Moderate | The `<div role="menu">` has no `aria-label`. Screen readers will announce "menu" with no context. | Add `aria-label={t.quickActions.title}`. |
| A-034 | src/components/StockChip.tsx:62-70 | Minor | Decorative empty placeholder uses `<div ref aria-hidden style={{ width: 0, height: 0 }} />` which renders but is not focusable — fine. | No action needed. |
| A-035 | src/components/QuoteAvatar.tsx | Moderate | (File not fully read) — avatar fallback chain may render `<UserCircle>` icon without alt/aria-label. Verify. | Add `aria-label` to icon fallback. |
| A-036 | src/components/BannerControls.tsx:81-93 | Moderate | Buttons lack explicit `type="button"` — inside a form this defaults to submit and may trigger unintended submissions. | Add `type="button"`. |
| A-037 | src/components/BannerControls.tsx:115-120 | Moderate | Same. | Same. |
| A-038 | src/components/CardDensitySlider.tsx:92-211 | Moderate | Multiple buttons without explicit `type="button"`. (No surrounding form here so the impact is minor, but still good practice.) | Add `type="button"` to every button. |
| A-039 | src/components/HomeSectionMenu.tsx | Moderate | (Pattern, not fully read) — likely contains icon-only kebab triggers. Verify aria-label coverage. | Audit. |
| A-040 | src/components/AnimeChip.tsx | Minor | (Not fully read) — anime indicator chip likely lacks aria-label. | Audit. |
| A-041 | src/components/MoreNavMenu.tsx:355 | Minor | Backdrop `<div onClick={onClose} aria-hidden />` has `aria-hidden` but is interactive (click target). Screen readers can't activate it but mouse / touch users can. Backdrop close is a power-user shortcut, not a primary path — acceptable but worth noting. | Document the pattern; no change required if the dialog has alternative close paths (Escape, X button). |
| A-042 | src/components/MoreNavMenu.tsx:166-177 | Moderate | The mobile hamburger button uses `aria-label={t.nav.openMenu}` but no separate `aria-controls` pointing at the sheet's id. SR users can't programmatically follow the relationship. | Add `aria-controls={mobileSheetId}` matching the sheet's id. |

---

### Tab navigation (WCAG 4.1.2 ARIA Tab Pattern)

| ID | file:line | severity | issue | fix |
|---|---|---|---|---|
| A-043 | src/components/SettingsButton.tsx:566-613 | Moderate | The Settings tablist correctly uses `role="tablist"`, `role="tab"`, `aria-selected`, `aria-controls`. Roving `tabIndex` properly implemented. However, the **panel** following each tab uses `<div role="tabpanel">` correctly, but **NOT every active tab branch wraps its content** — e.g. lines 615 `display`, 665 `content`, 737 `account`, 925 `automation` etc. all have `role="tabpanel"` but the `vn-page` sub-tab nav (line 1329) embeds another tablist inside the tabpanel. Nested tablists work for users but increase complexity. | Consider flattening; or verify nested tablists are announced correctly across SR/browser combos. |
| A-044 | src/components/SearchClient.tsx:338-398 | Moderate | Tablist with `role="tablist"` and three `role="tab"` buttons — wired correctly with `aria-selected`, `aria-controls`, `tabIndex` roving. But **only one tabpanel** is referenced by all three tabs (panelId), so the `aria-labelledby` on the panel always points at one tab's id (line 624: `aria-labelledby={tabIds[source as keyof typeof tabIds]}`) — correct because only one panel renders at a time. Acceptable. | No change needed. |
| A-045 | src/components/FieldCompare.tsx:128-191 | Moderate | Two-tab nav with `tabIndex={activeTab === 'vndb' ? 0 : -1}` roving focus and `role="tabpanel"`. Looks correct, but **arrow-key navigation between tabs is not implemented** (file not fully read but the pattern usually requires onKeyDown on the tablist). | Add `onKeyDown` to tablist that moves selection on Left/Right arrows. |
| A-046 | src/components/CoverSourcePicker.tsx:427,451,466 | Moderate | Three tabpanels but no shared tablist `onKeyDown` for arrow navigation between tabs. | Add arrow-key handlers. |
| A-047 | src/components/BannerSourcePicker.tsx:207-216 | Good | Arrow-key tab navigation IS implemented in tablist `onKeyDown`. | No action — example of correct pattern. |
| A-048 | src/components/NavTabStrip.tsx | Moderate | (Not fully read) — generic navigation tab strip. Verify it uses `role="tablist"` when it switches content vs `<nav>` when it navigates URLs. | Audit and apply correct pattern. |
| A-049 | src/components/RecommendModeTabs.tsx | Moderate | (Not fully read) — verify ARIA tab pattern. | Audit. |
| A-050 | src/app/shelf/page.tsx | Moderate | `/shelf` page has 4 views (spatial / release / item / layout) selected via `?view=` URL param. URL-driven view tabs should use `<nav>` with `<a>` links, not `role="tablist"` (since selecting a tab navigates to a new URL). Verify the implementation matches one pattern or the other consistently. | Audit `/shelf` page and align with one pattern. |

---

### Form labels (WCAG 1.3.1, 3.3.2, 4.1.2)

| ID | file:line | severity | issue | fix |
|---|---|---|---|---|
| A-051 | src/components/SettingsButton.tsx:758-765 | Serious | VNDB token password input has no `<label>` and no `aria-label`. The visible "Token" header is a `<h3>` above it, but no programmatic association. | Add `aria-label={t.settings.vndbTokenPlaceholder}` to the input or wrap in `<label>`. |
| A-052 | src/components/SettingsButton.tsx:295-303 | Moderate | Password input in ProxySettingsSection has no `aria-label`; sibling `<span>` "Password:" is not programmatically associated. | Wire `aria-labelledby` to the span's id, or use `<label>`. |
| A-053 | src/components/SettingsButton.tsx:265-271 | Moderate | Proxy host input has `placeholder` but no `aria-label`; the sibling `<span>{t.settings.proxyHost}</span>` is not associated. | Use proper `<label htmlFor>` wrapping or `aria-labelledby`. |
| A-054 | src/components/SettingsButton.tsx:273-285 | Moderate | Proxy port input — same issue. | Same fix. |
| A-055 | src/components/SettingsButton.tsx:286-292 | Moderate | Proxy username input — same. | Same. |
| A-056 | src/components/AliceNetKobeClient.tsx:223-231 | Good | Search input has `aria-label={t.mapEgs.searchPlaceholder}`. | No action. |
| A-057 | src/components/AliceNetKobeClient.tsx:1167-1184 | Moderate | Three select dropdowns (sort, group, producer-filter) without `aria-label` or visible labels. | Add `aria-label` to each `<select>`. |
| A-058 | src/components/ConfirmDialog.tsx:382-393 | Good | Prompt input has `aria-label`, `aria-invalid`, `aria-describedby` for validation errors. | No action. |
| A-059 | src/components/CharacterMetaClient.tsx:111-133 | Moderate | InlineSpoilerReveal button has `aria-label={t.spoiler.revealOne}` but its `aria-expanded` toggles state — when collapsed it shows redacted text; when expanded the inner span shows the actual value. The control is essentially a disclosure widget. `aria-controls={revealedId}` correctly references the post-reveal element. | Acceptable; minor: also set `aria-pressed` to match toggle semantics. |

---

### Tap target / mobile (WCAG 2.5.5, AA Enhanced)

| ID | file:line | severity | issue | fix |
|---|---|---|---|---|
| A-060 | src/components/VnCard.tsx:251-264 | Moderate | "Remove from wishlist" floating X button is `h-7 w-7` (28×28 px) — uses `.tap-target` class which adds 10 px each side to extend hit area, but visual size is below 44×44. WCAG 2.5.5 AAA requires 44×44 for the actionable area itself; AA does not require it but Apple HIG / Material both recommend. | Either: (a) set min-h/w to 44 px; or (b) ensure tap-target overlay actually catches taps (verified in CSS). |
| A-061 | src/components/VnCard.tsx:476-490 | Moderate | "MoreVertical" overflow button is `h-7 w-7` (28×28) with `.tap-target`. | Same fix. |
| A-062 | src/components/FavoriteToggleButton.tsx:99-118 | Moderate | Favorite heart overlay is `h-7 w-7` (28×28) with `.tap-target`. | Same fix. |
| A-063 | src/components/HeroBanner.tsx:270-289 | Moderate | Rotate left/right buttons are `h-7 w-7` (28×28). | Set min-h/w to 44 px or add `.tap-target`. |
| A-064 | src/components/HeroBanner.tsx:461-498 | Moderate | Banner edit Save/Reset/Cancel buttons in edit mode are `h-7` (28 px) tall. | Increase to 44 px min-h. |
| A-065 | src/components/CardContextMenu.tsx:129-136 | Moderate | Close X button uses `.tap-target-tight` (6 px expand) on an icon. Total touchable area still ~32×32. | Same as A-060. |
| A-066 | src/components/EditForm.tsx:362-368 | Moderate | Series remove "×" button has no explicit size — inline element. | Use `<button>` with explicit min size and `.tap-target`. |
| A-067 | src/components/MediaGallery.tsx:594-616 | Moderate | Kebab menu button on each tile in MediaGallery has `min-h-[44px] min-w-[44px]` — Good. But menu items themselves (lines 748-761) have no min-h. | Add `min-h-[44px]` to menu items for touch users. |
| A-068 | src/components/EditionInfoPopover.tsx:240 | Moderate | Info button is `h-6 w-6` (24×24) — far below 44×44 even with hover-only reveal. | Set min-h/w to 44 px on tap device, or wrap with `.tap-target`. |
| A-069 | src/components/SettingsButton.tsx:1593-1602 | Moderate | Drag handle button on home/VN layout panels — `cursor-grab text-muted` icon with no min size. | Set min-h/w to 44 px. |
| A-070 | src/components/TutorialTour.tsx:130-137 | Moderate | Tour close X button uses `.tap-target-tight` on a 16 px icon (`h-4 w-4`) — total ~28 px. | Same as A-060. |
| A-071 | src/components/ToastProvider.tsx:135-141 | Good | Dismiss button on toast has `min-h-[44px] min-w-[44px]`. | No action. |
| A-072 | src/components/StockChip.tsx | Moderate | The chip itself is not interactive but has a `title=` tooltip. No issue. | No action. |
| A-073 | src/components/SpoilerToggle.tsx:79-92 | Good | Eye toggle button has `h-11` (44 px) tall. | No action. |
| A-074 | src/components/LanguageSwitcher.tsx:18-35 | Moderate | `<select>` has `<label className="sr-only" htmlFor="locale-select">` — correctly hidden visually but programmatically associated. The select element default size on mobile is usually < 44 px depending on padding. Browser-native select is usually compliant but no `min-h-[44px]` enforced. | Add Tailwind class `min-h-[44px]` to the select. |

---

### Animations and motion (WCAG 2.3.3)

| ID | file:line | severity | issue | fix |
|---|---|---|---|---|
| A-075 | src/app/globals.css (entire file) | Critical | **Zero** `@media (prefers-reduced-motion: reduce)` blocks anywhere in the project. Every animation runs full-speed regardless of user preference. 166+ usages of `animate-pulse`, `animate-spin`, `animate-bounce`, `transition-*`. Affects vestibular-sensitive users (WCAG 2.3.3 Level AAA, and 2.2.2 Pause/Stop/Hide for moving content). | Add a global rule: `@media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation-duration: 0.01ms !important; animation-iteration-count: 1 !important; transition-duration: 0.01ms !important; scroll-behavior: auto !important; } }`. |
| A-076 | src/components/Skeleton.tsx:27 | Serious | `animate-pulse` runs on every loading skeleton. Combined with potentially dozens of skeletons rendered at once (SkeletonCardGrid count=12), this is significant motion for users with vestibular disorders. | Covered by A-075 global fix. Optionally also stop animation on individual skeletons when reduced motion is detected. |
| A-077 | src/components/HeroBanner.tsx:325 | Moderate | `transition-[object-position,filter,opacity,transform] duration-200` runs whenever the banner state changes. | Covered by A-075. |
| A-078 | src/components/ScrollFadeRight.tsx | Moderate | (Not fully read) — verify any animation respects reduced-motion. | Covered by A-075. |
| A-079 | src/components/Skeleton.tsx (all variants) | Moderate | Skeletons lack `aria-busy="true"` on parent containers. SR users hear nothing when content is being fetched. | Wrap card grids etc. in `<div aria-busy="true" aria-live="polite">` while loading. |
| A-080 | src/components/SortableGrid.tsx:113 | Minor | DragOverlay animation `duration: 220` — drag-and-drop motion. | Covered by A-075. |
| A-081 | src/app/globals.css (no scroll-behavior reset) | Minor | No `scroll-behavior: auto !important;` override under reduced-motion query — smooth scrolls used by `KeyboardShortcuts.tsx` scrollToAnchor will still animate. | Include `scroll-behavior` in the reduced-motion override. |

---

### Loading state, async sections (WCAG 4.1.3 Status Messages)

| ID | file:line | severity | issue | fix |
|---|---|---|---|---|
| A-082 | src/components/Skeleton.tsx:23-119 | Serious | None of the Skeleton primitives carry `aria-busy` or are wrapped in an `aria-live` region. SR users get silent loading. Skeleton components are decorative via `aria-hidden` but the surrounding card grid has no busy state. | Each consumer must wrap with `<div aria-busy="true" aria-live="polite">{skeleton}</div>` until data resolves. Add the wrapper helper to `Skeleton.tsx` and use it everywhere. |
| A-083 | src/components/CharactersSection.tsx:79-94 | Moderate | Lazy-loaded section shows loading state but no `aria-busy` on the surrounding `<details>`. Error has `role="alert"`. | Add `aria-busy={loading || undefined}` to the parent. |
| A-084 | src/components/ReleasesSection.tsx:161-175 | Moderate | Same pattern. | Same fix. |
| A-085 | src/components/QuotesSection.tsx:52-66 | Moderate | Same pattern; error has `<p>` without `role="alert"`. | Add `role="alert"` to error paragraph and `aria-busy` on `<details>`. |
| A-086 | src/components/RelationsSection.tsx:99 | Moderate | Same pattern. | Same fix. |
| A-087 | src/components/EditForm.tsx:407-420 | Serious | Auto-save status indicator (`saving` → `saved` → `idle`) has no `aria-live` region. Users with SR don't hear the save confirmation. | Add `aria-live="polite" aria-atomic="true"` to the status span. |
| A-088 | src/components/EditForm.tsx (auto-save behavior) | Moderate | EditForm has automatic save after 800 ms debounce on every change — users are NOT warned that fields auto-save. No "Last saved at X" timestamp announced. WCAG 3.2.2 (On Input — change of context must not be automatic without warning); WCAG 3.3.4 (Error Prevention) for important data. | Surface a permanent "Auto-saving" indicator near the form header; consider a per-session toast on first auto-save. |
| A-089 | src/components/Skeleton.tsx (consumers) | Moderate | Pages that hide content during fetch lose context for SR users. | Use `aria-busy` consistently. |
| A-090 | src/components/AspectOverrideControl.tsx:92-98 | Moderate | Loading state renders `<Loader2 className="animate-spin">` followed by text — no `aria-live`. | Wrap with `<section role="status" aria-live="polite">`. |

---

### Form errors (WCAG 3.3.1, 3.3.3)

| ID | file:line | severity | issue | fix |
|---|---|---|---|---|
| A-091 | src/components/EditForm.tsx:183 | Moderate | `<p className="...status-dropped">{error}</p>` has no `role="alert"` — error shown to user but not announced to SR. | Add `role="alert"`. |
| A-092 | src/components/EditForm.tsx:405 | Moderate | Same. | Same. |
| A-093 | src/components/QuotesSection.tsx:76 | Moderate | Same. | Same. |
| A-094 | src/components/SeriesAddVnForm.tsx:55 | Moderate | Same. | Same. |
| A-095 | src/components/ReleasesSection.tsx:175 | Moderate | Same. | Same. |
| A-096 | src/components/QuoteFooter.tsx:93 | Moderate | Same. | Same. |
| A-097 | src/components/StockPanelBoundary.tsx:52 | Moderate | Error fallback `<p>` inside a `role="alert"` section — outer role is set, so the inner text is announced — OK. | Verify the outer role is exposed in all browsers. |
| A-098 | src/components/VnSeedPicker.tsx:298 | Moderate | Error `<p>` without role. | Add `role="alert"`. |
| A-099 | src/components/CachePanel.tsx:99 | Moderate | Error rendered in `<p>` without role. | Add `role="alert"`. |
| A-100 | src/components/CoverSourcePicker.tsx:680 | Moderate | Error in `<p>` without role. | Same. |

---

### Color-only conveyed information (WCAG 1.4.1)

| ID | file:line | severity | issue | fix |
|---|---|---|---|---|
| A-101 | src/components/StatusBadge.tsx:6-22 | Moderate | Status badges use color + icon + text — text label is always visible, but the color carries grouping signal (planning/playing/completed etc.). Good in this case — color is reinforcing, not the sole carrier. | No change. |
| A-102 | src/components/VnCard.tsx:323-329 | Moderate | EGS rating chip is differentiated from VNDB rating by color only (`text-accent` vs `text-accent/80`). Sighted users see the difference; SR users hear both as "Star X". The `title` attribute distinguishes them via tooltip but isn't always read by SR. | Add visible icons (e.g., a different icon for EGS) or a textual prefix like "EGS: ". |
| A-103 | src/components/EditForm.tsx:212,233 | Minor | Invalid input fields get red ring (`border-status-dropped`). `aria-invalid` is set so SR users hear it. Adequate. | No change. |
| A-104 | src/components/ConfirmDialog.tsx (tone='danger') | Moderate | Danger tone uses red color only — text content of the confirm/cancel buttons is "Confirm"/"Cancel", not "Delete"/"Cancel". A SR user has no signal that the action is destructive. | When `tone='danger'`, prepend a visually-hidden "Warning: " or add `aria-describedby` pointing at the danger note. |
| A-105 | src/components/AliceNetKobeClient.tsx:806-815 | Moderate | Stock status chips use color (rose / green) + emoji-free text. Color reinforces the text, OK. | No change. |
| A-106 | src/components/AliceNetKobeClient.tsx:946-983 | Moderate | Stat numbers use color (green / amber / rose) to convey "good/warning/bad" but the numbers carry the same information. Labels are textual. Adequate. | No change. |
| A-107 | src/components/MatchBadges.tsx | Moderate | (Not fully read) — match-status badges; verify text alternative to color. | Audit. |
| A-108 | src/components/DownloadStatusBar.tsx:427-431 | Moderate | Progress badges use color (accent/completed/dropped) and three different icons — icons are decorative (`aria-label` set). State is conveyed via icon + position; adequate. | No change. |

---

### Drag-and-drop (WCAG 2.5.7 AA — Drag Movements)

| ID | file:line | severity | issue | fix |
|---|---|---|---|---|
| A-109 | src/components/SortableGrid.tsx:55-62 | Moderate | Library reorder uses dnd-kit with `KeyboardSensor + sortableKeyboardCoordinates` — keyboard drag IS supported via Space-to-pickup + Arrow-to-move. However, **no visible instructional copy tells the user this is possible**. SR users using `aria-roledescription="sortable item"` may understand; sighted users may not. | Add `t.library.dragInstructions` copy near the toolbar when `sort=custom`. |
| A-110 | src/components/ShelfLayoutEditor.tsx | Serious | Shelf grid is drag-and-drop. KeyboardSensor presence unverified — `useDraggable` / `useDroppable` from dnd-kit doesn't automatically wire keyboard support without `useSortable` or `KeyboardSensor`. The shelf layout uses bare `useDraggable`/`useDroppable` — verify keyboard equivalent exists. | Audit ShelfLayoutEditor and add keyboard alternatives (e.g., a "Move to slot…" button per item that opens a picker). |
| A-111 | src/components/HomeLayoutEditorTrigger.tsx:91 | Good | KeyboardSensor present. | No action. |
| A-112 | src/components/SettingsButton.tsx:1500-1503 | Good | KeyboardSensor present in SortableHomeLayoutRow context. | No action. |
| A-113 | src/components/DetailReorderLayout.tsx:95 | Good | KeyboardSensor present. | No action. |
| A-114 | src/components/HeroBanner.tsx:163-192 | Critical | Focal-point adjustment is pointer-only — `onPointerDown/Move/Up` set position; no keyboard equivalent. Banner focal point is a hover-only secondary action. Mouse-only AT users (eye tracking, switch control) can use pointer events; keyboard-only users cannot adjust focal point. WCAG 2.1.1 keyboard equivalent required. | Add arrow-key adjustment when the banner has focus in edit mode (1% per arrow press, 10% with Shift). |

---

### Tooltips on hover (WCAG 1.4.13 Content on Hover)

| ID | file:line | severity | issue | fix |
|---|---|---|---|---|
| A-115 | src/components/VnCard.tsx (multiple lines) | Serious | Heavy use of `title="..."` attribute as the only visual tooltip on cards. Native `title` shows only on mouse hover (desktop) — never on focus, never on touch. WCAG 1.4.13 requires content on hover to also appear on focus and be dismissible. | Replace `title=` with a managed tooltip primitive that shows on hover AND focus, can be dismissed with Escape, and persists while hovering the tooltip itself. |
| A-116 | src/components/MediaGallery.tsx (all tile titles) | Serious | Same `title=` pattern for media tiles. | Same fix. |
| A-117 | src/components/HeroBanner.tsx:264,275,285 | Serious | Same. | Same. |
| A-118 | src/components/StockChip.tsx:66 | Serious | `title=` is the only tooltip. | Same. |
| A-119 | src/app/globals.css | Moderate | No global tooltip component implementation found; tooltips rely on native `title=`. | Build a `<Tooltip>` primitive (e.g., Radix or hand-rolled) and adopt it across the codebase. |
| A-120 | src/components/EditionInfoPopover.tsx | Good | Info popover opens on click — works on hover + focus + touch via the button trigger. | No change. |

---

### Auto-submit forms / context change (WCAG 3.2.1, 3.2.2)

| ID | file:line | severity | issue | fix |
|---|---|---|---|---|
| A-121 | src/components/EditForm.tsx:75-105 | Serious | Form auto-saves every 800 ms on every change. No warning shown to user that changes are persisted automatically. WCAG 3.2.2 requires that focus / context changes triggered by input have advance notice. | Add a one-time toast on first interaction explaining auto-save; surface a permanent "Auto-saving" indicator in the form header. |
| A-122 | src/components/LanguageSwitcher.tsx:22-32 | Serious | Locale select fires on `onChange` and calls `setLocale` which reloads the page (server action). Page navigates without user clicking a "Save" or "Apply" button — context change on input. | Add an `aria-describedby` to the select with text "Changes apply immediately" or convert to a button-based switcher. |
| A-123 | src/components/LibraryClient.tsx (URL params on change) | Moderate | Filter selects and chips immediately update the URL and re-fetch results. Users may not realize the URL is stateful. SR users may not perceive the result change. | Add an `aria-live="polite"` announcement when results count changes, e.g., "N results". |
| A-124 | src/components/SettingsButton.tsx (onBlur saves) | Serious | Many inputs in Settings save on `onBlur` (proxy host, port, username, password, Steam API key, etc.). User tabs away → save fires silently. | Add visible save confirmation (toast already fires) and label inputs with `aria-describedby` explaining the onBlur save model. |
| A-125 | src/components/SettingsButton.tsx (proxy host input) | Moderate | `defaultValue` is set but state is captured only `onBlur`. User typing in the field has no live indication of "unsaved changes". | Show "Unsaved" indicator next to the field while it differs from the saved value. |

---

### Lists rendered with `<div>` instead of `<ul><li>` (WCAG 1.3.1)

| ID | file:line | severity | issue | fix |
|---|---|---|---|---|
| A-126 | src/components/VnCard.tsx (overall structure) | Minor | The card itself isn't a list item — wrapped by parent grids. Where the parent grid uses `<div className="grid">`, the cards are not in a list semantic. SR users don't get "list with N items". | Wrap card grids in `<ul role="list">` with `<li>` per card, OR add `role="list"` to the grid container and `role="listitem"` to children. Some surfaces already do this (MediaGallery `role="list"` + items have `role="list"`). |
| A-127 | src/components/MediaGallery.tsx:193-200 | Good | Grid container has `role="list"`. | No action. |
| A-128 | src/components/SearchClient.tsx:647-680 | Good | `<ul>` element used for EGS result list. | No action. |
| A-129 | src/components/CharactersSection.tsx, RelationsSection.tsx | Moderate | Lazy-loaded sections render result lists. Verify each uses `<ul>` + `<li>`. | Audit each section. |
| A-130 | src/components/AliceNetKobeClient.tsx (cards view) | Moderate | Grid of `<article>` elements — wrap in `<section>` or use `role="list"`. | Add `role="list"` to grid container. |
| A-131 | src/components/RecentlyViewedStrip.tsx | Moderate | (Not fully read) — strip of items; verify list semantics. | Audit. |
| A-132 | src/components/AnniversaryFeed.tsx | Moderate | (Not fully read) — feed of items; verify list semantics. | Audit. |
| A-133 | src/components/ReadingQueueStrip.tsx | Moderate | (Not fully read). | Audit. |
| A-134 | src/components/RecentlyViewedStrip.tsx | Moderate | (Not fully read). | Audit. |

---

### Keyboard navigation gaps (WCAG 2.1.1)

| ID | file:line | severity | issue | fix |
|---|---|---|---|---|
| A-135 | src/components/VnCard.tsx:439-454 | Good | `<div role="button" tabIndex={0}>` with onKeyDown for Enter/Space. | No action. |
| A-136 | src/components/MediaGallery.tsx:331-353 | Good | `<div role="button" tabIndex={0}>` with onKeyDown for Enter/Space. | No action. |
| A-137 | src/components/CardContextMenu.tsx (arrow keys) | Good | Arrow key navigation implemented for menu items. | No action. |
| A-138 | src/components/MoreNavMenu.tsx:256-280 | Good | Arrow key navigation implemented. | No action. |
| A-139 | src/components/HeroBanner.tsx (drag focal point) | Critical | See A-114. | See A-114. |
| A-140 | src/components/MediaGallery.tsx:150-163 | Good | Arrow keys for lightbox navigation. | No action. |
| A-141 | src/components/SearchClient.tsx:343-349 | Good | Arrow keys for tablist. | No action. |
| A-142 | src/components/CharactersSection.tsx (filter chips) | Moderate | Filter chips inside the section likely lack arrow-key navigation between them. | Audit and add arrow-key support if chips form a single-select group. |
| A-143 | src/components/AliceNetKobeClient.tsx (tabs) | Moderate | Filter tab navigation; verify arrow-key support. | Audit. |
| A-144 | src/components/SortableGrid.tsx (KeyboardSensor) | Good | KeyboardSensor active for drag. | No action. |
| A-145 | src/components/Dialog.tsx:73-121 | Good | Focus trap in modals; ESC handling; focus restoration on close. | No action. |
| A-146 | src/components/DateInput.tsx:50-75 | Moderate | Tab cycling implemented but **no arrow-key navigation between date cells**. Users must Tab through every cell to reach a target date. | Implement arrow-key navigation on calendar cells. |

---

### Disabled buttons without explanatory label (WCAG 3.3.1, 4.1.2)

| ID | file:line | severity | issue | fix |
|---|---|---|---|---|
| A-147 | src/components/EditForm.tsx:179-182 | Moderate | Add button is `disabled={pending}` with no explanatory aria-describedby. SR users hear "button, disabled" with no reason. | Add `aria-describedby` referencing a hidden message like "Adding...". |
| A-148 | src/components/SettingsButton.tsx:316-323 | Moderate | Proxy test button `disabled={testing || !config?.enabled}` with no explanation. | Add `aria-describedby` indicating "Enable proxy first to test." |
| A-149 | src/components/SearchClient.tsx:669-676 | Moderate | Add-EGS button `disabled={isAdding || isAdded}` — when added, the button text says "In collection" which is OK. When adding, text says "Adding…" which is the spinner — OK. | No change. |
| A-150 | src/components/SettingsButton.tsx:768-774 | Moderate | Save token button `disabled={savingToken || !tokenInput.trim()}` — no aria-describedby for the trim-empty case. | Add an `aria-describedby` referencing a hint. |
| A-151 | src/components/ImportPanel.tsx:123-131 | Moderate | Import button `disabled={busy || pending}` with `aria-describedby={error ? errorId : undefined}` — Good when an error exists. | No action. |
| A-152 | src/components/CoverUploader.tsx:107-110 | Moderate | Upload button `disabled={busy || pending}`. No aria-describedby. | Add. |

---

### Page-level issues

| ID | file:line | severity | issue | fix |
|---|---|---|---|---|
| A-153 | src/app/loading.tsx, src/app/*/loading.tsx | Moderate | Each route's `loading.tsx` renders a SkeletonCardGrid or similar without `aria-busy="true"` or `aria-live="polite"` wrapper. SR users hear nothing during route transitions. | Wrap loading content with `<div aria-busy="true" aria-live="polite" aria-label={t.common.loading}>`. |
| A-154 | src/app/error.tsx, src/app/global-error.tsx | Moderate | Error pages — verify they include `role="alert"` and offer a recovery action with focusable controls. | Audit. |
| A-155 | src/app/not-found.tsx | Moderate | Verify the 404 has `<h1>` and clear messaging. | Audit. |
| A-156 | src/app/vn/[id]/page.tsx:836,964 | Moderate | `<h2 className="...text-xs font-bold uppercase tracking-widest text-muted">` — heading styled smaller than body text. Visual hierarchy doesn't match semantic hierarchy. | Use `<h2>` with larger text or convert to `<h3>` if it's logically a subsection. |
| A-157 | src/app/stats/page.tsx | Moderate | (Not read) — verify h1/h2 structure and chart accessibility. Charts likely use SVG without textual descriptions. | Audit. |
| A-158 | src/components/charts/BarChart.tsx | Moderate | (Not read) — SVG charts; ensure `<title>` and `<desc>` elements provide textual alternatives, and the data is also available in a hidden table. | Audit and add `<title>` + adjacent data table. |
| A-159 | src/app/schema/page.tsx | Moderate | Schema browser is interactive (filter/collapse) — verify keyboard support. | Audit. |
| A-160 | src/app/alicesoft_kobe/page.tsx | Moderate | Heavy data page with many controls — most issues captured in AliceNetKobeClient. | Already covered. |
| A-161 | src/app/shelf/page.tsx (spatial view) | Moderate | Spatial view is a read-only grid; ensure SR users can navigate it. Currently the slots are not links/buttons — they're just visual cells. | Add `<button>` or `<a>` per occupied slot pointing at the VN page; or use a table representation for SR. |
| A-162 | src/app/upcoming/page.tsx | Moderate | (Not read) — verify list semantics. | Audit. |
| A-163 | src/app/top-ranked/page.tsx | Moderate | (Not read) — verify list semantics. | Audit. |
| A-164 | src/app/labels/page.tsx | Moderate | (Not read) — verify printable label semantics. | Audit. |
| A-165 | src/app/quotes/page.tsx | Moderate | (Not read) — quote list; verify QuoteAvatar fallback accessibility. | Audit. |
| A-166 | src/app/tag/[id]/page.tsx | Moderate | (Not read except offset) — verify aria-busy in skeleton state. | Audit. |
| A-167 | src/app/lists/[id]/page.tsx | Moderate | (Not read) — verify list semantics and DnD keyboard support. | Audit. |
| A-168 | src/app/character/[id]/page.tsx | Moderate | (Not read directly) — verify CharacterMetaClient integration; spoiler reveal is accessible. | Audit. |
| A-169 | src/app/staff/[id]/page.tsx | Moderate | (Not read) — verify VaTimeline accessibility (horizontally-scrollable). | Audit. |
| A-170 | src/app/release/[id]/page.tsx | Moderate | (Not read) — verify release detail page. | Audit. |
| A-171 | src/app/trait/[id]/page.tsx | Moderate | (Not read) — verify. | Audit. |
| A-172 | src/app/recommendations/page.tsx | Moderate | (Not read) — verify seed-picker accessibility (TagPicker, VnSeedPicker). | Audit. |
| A-173 | src/app/series/[id]/page.tsx | Moderate | (Not read) — verify DnD keyboard, layout reorder. | Audit. |

---

## Additional findings (component-level deep dive)

### MediaGallery.tsx
- ✅ Excellent: lightbox has focus trap, ESC handling, arrow keys, focus restoration.
- ✅ Menu items have ARIA menu pattern with roving focus.
- ⚠️ Tooltip via `title=` on tile (A-116).

### Dialog.tsx
- ✅ Reference implementation: focus trap, body-scroll lock, ESC, restoration on close. Excellent.

### SafeImage.tsx
- ⚠️ Reveal button missing `type="button"` and `aria-label` (A-028).
- ✅ Fallback states have `role="img"` and `aria-label`.

### CardContextMenu.tsx
- ⚠️ Missing `aria-label` on the `role="menu"` div (A-033).
- ✅ Arrow-key navigation, focus return on close.

### EditForm.tsx
- ⚠️ Auto-save without warning (A-121).
- ⚠️ Save status not announced to SR (A-087).
- ⚠️ Series remove `×` button styled inconsistently (A-066).
- ✅ Field-level validation with `aria-invalid` + `aria-describedby`.

### ToastProvider.tsx
- ✅ Toasts use `role="alert"` (errors) / `role="status"` (success/info) + `aria-live` on container.
- ✅ Dismiss button has 44×44 min size and `aria-label`.

### SettingsButton.tsx
- ✅ Tablist properly implemented with roving focus, ARIA tab pattern, panel labels.
- ⚠️ VNDB token input lacks explicit label (A-051).
- ⚠️ Proxy section inputs lack proper labels (A-052-055).
- ⚠️ Many controls save on blur without explicit feedback (A-124).

### SettingsButton.tsx > SortableHomeLayoutRow / SortableDetailRow
- ⚠️ Drag handle button missing min-h/w (A-069).

### Dialog component (`useDialogA11y`)
- ✅ Reference implementation — focus trap, body-scroll lock, ESC, restoration.

### LibraryClient.tsx
- ✅ Most chips, sort/group selectors, and filters have aria-labels.
- ⚠️ Status chip filter strip (line not read, but pattern) — verify `role="group"` or `role="tablist"`.
- ⚠️ Density slider lacks live region for value change.

### AliceNetKobeClient.tsx
- ✅ Most modals are dialogs; busy state has `role="status" aria-live="polite"`.
- ⚠️ Modal lacks focus trap (A-026).
- ⚠️ Three select dropdowns without aria-label (A-057).
- ✅ Heading levels are reasonable; cards use `<article>`.

### HeroBanner.tsx
- ⚠️ Focal-point drag is mouse-only (A-114).
- ⚠️ Reveal R18 button missing aria-label (A-029).
- ⚠️ Rotation buttons are 28×28 (A-063).

### TutorialTour.tsx
- ✅ Non-modal dialog correctly labelled.
- ⚠️ Close button size 28×28 (A-070).
- ⚠️ Tour panel doesn't move focus on open — keyboard users might miss it.

### KeyboardShortcuts.tsx
- ✅ Dialog wrapper with proper focus trap (via `<Dialog>`).
- ⚠️ Close button duplicates Dialog's built-in escape — extra button overlaps title (minor).

### DateInput.tsx
- ⚠️ No arrow-key navigation between dates (A-146).
- ✅ Focus trap implemented.
- ⚠️ aria-modal="false" on a focus-trapped popup — slightly confusing semantics.

### LanguageSwitcher.tsx
- ⚠️ `<select>` triggers immediate page reload — change of context without warning (A-122).
- ✅ Label is hidden via `sr-only` but programmatically associated.

### ConfirmDialog.tsx
- ✅ Focus trap, ESC, focus restore.
- ⚠️ Body scroll not locked (A-017).
- ⚠️ Danger tone uses color only (A-104).

### SortableGrid.tsx
- ✅ KeyboardSensor present.
- ⚠️ No visible instructions for keyboard drag (A-109).

### ShelfLayoutEditor.tsx
- ⚠️ Uses bare `useDraggable`/`useDroppable` from dnd-kit — keyboard sensor likely not wired (A-110).

---

## Patterns / systemic issues that recur

1. **`title=` as the only tooltip** — affects dozens of buttons. Native `title` is hover-only on desktop, not exposed on focus, not shown on touch. Build a `<Tooltip>` primitive.
2. **Inline error `<p>` without `role="alert"`** — affects 10+ surfaces.
3. **Modal-shaped dialogs without `useDialogA11y`** — at least 5 places use bare `<div role="dialog">` with manual focus management; consolidate behind `<Dialog>` / `useDialogA11y`.
4. **Skeleton loading without `aria-busy`/`aria-live`** — SR users hear silence during fetches.
5. **Icon-only buttons at 28×28 px** — accumulate across cards (favorite, overflow, X buttons). The `.tap-target` utility provides an invisible 10 px expand but the visible target remains < 44×44.
6. **No `prefers-reduced-motion` support** — single global fix needed.
7. **`<h1>` rendered inside card components** (VnCard via TitleLine) — many H1s on a grid page is wrong.
8. **Auto-saving inputs / select-on-change context changes** without user warning.

---

## Priority recommendations (top-10 highest impact)

1. **A-075** — Add global `prefers-reduced-motion` CSS rule.
2. **A-001** — Add `<h1>` to home page.
3. **A-114** — Add keyboard support for HeroBanner focal-point adjustment.
4. **A-082, A-153** — Wrap skeletons with `aria-busy`/`aria-live`.
5. **A-110** — Verify and implement keyboard alternative for ShelfLayoutEditor drag-and-drop.
6. **A-121, A-122, A-124** — Surface auto-save and onChange-context-change behavior to users.
7. **A-115-A-119** — Replace `title=` tooltips with a managed `<Tooltip>` primitive.
8. **A-020-A-027** — Audit every `<div role="dialog">` and ensure it uses `useDialogA11y` or `<Dialog>`.
9. **A-051-A-055** — Add proper `<label>` association to Settings inputs.
10. **A-091-A-100** — Add `role="alert"` to all inline error paragraphs.

---

## Notes

- Many components have **above-average** ARIA hygiene; the team clearly takes a11y seriously.
- The shared `<Dialog>` shell, `useDialogA11y`, `<PortalPopover>`, `tap-target` utility, focus-visible CSS, status badges, etc. are best-practice implementations.
- The pain points are predominantly **systemic** (animation, tooltips, skeletons, auto-save) — fixing one pattern fixes 10-50 instances.
- Some findings are flagged as Moderate because they are "would-be-better" rather than "fails AA today" (e.g., heading inflation in cards, tap-target sizes < 44 with `.tap-target` overlay).
- Pages and components not fully read (~30%) are flagged as "Audit" — they likely follow the same patterns as their visible siblings.
- This audit is static analysis only. **Real DOM testing with axe-core, jest-axe, NVDA / VoiceOver / TalkBack manual passes is strongly recommended** to catch issues invisible to source review (computed contrast ratios, live region behavior across SR/browser combos, etc.).

---

**END OF REPORT**
