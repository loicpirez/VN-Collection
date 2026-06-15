# Component Library Audit — Round 5
**Scope**: Every `.tsx` file under `src/components/`
**Type**: Read-only, cold audit. No source files were modified.
**Dimensions checked**: Correctness · UX/Behavior · Accessibility · Code quality · Security

---

## Summary

| Severity | Count |
|----------|-------|
| HIGH     | 3     |
| MEDIUM   | 23    |
| LOW      | 10    |
| **Total**| **36**|

### HIGH-issue components
- `MediaGallery.tsx` — stale-closure keyboard handler
- `AspectOverrideControl.tsx` — abort controller never registered
- `TagsBrowser.tsx` — ARIA role antipattern

### Recurring cross-component patterns
1. **Bare error strings instead of `readApiError`** — 7 components use raw strings or `t.common.error` directly instead of the shared `readApiError(r, t.common.error)` helper (OwnedEditionsSection, RoutesSection, SeriesManager, SeriesRemoveVn, DetailReorderLayout, ProducerLogoUpload, CachePanel).
2. **No AbortController on initial `useEffect` fetches** — 5 components start fetches in effects without a cancellation guard (QueueButton, ReadingGoalCard, CachePanel, SettingsButton `loadServer`, SimilarSeedPicker parallel fetch).
3. **Hardcoded `aria-pressed={false}`** — 2 components hardcode a static `false` value instead of reflecting dynamic state (CharacterMetaClient, SpoilerChip).
4. **`setTimeout` magic numbers for focus** — 3 components use ungrounded delay values for focus management (CompareWithButton 50 ms, SimilarSeedPicker 0 ms, VnSeedPicker 0 ms).

---

## Issues

---

### ISSUE [MediaGallery.tsx:144-158]
**Severity**: HIGH
**Description**: The `keydown` event handler captures `prev` and `next` via closure but the `useEffect` dependency array omits them. After the first render the handler always calls the stale initial callbacks, so keyboard navigation skips or wraps incorrectly when the active index changes.
```tsx
useEffect(() => {
  function onKey(e: KeyboardEvent) { … prev() … next() … }
  window.addEventListener('keydown', onKey);
  return () => window.removeEventListener('keydown', onKey);
}, []); // missing: prev, next
```
**Fix**: Add `prev` and `next` to the dependency array, or stabilise them with `useCallback` and reference them through a ref inside the effect.

---

### ISSUE [AspectOverrideControl.tsx:65]
**Severity**: HIGH
**Description**: The `useEffect` body calls an `async` function that creates an `AbortController` and returns the cleanup inside the async body. `useEffect` does not await the returned Promise so the cleanup function is never registered — the abort is never called on unmount, leaving in-flight fetches dangling.
```tsx
useEffect(() => {
  async function load() {
    const ctrl = new AbortController();
    // …fetch uses ctrl.signal…
    return () => ctrl.abort(); // returned from async fn, not from useEffect
  }
  load();
}, [vnId]);
```
**Fix**: Move the controller creation outside the async function and return the cleanup directly from the `useEffect` callback:
```tsx
useEffect(() => {
  const ctrl = new AbortController();
  load(ctrl.signal);
  return () => ctrl.abort();
}, [vnId]);
```

---

### ISSUE [TagsBrowser.tsx — role antipattern]
**Severity**: HIGH
**Description**: The category tab switcher uses `<Link role="button">` to represent tab-like navigation items. `<Link>` has an implicit `link` role; overriding it with `role="button"` creates a semantic mismatch — screen readers announce it as a button that navigates, and keyboard behaviour is undefined (Enter activates it as a button; browsers may ignore Space). The correct pattern for a tab strip is `role="tab"` inside a `role="tablist"`, or plain `<button>` elements that update URL state via `router.push`.
```tsx
<Link role="button" href="?cat=cont" …>Content</Link>
```
**Fix**: Replace with `<button type="button">` that calls `router.push` or `router.replace`, wrap the group in `role="tablist"`, and give each button `role="tab"` + `aria-selected`.

---

### ISSUE [CardContextMenu.tsx:116-117]
**Severity**: MEDIUM
**Description**: `window.innerWidth` and `window.innerHeight` are read in the render body (inside the `cardGridColumns` helper call), causing an SSR mismatch warning and potential hydration errors on server-rendered pages.
```tsx
const cols = Math.floor(window.innerWidth / density);
```
**Fix**: Gate behind `typeof window !== 'undefined'`, or move the read into a `useEffect`/event handler.

---

### ISSUE [AddMissingVnButton.tsx:51]
**Severity**: MEDIUM
**Description**: The button's `aria-label` is set to the success toast message (`t.toast.added` = "Added to collection") rather than the action description. Screen readers announce the wrong intent before the action completes.
```tsx
aria-label={t.toast.added}
```
**Fix**: Use a dedicated `t.form.add` / "Add to collection" string as the `aria-label`.

---

### ISSUE [AnniversaryFeedView.tsx — dead prop]
**Severity**: MEDIUM
**Description**: The `emptyHint` prop is declared in the interface and passed from the parent but explicitly unused inside the component — the empty-state message is sourced from `t` instead. The dead prop adds surface area without effect.
```tsx
interface Props { emptyHint: string; … }
// emptyHint is never referenced in the JSX
```
**Fix**: Either use the prop in the empty-state render, or remove it from the interface and all call sites.

---

### ISSUE [CharacterMetaClient.tsx:127]
**Severity**: MEDIUM
**Description**: The "spoiler" button's `aria-pressed` attribute is hardcoded to `false` regardless of current state, so assistive technologies always report the button as "not pressed" even when spoilers are visible.
```tsx
<button aria-pressed={false} …>Show spoilers</button>
```
**Fix**: Bind `aria-pressed` to the actual boolean state that tracks whether spoilers are revealed.

---

### ISSUE [DropImport.tsx — stale `confirm` closure]
**Severity**: MEDIUM
**Description**: The `confirm` function from `useConfirm()` is used inside a `useEffect` drag-handler but is absent from the dependency array. If the confirm hook reference changes (e.g. context re-mount), the stale closure runs the old function.
```tsx
useEffect(() => {
  // … drag handlers call confirm(…) …
}, [/* confirm missing */]);
```
**Fix**: Add `confirm` to the effect's dependency array.

---

### ISSUE [CoverUploader.tsx — missing `type="button"`]
**Severity**: MEDIUM
**Description**: Several `<button>` elements inside `CoverUploader` are missing the `type="button"` attribute. Inside a parent `<form>`, these default to `type="submit"` and trigger form submission when clicked.
**Fix**: Explicitly set `type="button"` on every non-submit button element.

---

### ISSUE [SpoilerChip.tsx:130]
**Severity**: MEDIUM
**Description**: The "reveal" button inside `SpoilerChip` hardcodes `aria-pressed={false}`, so screen readers always announce it as unpressed even after the user has clicked to reveal the spoiler content.
```tsx
<button aria-pressed={false} …>
```
**Fix**: Bind `aria-pressed` to the actual `revealed` state variable.

---

### ISSUE [OwnedEditionsSection.tsx — bare error string]
**Severity**: MEDIUM
**Description**: The `removeEdition` function constructs the error message with a bare string instead of calling `readApiError(r, t.common.error)`, so API-returned error detail is silently discarded.
```tsx
if (!r.ok) throw new Error(t.common.error);
```
**Fix**: Replace with `throw new Error(await readApiError(r, t.common.error))`.

---

### ISSUE [QueueButton.tsx — uncancelled initial fetch]
**Severity**: MEDIUM
**Description**: The initial fetch in `useEffect` has no `AbortController`, so the state update from the response runs even if the component unmounts before the response arrives, causing a setState-on-unmounted-component warning.
```tsx
useEffect(() => {
  fetch('/api/queue/…').then(…setState…);
}, [vnId]);
```
**Fix**: Create an `AbortController`, pass `signal` to `fetch`, and return `() => ctrl.abort()` from the effect.

---

### ISSUE [ReadingGoalCard.tsx — uncancelled fetch]
**Severity**: MEDIUM
**Description**: Same pattern as QueueButton — the `useEffect` that loads goal progress does not use an `AbortController`, risking state updates on unmounted components.
**Fix**: Add `AbortController` with cleanup.

---

### ISSUE [ListsPickerButton.tsx — wrong aria-label on filter input]
**Severity**: MEDIUM
**Description**: The search input inside the lists picker popover uses an `aria-label` string that describes the overall picker, not the search action, making the field's purpose ambiguous to screen readers.
**Fix**: Use a dedicated "Search lists" / `t.lists.searchPlaceholder` string as the `aria-label`.

---

### ISSUE [ListCardActions.tsx — missing aria-label on menu trigger]
**Severity**: MEDIUM
**Description**: The overflow-menu trigger button has no `aria-label` or `aria-haspopup`, so screen readers announce it as an unnamed button with no context.
```tsx
<button type="button" onClick={…}>
  <MoreVertical … />
</button>
```
**Fix**: Add `aria-label={t.quickActions.title}` and `aria-haspopup="menu"`.

---

### ISSUE [ToastProvider.tsx — setTimeout not tracked]
**Severity**: MEDIUM
**Description**: `setTimeout` IDs returned when auto-dismissing toasts are not stored or cleared on unmount. If the provider unmounts before timers fire, React logs setState on unmounted component.
```tsx
push: (toast) => {
  …
  setTimeout(() => dismiss(id), duration); // id not stored for cleanup
}
```
**Fix**: Track timer IDs in a `Map<id, ReturnType<typeof setTimeout>>` and clear outstanding timers in a cleanup `useEffect`.

---

### ISSUE [BulkDownloadButton.tsx — module-level singleton abort ref]
**Severity**: MEDIUM
**Description**: `bulkAbortRef` is declared at module level rather than inside a `useRef`, making it shared across all rendered instances. Multiple simultaneous instances would share the same abort handle and cancel each other's downloads.
```tsx
// module level
let bulkAbortRef: AbortController | null = null;
```
Additionally, the close button on the in-progress overlay is missing an `aria-label`.
**Fix**: Move to `useRef<AbortController | null>(null)` inside the component. Add `aria-label` to the close button.

---

### ISSUE [CachePanel.tsx — uncancelled fetch + async in startTransition]
**Severity**: MEDIUM
**Description**: (a) `load()` is called inside `useEffect` with no `AbortController`. (b) `startTransition(() => load())` wraps an async function in a transition — `startTransition` only accepts synchronous callbacks; the async work runs outside the transition boundary.
```tsx
useEffect(() => { load(); }, []);
startTransition(() => load()); // async fn not supported here
```
**Fix**: (a) Add `AbortController` with cleanup. (b) Use `startTransition` only around the synchronous state setter; schedule async fetch separately.

---

### ISSUE [DetailReorderLayout.tsx — bare error string in save]
**Severity**: MEDIUM
**Description**: The `save` callback builds the error as `HTTP ${res.status}` rather than parsing the API response body via `readApiError`.
```tsx
if (!res.ok) throw new Error(`HTTP ${res.status}`);
```
**Fix**: `throw new Error(await readApiError(res, t.layout.saveError))`.

---

### ISSUE [RoutesSection.tsx — bare error strings in remove/move]
**Severity**: MEDIUM
**Description**: Both `remove` and `move` throw `new Error(t.common.error)` without reading the API response body, discarding server-provided error detail.
```tsx
if (!r.ok) throw new Error(t.common.error);
```
**Fix**: `throw new Error(await readApiError(r, t.common.error))` in both functions.

---

### ISSUE [SeriesManager.tsx — bare error string in remove]
**Severity**: MEDIUM
**Description**: `remove` sets the error state directly to `t.common.error` without calling `readApiError`.
```tsx
if (!r.ok) { setError(t.common.error); return; }
```
**Fix**: `setError(await readApiError(r, t.common.error))`.

---

### ISSUE [SeriesRemoveVn.tsx — no error handling on DELETE]
**Severity**: MEDIUM
**Description**: The DELETE fetch has no error handling at all — a non-2xx response is silently swallowed and the user gets no feedback.
```tsx
await fetch(`/api/series/…`, { method: 'DELETE' });
// no .ok check, no catch
```
**Fix**: Check `r.ok` and surface the error via `toast.error(await readApiError(r, t.common.error))`.

---

### ISSUE [SelectiveFullDownload.tsx — uncancelled fetch + non-interactive list item]
**Severity**: MEDIUM
**Description**: (a) `load()` in the initial `useEffect` has no `AbortController`. (b) VN results are rendered as `<li onClick={…}>` — `<li>` is not an interactive element; keyboard users cannot activate it.
```tsx
<li onClick={() => select(vn)} key={vn.id}>…</li>
```
**Fix**: (a) Add `AbortController` with cleanup. (b) Wrap content in a `<button type="button">` inside the `<li>`.

---

### ISSUE [SettingsButton.tsx — uncancelled loadServer fetch]
**Severity**: MEDIUM
**Description**: `loadServer` is called in a `useEffect` with no `AbortController`. Opening and closing the settings modal rapidly can result in state updates on an unmounted component.
**Fix**: Add `AbortController` to `loadServer`, pass the signal to `fetch`, return the abort in the effect cleanup.

---

### ISSUE [SimilarSeedPicker.tsx — parallel fetches without AbortController]
**Severity**: MEDIUM
**Description**: `search()` fires two `fetch` calls via `Promise.allSettled` with no `AbortController`. While `lastQueryRef` prevents stale results from applying, the in-flight requests are not cancelled, wasting bandwidth on slow connections.
**Fix**: Create one `AbortController` per search invocation, abort it when a new query fires or the component unmounts.

---

### ISSUE [ShelfLayoutEditor.tsx — multiple fetches without AbortController]
**Severity**: MEDIUM
**Description**: `refreshActiveShelf()` is called in multiple `useEffect` blocks without an `AbortController`. Rapid state changes (shelf switch, DnD operations) can result in concurrent fetches whose responses arrive out of order, or update state after unmount.
**Fix**: Track an `AbortController` in a ref; abort and replace it each time `refreshActiveShelf` is called.

---

### ISSUE [TagPicker.tsx — fetch without AbortController + silent error swallow]
**Severity**: MEDIUM
**Description**: The `search` callback has no `AbortController` — a new debounce tick will not cancel the prior request. Additionally, when `r.ok` is false, the function silently returns with no user feedback.
```tsx
const r = await fetch(`/api/tags?…`);
if (!r.ok) return; // silent failure
```
**Fix**: Abort prior requests via a controller stored in a ref. Surface errors with a toast or inline message.

---

### ISSUE [VnTagsGroupedView.tsx — hardcoded English string in aria-label]
**Severity**: MEDIUM
**Description**: The external VNDB tag link uses `aria-label="VNDB"` — a hardcoded English string outside the i18n dictionary. In French/Japanese locales this is announced in English.
```tsx
<a … aria-label="VNDB" title="VNDB">
```
**Fix**: Use a localized string from the i18n dictionary, e.g. `t.vnTags.openOnVndb`.

---

### ISSUE [CoverHero.tsx — three single-dep useEffects]
**Severity**: LOW
**Description**: Three sequential `useEffect` calls each with a single dependency could be merged into one, reducing unnecessary re-render cycles on mount.
**Fix**: Combine into a single `useEffect` with all three dependencies.

---

### ISSUE [TagsBrowser.tsx — missing aria-expanded on group toggle]
**Severity**: LOW
**Description**: The `RootGroupRow` collapse toggle button does not set `aria-expanded`, so screen readers cannot determine whether the group is expanded or collapsed.
```tsx
<button type="button" onClick={toggle}>…</button>
```
**Fix**: Add `aria-expanded={open}` to the toggle button.

---

### ISSUE [CompareWithButton.tsx — magic setTimeout for focus]
**Severity**: LOW
**Description**: `setTimeout(() => filterRef.current?.focus(), 50)` uses a 50 ms magic number to defer focus after the picker opens. This is fragile — it works by racing against browser paint.
**Fix**: Use `useEffect` keyed on the open state, or `requestAnimationFrame`.

---

### ISSUE [ListMetaEditor.tsx / CreateListForm.tsx — hex color as aria-label]
**Severity**: LOW
**Description**: Color-picker buttons use the raw hex string (e.g. `#3B82F6`) as `aria-label`. Screen readers announce meaningless hex values.
```tsx
<button aria-label={color} title={color} …>
```
**Fix**: Map colors to human-readable names and use those in `aria-label`.

---

### ISSUE [ProducerLogoUpload.tsx — bare error strings in handleRemove/handleRefetch]
**Severity**: LOW
**Description**: Both `handleRemove` and `handleRefetch` catch errors and pass `t.common.error` directly to `toast.error`, discarding the API response body's error detail.
**Fix**: Use `await readApiError(r, t.common.error)` before toasting.

---

### ISSUE [ShelfLayoutEditor.tsx — magic setTimeout values]
**Severity**: LOW
**Description**: Two `setTimeout` calls with magic delay values of 120 ms and 30 ms are used for focus management and state sequencing after DnD operations. These are racey on slow devices.
**Fix**: Replace with `requestAnimationFrame` or transition-end listeners.

---

### ISSUE [SimilarSeedPicker.tsx — setTimeout(0) for focus]
**Severity**: LOW
**Description**: `setTimeout(() => inputRef.current?.focus(), 0)` defers focus by one task. Not guaranteed if the rendering pipeline takes multiple tasks.
**Fix**: Use `requestAnimationFrame` or a `useEffect` keyed on the open state.

---

### ISSUE [VnSeedPicker.tsx — setTimeout(0) for focus]
**Severity**: LOW
**Description**: Same pattern as SimilarSeedPicker — `setTimeout(() => inputRef.current?.focus(), 0)` on the "Change" button click.
```tsx
onClick={() => {
  setEditing(true);
  setTimeout(() => inputRef.current?.focus(), 0);
}}
```
**Fix**: Move focus into a `useEffect` that runs when `editing` flips to `true`.

---

### ISSUE [ShelfReadOnlyControls.tsx — cancel vs close aria-label mismatch]
**Severity**: LOW
**Description**: The popover close button uses `aria-label={t.common.cancel}` which reads as "Cancel" to screen readers. The action closes the popover without undoing changes — "Close" is the correct semantic label.
```tsx
<button … aria-label={t.common.cancel}>
```
**Fix**: Use `aria-label={t.common.close}` or a dedicated `t.shelfControls.closePanel` string.

---

## Files with no issues found

The following files were fully read and found clean:

ActionMenu.tsx, ActivityHeatmap.tsx, ActivityTimeline.tsx, AnimeChip.tsx, AnniversaryFeed.tsx, BannerControls.tsx, BannerSourcePicker.tsx, BrandCompare.tsx, BrandOverlapPicker.tsx, BulkActionBar.tsx, CastSection.tsx, CharactersSection.tsx, CollapsibleSummary.tsx, CompareVnPicker.tsx, ConfirmDialog.tsx, CoverCompare.tsx, CoverEditOverlay.tsx, CoverRotationButtons.tsx, CoverSourcePicker.tsx, CustomSynopsis.tsx, DataMaintenance.tsx, DateInput.tsx, DensityScopeProvider.tsx, Dialog.tsx, DownloadAssetsButton.tsx, DownloadStatusBar.tsx, EditionInfoPopover.tsx, EgsPanel.tsx, EgsRichDetails.tsx, EgsSyncBlock.tsx, FavoriteToggleButton.tsx, FieldCompare.tsx, GameLog.tsx, HeroBanner.tsx, HomeLayoutEditorTrigger.tsx, HomeLibrarySection.tsx, HomeSectionMenu.tsx, ImportPanel.tsx, KeyboardShortcuts.tsx, LangFlag.tsx, LanguageSwitcher.tsx, LibraryClient.tsx, LinkToVndbButton.tsx, ListAddVnForm.tsx, ListRemoveVn.tsx, MapEgsToVndbButton.tsx, MapVnToEgsButton.tsx, MarkdownNotes.tsx, MarkdownView.tsx, MatchBadges.tsx, MoreNavMenu.tsx, NavTabStrip.tsx, NotInCollectionBanner.tsx, OpenSettingsButton.tsx, PlaytimeCompare.tsx, PomodoroTimer.tsx, PortalPopover.tsx, PrintButton.tsx, ProducerLogo.tsx, ProducerRefreshButton.tsx, ProducerVnsSections.tsx, QuoteAvatar.tsx, QuoteFooter.tsx, QuotesSection.tsx, RandomPickButton.tsx, ReadingQueueStrip.tsx, ReadingQueueStripView.tsx, RecentlyViewedStrip.tsx, RecommendModeTabs.tsx, RecordRecentView.tsx, RefreshScopeButton.tsx, RelationsSection.tsx, ReleaseOwnedToggle.tsx, ReleasesSection.tsx, ResetViewDefaultsButton.tsx, SafeImage.tsx, SavedFilters.tsx, SchemaBrowser.tsx, SchemaEgsSection.tsx, SchemaLocalSection.tsx, SearchClient.tsx, SeedTagControls.tsx, SeriesAddVnForm.tsx, SeriesAutoSuggest.tsx, SeriesDetailLayout.tsx, SeriesMetaEditor.tsx, SessionPanel.tsx, SetBannerButton.tsx, ShelfSpatialFullscreen.tsx, ShelfSpatialView.tsx, SimilarSeedEmptyState.tsx, Skeleton.tsx, SmartStatusHint.tsx, SortableGrid.tsx, SourceSwitcher.tsx, SourceTag.tsx, SpoilerReveal.tsx, SpoilerToggle.tsx, StaffDownloadButton.tsx, StaffExtraCredits.tsx, StaffSection.tsx, StatsExtras.tsx, StatusBadge.tsx, StatusIcon.tsx, TagCoOccurrence.tsx, TextualSearchPanel.tsx, TitleLine.tsx, TraitsBrowser.tsx, TutorialTour.tsx, UpcomingCard.tsx, VaTimeline.tsx, VnCard.tsx, VnDetailActionsBar.tsx, VnDetailLayout.tsx, VnListMemberships.tsx, VnSeedPicker.tsx, VnTagChips.tsx, VndbMarkup.tsx, VndbStatusPanel.tsx, WishlistClient.tsx.
