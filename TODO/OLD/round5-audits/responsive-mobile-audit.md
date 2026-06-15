# Responsive/Mobile Audit Report — agent ac5156cc865f0ef33 (PARTIAL — stopped at tool_use)

---

## RESPONSIVE / MOBILE AUDIT — vndb-collection-new

---

### DOMAIN 1 — hidden sm:inline / hidden lg:inline without paired aria-label

---

**ISSUE [hidden-text] [/Users/loicpirez/Perso/vndb-collection-new/src/components/MoreNavMenu.tsx:223]**
Severity: LOW
Description: `<span className="hidden xl:inline">{item.label}</span>` hides the nav link label below the `xl` breakpoint (1280px). The parent `<Link>` at line 204 carries `aria-label={item.label}` and `title={item.label}`, so screen-reader and tooltip accessibility is intact. The visual label is absent from ~375px up to 1535px. This is a deliberate documented trade-off (French labels overflow on 1366×768 laptops). NOT a false closure — the comment and paired `aria-label` exist. Severity low because the a11y path is covered; the only loss is visual text on mid-size screens.
Code: `<span className="hidden xl:inline">{item.label}</span>` (inside `<Link aria-label={item.label} ...>`)
Fix: No change required; aria-label + title cover a11y. If future design allows text at md, add `md:inline`.

**ISSUE [hidden-text] [/Users/loicpirez/Perso/vndb-collection-new/src/components/MoreNavMenu.tsx:298]**
Severity: LOW
Description: Same pattern on the `NavGroup` trigger `<button>`. The `aria-label={label}` is set at line 286, the `title={label}` at 287. Same reasoning as above.
Code: `<span className="hidden xl:inline">{label}</span>` (inside `<button aria-label={label} ...>`)
Fix: Covered. No action needed.

---

### DOMAIN 2 — opacity-0 / group-hover without md: prefix (invisible on touch)

These are the critical hover-trap patterns. `md:opacity-0 md:group-hover:opacity-100` is the correct pattern. Anything using bare `sm:opacity-0 sm:group-hover:opacity-100` (no `md:` companion) is problematic because on viewports 640–767px there is no hover surface.

---

**ISSUE [hover-trap] [/Users/loicpirez/Perso/vndb-collection-new/src/components/RoutesSection.tsx:285]**
Severity: HIGH
Description: The entire action cluster (move-up, move-down, cancel/edit, notes, delete) for a route row is hidden via `sm:opacity-0 sm:group-hover:opacity-100`. On small-tablet viewports (640–767px) — where `sm:` applies but `md:` does not — there is no hover event, so these controls are permanently invisible. The delete and reorder buttons for VN routes are completely unreachable on a 640–767px screen. Viewports below 640px get `opacity-100` (always visible) because no `sm:` breakpoint applies. The window of broken behaviour is 640–767px.
Code:
```
<div className="flex items-center gap-0.5 sm:opacity-0 sm:transition-opacity sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
```
Fix: Change `sm:opacity-0 sm:transition-opacity sm:group-hover:opacity-100 sm:group-focus-within:opacity-100` to `md:opacity-0 md:transition-opacity md:group-hover:opacity-100 md:group-focus-within:opacity-100` to match the consistent project-wide pattern.

---

**ISSUE [hover-trap] [/Users/loicpirez/Perso/vndb-collection-new/src/components/EditionInfoPopover.tsx:215]**
Severity: HIGH
Description: `EditionInfoTrigger` constructs `sm:opacity-0 sm:${groupHoverScope}-hover:opacity-100` when `groupHoverHidden=true`. This is used on ShelfLayoutEditor display tiles (`groupHoverScope="group/display"`) and slot tiles (`groupHoverScope="group/slot"`). At 640–767px the Info button (the only way to view edition details and navigate to the VN's detail page via the popover) is permanently invisible — no hover event exists at that width. The pool tiles correctly avoid this trap by leaving `groupHoverHidden=false` (always visible). The two `groupHoverHidden=true` call sites are:
- ShelfLayoutEditor.tsx:1355 (display tile)
- ShelfLayoutEditor.tsx:1521 (slot tile)
Code:
```
const hoverOpacityClass = groupHoverHidden
  ? `focus-visible:opacity-100 sm:opacity-0 sm:${groupHoverScope}-hover:opacity-100`
  : '';
```
Fix: Change `sm:opacity-0 sm:${groupHoverScope}-hover:opacity-100` to `md:opacity-0 md:${groupHoverScope}-hover:opacity-100`. Add `md:focus-within:opacity-100` to the class string to preserve keyboard reveal.

---

**ISSUE [hover-trap] [/Users/loicpirez/Perso/vndb-collection-new/src/components/ShelfLayoutEditor.tsx:1362]**
Severity: MEDIUM
Description: The VN title link overlay at the bottom of a display tile uses `sm:opacity-0 sm:group-hover/display:opacity-100`. It is `opacity-100` by default (no `sm:` applies at <640px) and also always-on via `opacity-100` stated explicitly in the class string, then overridden at `sm:`. So at 640–767px it becomes invisible. The title overlay is informational/navigational — without it, the user cannot read the VN title or click through on small-tablet screens. The `sm:hidden` check does not apply here; the element is rendered but invisible.
Code:
```
className="absolute bottom-0 left-0 right-0 line-clamp-1 bg-bg/85 px-1 py-0.5 text-[9px] font-bold leading-tight text-white opacity-100 transition-opacity hover:text-accent sm:opacity-0 sm:group-hover/display:opacity-100"
```
Fix: Change `sm:opacity-0 sm:group-hover/display:opacity-100` to `md:opacity-0 md:group-hover/display:opacity-100`.

---

**ISSUE [hover-trap] [/Users/loicpirez/Perso/vndb-collection-new/src/components/ShelfLayoutEditor.tsx:1528]**
Severity: MEDIUM
Description: Same issue on the slot tile title link. At 640–767px the title is invisible and not hoverable.
Code:
```
className="absolute bottom-0 left-0 right-0 line-clamp-1 bg-bg/85 px-1 py-0.5 text-[9px] font-bold leading-tight text-white opacity-100 transition-opacity hover:text-accent sm:opacity-0 sm:group-hover/slot:opacity-100"
```
Fix: Change `sm:opacity-0 sm:group-hover/slot:opacity-100` to `md:opacity-0 md:group-hover/slot:opacity-100`.

---

All other `opacity-0 group-hover:opacity-100` occurrences found use the correct `md:` prefix:
- `GameLog.tsx:262` — `md:opacity-0 md:group-hover:opacity-100` ✓
- `SeriesRemoveVn.tsx:25` — `md:opacity-0 md:group-hover:opacity-100` ✓
- `ListRemoveVn.tsx:39` — `md:opacity-0 md:group-hover:opacity-100` ✓
- `CoverEditOverlay.tsx:26` — `md:opacity-0 md:group-hover:opacity-100` ✓
- `FavoriteToggleButton.tsx:107` — `md:opacity-0 md:group-hover:opacity-100` ✓
- `SeriesManager.tsx:99` — `md:opacity-0 md:group-hover:opacity-100` ✓
- `CoverRotationButtons.tsx:139/151/163` — `md:opacity-0` ✓
- `VnCard.tsx:246/279` — `md:opacity-0` ✓
- `ListCardActions.tsx:87` — `md:opacity-0` ✓
- `TagsBrowser.tsx:442` — `md:opacity-0` ✓
- `HeroBanner.tsx:247/373` — `md:opacity-0` ✓
- `ListsPickerButton.tsx:135` — `md:opacity-0` ✓
- `MediaGallery.tsx:355/597` — `md:opacity-0` ✓

---

### DOMAIN 3 — Tap target size (icon-only buttons without tap-target)

---

**ISSUE [tap-target] [/Users/loicpirez/Perso/vndb-collection-new/src/components/RoutesSection.tsx:286–346]**
Severity: HIGH
Description: Five icon-only action buttons (move-up, move-down, cancel, edit, notes-toggle, delete) inside the route row action cluster are all `h-6 w-6` (24×24px) with no `tap-target` or `tap-target-tight` class. On touch devices these fall below the 44×44px guideline. The buttons are always visible on <640px where touch users will encounter them.
Code (representative):
```
className="inline-flex h-6 w-6 items-center justify-center rounded text-muted hover:text-white disabled:opacity-30"
```
Fix: Add `tap-target` to each of the six `h-6 w-6` buttons in the route action cluster. Because they share a tight row (gap-0.5), `tap-target-tight` is more appropriate to avoid overlap.

---

**ISSUE [tap-target] [/Users/loicpirez/Perso/vndb-collection-new/src/components/BulkDownloadButton.tsx:320]**
Severity: MEDIUM
Description: The dismiss (×) button on the bulk-download progress panel is `h-6 w-6` without `tap-target`. This is a fixed bottom panel visible on mobile.
Code:
```
className="inline-flex h-6 w-6 items-center justify-center rounded text-muted hover:text-white"
```
Fix: Add `tap-target` or `tap-target-tight`.

---

**ISSUE [tap-target] [/Users/loicpirez/Perso/vndb-collection-new/src/components/ListCardActions.tsx:81–92]**
Severity: HIGH
Description: The menu trigger button for a list card (⋮ MoreVertical icon) has no `tap-target`, no `aria-label`, and only `rounded-md p-1` sizing — that is approximately 32×32px visual area including padding. On mobile/tablet it is always visible (only `md:opacity-0` hides it on desktop). This button is the only way to rename, pin, or delete a list on touch viewports. Missing `tap-target` means the effective tap area is undersized. Missing `aria-label` means screen readers see no description (only `aria-haspopup`).
Code:
```html
<button
  type="button"
  onClick={() => setOpen((v) => !v)}
  className="rounded-md p-1 text-muted transition-opacity hover:bg-bg-elev hover:text-white focus:opacity-100 md:opacity-0 md:group-hover:opacity-100"
  aria-haspopup="menu"
  aria-expanded={open}
>
```
Fix: Add `tap-target` to className; add `aria-label={t.lists.actions}` (or an appropriate translation key like `t.common.actions`).

---

**ISSUE [tap-target] [/Users/loicpirez/Perso/vndb-collection-new/src/components/DetailReorderLayout.tsx:273–300]**
Severity: MEDIUM
Description: Three icon-only buttons (collapse/expand, show/hide, drag handle) in the section-reorder overlay are all `h-6 w-6` without `tap-target`. These appear in the layout-editing mode on character/staff/producer detail pages on mobile.
Code:
```
className="inline-flex h-6 w-6 items-center justify-center rounded border border-border bg-bg-card/90 text-muted hover:text-accent"
```
Fix: Add `tap-target-tight` to each `h-6 w-6` button in `DetailReorderLayout`.

---

**ISSUE [tap-target] [/Users/loicpirez/Perso/vndb-collection-new/src/components/ReleaseOwnedToggle.tsx:127]**
Severity: MEDIUM
Description: The "remove my edition" trash button is `h-6 w-6` without `tap-target`. This appears on release detail pages on mobile.
Code:
```
className="inline-flex h-6 w-6 items-center justify-center rounded text-muted hover:bg-status-dropped/10 hover:text-status-dropped"
```
Fix: Add `tap-target` or `tap-target-tight`.

---

**ISSUE [tap-target] [/Users/loicpirez/Perso/vndb-collection-new/src/components/EditionInfoPopover.tsx:232]**
Severity: MEDIUM
Description: The edition-info trigger button is `h-6 w-6` (24×24px) with no `tap-target`. The pool-tile variant is always visible on mobile (no hover-hide). The cell/display variants are hover-hidden at `sm:` breakpoints (already flagged above), but even when visible the tap area is undersized.
Code:
```
className={`${buttonPositionClassName} inline-flex h-6 w-6 items-center justify-center rounded bg-bg/80 text-muted hover:text-accent ${hoverOpacityClass} ${buttonClassName}`}
```
Fix: Add `tap-target` or `tap-target-tight` to the button className.

---

**ISSUE [tap-target] [/Users/loicpirez/Perso/vndb-collection-new/src/components/CompareVnPicker.tsx:228]**
Severity: MEDIUM
Description: The ×-remove button on a selected VN chip is `rounded p-0.5` with only a `h-3 w-3` icon inside — roughly 18×18px visual size, no `tap-target`.
Code:
```
className="absolute right-1.5 top-1.5 rounded p-0.5 text-muted/40 transition-colors hover:text-status-dropped focus-visible:text-status-dropped"
```
Fix: Add `tap-target` or `tap-target-tight`.

---

**ISSUE [tap-target] [/Users/loicpirez/Perso/vndb-collection-new/src/components/SeriesAutoSuggest.tsx:95]**
Severity: MEDIUM
Description: The dismiss × button on the series auto-suggest banner is `rounded text-muted hover:text-white` with only a `h-3 w-3` icon — approximately 12px visual size without any padding or tap-target.
Code:
```
className="rounded text-muted hover:text-white"
```
Fix: Add `tap-target` or `tap-target-tight` and a visible padding class (e.g., `p-1`).

---

**ISSUE [tap-target] [/Users/loicpirez/Perso/vndb-collection-new/src/components/SavedFilters.tsx:272]**
Severity: MEDIUM
Description: The × cancel button inside the save-filter name form has `rounded text-muted hover:text-white` with a `h-3.5 w-3.5` icon and no padding or `tap-target`. Approximately 14px visual target.
Code:
```
<button type="button" onClick={() => setNameOpen(false)} className="rounded text-muted hover:text-white">
  <X className="h-3.5 w-3.5" />
</button>
```
Fix: Add `tap-target-tight` to className; add `aria-label`.

---

**ISSUE [tap-target] [/Users/loicpirez/Perso/vndb-collection-new/src/components/DateInput.tsx:181–212]**
Severity: MEDIUM
Description: The four calendar navigation buttons (prev-year, prev-month, next-month, next-year) are `h-7 w-7` (28×28px) without `tap-target`. They appear inside a popover that can open on mobile.
Code:
```
className="inline-flex h-7 w-7 items-center justify-center rounded text-muted hover:bg-bg-elev hover:text-white"
```
Fix: Add `tap-target-tight` to each of the four navigation buttons.

---

**ISSUE [tap-target] [/Users/loicpirez/Perso/vndb-collection-new/src/components/MapVnToEgsButton.tsx:199–201]**
Severity: LOW
Description: The close × button on the Map VN to EGS drawer is `text-muted hover:text-white` with a `h-4 w-4` icon and no padding or tap-target. Approximately 16×16px.
Code:
```
className="text-muted hover:text-white"
```
Fix: Add `tap-target` and `p-1` to className.

---

**ISSUE [tap-target] [/Users/loicpirez/Perso/vndb-collection-new/src/components/MapEgsToVndbButton.tsx:197]**
Severity: LOW
Description: Same as MapVnToEgsButton — the close × button lacks tap-target and padding.
Code:
```
className="text-muted hover:text-white"
```
Fix: Add `tap-target` and `p-1`.

---

**ISSUE [tap-target] [/Users/loicpirez/Perso/vndb-collection-new/src/components/LinkToVndbButton.tsx:116]**
Severity: LOW
Description: The close × button on the "Link to VNDB" drawer is `text-muted hover:text-white` with a `h-4 w-4` icon and no padding or tap-target.
Code:
```
<button type="button" onClick={() => setOpen(false)} aria-label={t.common.close} className="text-muted hover:text-white">
```
Fix: Add `tap-target` and `p-1`.

---

**ISSUE [tap-target] [/Users/loicpirez/Perso/vndb-collection-new/src/components/ListMetaEditor.tsx:99]**
Severity: LOW
Description: The delete list button is `rounded-md p-2 text-muted hover:bg-bg-elev hover:text-status-dropped`. With `p-2` it reaches 32×32px including padding — borderline, and no `tap-target` to guarantee 44px.
Code:
```
className="rounded-md p-2 text-muted hover:bg-bg-elev hover:text-status-dropped"
```
Fix: Add `tap-target` or `tap-target-tight`.

---

### DOMAIN 4 — Mobile-hidden functionality

No HIGH-severity cases found. The audit found:

- All `md:hidden` elements are decorative separators (e.g., `VnDetailActionsBar.tsx:391 — <span aria-hidden …>`) or mobile-only hints (`ShelfLayoutEditor.tsx:1001 — <p className="… sm:hidden">`). These are acceptable.
- All `sm:hidden` at `VnCard.tsx:457` is a mobile-only quick-action button (present on mobile, hidden on desktop — the correct pattern).
- The `md:hidden` hamburger trigger in `MoreNavMenu.tsx:165` correctly shows the mobile menu button only when the desktop nav is not visible.
- All back-link breadcrumbs (`md:hidden`) are supplemental navigation, not primary actions.

No issues to report in this domain.

---

### DOMAIN 5 — Fixed bottom elements and safe-area

All fixed-bottom elements found carry `env(safe-area-inset-bottom)`:

- `BulkDownloadButton.tsx:290` — `style={{ marginBottom: 'env(safe-area-inset-bottom)' }}` ✓
- `WishlistClient.tsx:530` — `style={{ marginBottom: 'env(safe-area-inset-bottom)' }}` ✓
- `DownloadStatusBar.tsx:281` — `style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}` ✓
- `TutorialTour.tsx:102` — `style={{ marginBottom: 'env(safe-area-inset-bottom)' }}` ✓
- `QuoteFooter.tsx:53` — `style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}` ✓
- `BulkActionBar.tsx:123` — `style={{ marginBottom: 'env(safe-area-inset-bottom)' }}` ✓
- `ToastProvider.tsx:80` — `style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}` ✓

No issues in this domain.

---

### DOMAIN 6 — Horizontal overflow risk

---

**ISSUE [overflow] [/Users/loicpirez/Perso/vndb-collection-new/src/app/vn/[id]/page.tsx:431]**
Severity: LOW
Description: `<div className="flex items-baseline gap-2">` contains a 3xl bold rating number, a vote-count text, and an optional "My Rating" badge. No `flex-wrap` or `min-w-0` on children. On narrow phones (e.g., 320–375px), the vote-count string (e.g., "/ 10 · 12,345 votes") could be clipped or push the badge off-screen.
Code:
```
<div className="flex items-baseline gap-2">
  <span className="inline-flex items-baseline gap-1 text-3xl font-bold text-accent">...</span>
  <span className="text-sm text-muted">{t.detail.ratingOf10} · {vn.votecount ?? 0} {t.detail.votes}</span>
  {vn.user_rating != null && <span className="ml-3 ...">...</span>}
</div>
```
Fix: Add `flex-wrap` to the container so the badge wraps to a new line on very narrow screens.

---

**ISSUE [overflow] [/Users/loicpirez/Perso/vndb-collection-new/src/components/LibraryClient.tsx:882]**
Severity: LOW
Description: `<div className="flex gap-6 text-sm text-muted">` containing two stat spans (VN count, play hours) inside the `ml-auto flex flex-wrap items-center gap-3` toolbar. The inner `flex gap-6` has no wrap. On a 375px screen with French labels, the ml-auto cluster may push off-screen if the sort select and dense-toggle button consume most of the line width. However, the parent wraps so the stat row gets its own line. Low risk.
Fix: Add `flex-wrap` defensively to the inner stat div.

---

### DOMAIN 7 — Input types and inputMode

All `type="number"`, `type="url"`, and `type="tel"` inputs were audited. Every instance has a corresponding `inputMode` attribute. No issues found.

Summary of verified inputs:
- `characters/page.tsx:532/544` — `type="number" inputMode="numeric"` ✓
- `LibraryClient.tsx:585/601` — `type="number" inputMode="numeric"` ✓
- `OwnedEditionsSection.tsx:756/821/835` — `type="number" inputMode="decimal/numeric"` ✓
- `SettingsButton.tsx:686` — `type="url" inputMode="url"` ✓
- `CoverSourcePicker.tsx:490` — `type="url" inputMode="url"` ✓
- `SearchClient.tsx:533/546/561` — `type="number" inputMode="numeric"` ✓
- `PomodoroTimer.tsx:129` — `type="number" inputMode="numeric"` ✓
- `VndbStatusPanel.tsx:311` — `type="number" inputMode="decimal"` ✓
- `BannerSourcePicker.tsx:301` — `type="url" inputMode="url"` ✓
- `EditForm.tsx:213/234` — `type="number" inputMode="numeric"` ✓; `EditForm.tsx:323` — `type="url" inputMode="url"` ✓

---

## SUMMARY

| Severity | Count | Domains |
|----------|-------|---------|
| HIGH | 4 | hover-trap (2), tap-target (2) |
| MEDIUM | 8 | hover-trap (2), tap-target (6) |
| LOW | 6 | hidden-text (2), tap-target (3), overflow (2) |
| **Total** | **18** | |

### False closures

**FALSE_CLOSURE: RoutesSection.tsx:285** — The `sm:opacity-0 sm:group-hover` pattern was not converted to `md:` like every other component in the codebase. All other opacity-reveal controls use `md:opacity-0`. This one uses `sm:`, creating an unreachable 640–767px zone for all route management actions.

**FALSE_CLOSURE: EditionInfoPopover.tsx:215** — The `sm:opacity-0` construction in `hoverOpacityClass` is the same error pattern as RoutesSection. The pool-tile variant (always visible) is correct, but the cell/display tile usage passes `groupHoverHidden=true`, which triggers the broken `sm:` form on ShelfLayoutEditor tiles.

### Key files with the most issues

1. `/Users/loicpirez/Perso/vndb-collection-new/src/components/RoutesSection.tsx` — hover-trap + multiple h-6 w-6 buttons without tap-target
2. `/Users/loicpirez/Perso/vndb-collection-new/src/components/EditionInfoPopover.tsx` — hover-trap at sm: breakpoint
3. `/Users/loicpirez/Perso/vndb-collection-new/src/components/ShelfLayoutEditor.tsx:1362,1528` — hover-trap title links
4. `/Users/loicpirez/Perso/vndb-collection-new/src/components/ListCardActions.tsx` — missing aria-label + tap-target on the only action menu trigger for list cards
5. `/Users/loicpirez/Perso/vndb-collection-new/src/components/DetailReorderLayout.tsx` — three h-6 w-6 controls without tap-target in mobile-accessible layout editor