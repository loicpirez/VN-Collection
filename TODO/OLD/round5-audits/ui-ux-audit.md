# UI/UX Audit Report — agent a298f8dec90514307

The "Current links" section renders `{links.length > 0 && ...}` — while `suggestionsLoading` is true, `links` is still empty (initial state `[]`), so the section doesn't appear during loading. This is acceptable as the loading skeleton for suggestions covers the page transition. The section appears after load. Not a critical loading state issue.

Now I have enough information to write the comprehensive audit report.

---

## UI/UX AUDIT REPORT — vndb-collection-new

---

### ISSUE 1 [button-system] [src/components/MarkdownNotes.tsx:39–56]
**Severity: MEDIUM**
**Description:** Two tab-toggle buttons (Edit / Preview) hand-roll `inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-semibold` instead of using the `btn` or `btn-xs` primitive.
**Code:**
```tsx
className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-semibold transition-colors ${
  tab === 'edit' ? 'bg-accent text-bg' : 'text-muted hover:text-white'
}`}
```
**Fix:** Replace with `btn btn-xs` (plus `btn-primary` when active) so shape, disabled state, and focus ring come from the design system primitive.

---

### ISSUE 2 [button-system] [src/components/CustomSynopsis.tsx:129–175]
**Severity: MEDIUM**
**Description:** Three buttons (Add synopsis, Show/Hide sources, Edit, Delete) hand-roll `rounded-md border border-border bg-bg-elev/40 px-2 py-0.5 text-[10px]` instead of using `btn btn-xs`.
**Code:**
```tsx
className="inline-flex items-center gap-1 rounded-md border border-border bg-bg-elev/40 px-2 py-1 text-[11px] text-muted hover:border-accent hover:text-accent"
```
**Fix:** Replace with `btn btn-xs` and adjust color variant via modifier classes.

---

### ISSUE 3 [button-system] [src/components/SettingsButton.tsx:858–865, 1190, 1321, 1448, 1537, 1611, 1626, 1633]
**Severity: MEDIUM**
**Description:** Multiple buttons throughout SettingsButton.tsx hand-roll `rounded-md border border-border bg-bg-elev/40 px-2 py-1 text-[11px]` shapes without using the `btn` or `btn-xs` primitive. At least 7 distinct button elements across lines 858, 1190, 1321, 1448, 1537, 1611, 1626, 1633.
**Code (representative):**
```tsx
className="inline-flex items-center gap-1 rounded-md border border-border bg-bg-elev/40 px-2 py-1 text-[11px] text-muted hover:border-status-on_hold hover:text-status-on_hold"
```
**Fix:** Extract a shared `btn btn-xs` (or a dedicated `btn-settings` modifier) for inline Settings panel buttons.

---

### ISSUE 4 [button-system] [src/app/steam/page.tsx:391–399]
**Severity: LOW**
**Description:** "Show all / Show less" toggle button uses `rounded-md border border-border bg-bg-elev/40 px-2 py-1 text-[11px]` without `btn` class.
**Code:**
```tsx
className="mt-3 inline-flex items-center gap-1 rounded-md border border-border bg-bg-elev/40 px-2 py-1 text-[11px] text-muted hover:border-accent hover:text-accent"
```
**Fix:** Apply `btn btn-xs` instead of hand-rolling the shape.

---

### ISSUE 5 [button-system] [src/components/EgsPanel.tsx:183–189]
**Severity: LOW**
**Description:** "Search EGS" button in EgsPanel uses a hand-rolled style.
**Code:**
```tsx
className="inline-flex items-center gap-1 rounded-md border border-border bg-bg-elev/40 px-2 py-1 text-[11px] text-muted hover:border-accent hover:text-accent"
```
**Fix:** Apply `btn btn-xs`.

---

### ISSUE 6 [button-system] [src/components/VnTagChips.tsx:47–63]
**Severity: LOW**
**Description:** The spoiler reveal/hide button hand-rolls `rounded-md border border-border bg-bg-elev/40 px-2 py-0.5 text-[10px]` instead of using `btn btn-xs`.
**Code:**
```tsx
className="inline-flex items-center gap-1 rounded-md border border-border bg-bg-elev/40 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-muted transition-colors hover:border-accent hover:text-accent"
```
**Fix:** Apply `btn btn-xs`.

---

### ISSUE 7 [unicode-glyph] [src/components/SettingsButton.tsx:1439]
**Severity: MEDIUM**
**Description:** Raw unicode glyphs `▲` and `▼` are rendered as the sole open/close state indicator on a section-toggle button. There is no `sr-only` text, no `aria-label`, and no `aria-expanded` on the button itself. Screen readers will either skip the glyph entirely or read it as "black up-pointing small triangle."
**Code:**
```tsx
<span className="text-muted text-xs">{open ? '▲' : '▼'}</span>
```
**Fix:** Replace with Lucide `<ChevronUp>` / `<ChevronDown>` (each with `aria-hidden`) and add `aria-expanded={open}` on the parent `<button>`. Or keep the glyph span but add `<span className="sr-only">{open ? t.common.collapse : t.common.expand}</span>` alongside it, and add `aria-expanded` to the button.

---

### ISSUE 8 [missing-title-truncated] [src/app/activity/page.tsx:247]
**Severity: LOW**
**Description:** Activity page VN title link uses `truncate` but the `<Link>` element has no `title` attribute. The `title` on the outer `<li>` is absent. Long VN titles will be cut without a tooltip to reveal the full text.
**Code:**
```tsx
className="truncate text-sm font-semibold hover:text-accent transition-colors"
```
**Fix:** Add `title={row.title}` to the `<Link>` element.

---

### ISSUE 9 [missing-title-truncated] [src/app/labels/page.tsx:94]
**Severity: LOW**
**Description:** Print-label card uses `line-clamp-3` on the VN title without a `title` attribute.
**Code:**
```tsx
<p className="line-clamp-3 font-bold leading-tight">{it.title}</p>
```
**Fix:** Add `title={it.title}` to the `<p>` element.

---

### ISSUE 10 [missing-title-truncated] [src/app/steam/page.tsx:251–252]
**Severity: LOW**
**Description:** Steam sync suggestion rows use `line-clamp-1` on both the VN title and the Steam name without `title` attributes.
**Code:**
```tsx
<p className="line-clamp-1 text-sm font-bold">{s.vn_title}</p>
<p className="line-clamp-1 text-[11px] text-muted">{s.steam_name} · …</p>
```
**Fix:** Add `title={s.vn_title}` and `title={s.steam_name}` respectively.

---

### ISSUE 11 [missing-title-truncated] [src/app/upcoming/page.tsx:528]
**Severity: LOW**
**Description:** The non-linked brand name span in the upcoming page uses `line-clamp-1` with no `title`. The linked variant (line 524) correctly adds `title={a.brand_name}`, but the fallback `<span>` branch omits it.
**Code:**
```tsx
<span className="line-clamp-1">{a.brand_name}</span>
```
**Fix:** Add `title={a.brand_name}` to match the linked variant.

---

### ISSUE 12 [missing-title-truncated] [src/app/dumped/page.tsx:256]
**Severity: LOW**
**Description:** Dumped editions card VN title uses `line-clamp-2` without a `title` attribute.
**Code:**
```tsx
<p className="line-clamp-2 text-xs font-bold transition-colors group-hover:text-accent">
  {e.vn_title}
</p>
```
**Fix:** Add `title={e.vn_title}`.

---

### ISSUE 13 [missing-title-truncated] [src/app/character/[id]/page.tsx:245–249, 254]
**Severity: LOW**
**Description:** Three truncated elements on the character detail page lack title attributes: the character name in the VA section (line 245), the alternate name (line 249), and the VN title chips (line 254).
**Code:**
```tsx
<p className="line-clamp-2 text-xs font-bold transition-colors group-hover:text-accent">{s.c_name}</p>
<p className="line-clamp-1 text-[10px] text-muted">{s.c_original}</p>
<span key={v.vn_id} className="truncate">{v.vn_title}</span>
```
**Fix:** Add `title={s.c_name}`, `title={s.c_original}`, and `title={v.vn_title}` respectively.

---

### ISSUE 14 [missing-title-truncated] [src/app/character/[id]/page.tsx:383, 397]
**Severity: LOW**
**Description:** In the related VNs section, the VN title and alttitle use `line-clamp-2`/`line-clamp-1` without title attributes.
**Code:**
```tsx
<span className="line-clamp-2 text-xs font-bold transition-colors group-hover:text-accent">{v.title ?? v.id}</span>
<div className="mt-0.5 line-clamp-1 text-[10px] text-muted">{v.alttitle}</div>
```
**Fix:** Add `title={v.title ?? v.id}` and `title={v.alttitle}`.

---

### ISSUE 15 [missing-title-truncated] [src/app/shelf/page.tsx:435, 449, 454, 461, 631, 638]
**Severity: LOW**
**Description:** Multiple `line-clamp-*` elements in shelf card rows (VN title, release title, edition label, location string, and the spatial view VN title/synopsis) lack `title` attributes.
**Code:**
```tsx
<p className="line-clamp-2 text-xs font-bold transition-colors group-hover:text-accent">{e.vn_title}</p>
<p className="line-clamp-1 text-[11px] text-muted">…</p>
<p className="line-clamp-1 text-[11px] text-muted">{e.edition_label}</p>
```
**Fix:** Add appropriate `title={…}` attributes to each truncated element.

---

### ISSUE 16 [missing-title-truncated] [src/app/staff/[id]/page.tsx:351, 356, 359, 494, 512]
**Severity: LOW**
**Description:** Staff detail page: character name link (line 351), character original name (line 356), character note (line 359), VN title link (line 494), and VN alttitle (line 512) all use `line-clamp-1`/`line-clamp-2` without `title` attributes.
**Code:**
```tsx
className="line-clamp-1 font-semibold text-white/85 hover:text-accent"  // line 351
<div className="line-clamp-1 text-[10px] text-muted/70">{c.original}</div>  // line 356
className="line-clamp-2 flex-1 text-xs font-bold transition-colors hover:text-accent"  // line 494
<div className="mt-0.5 line-clamp-1 text-[11px] text-muted">{vn.alttitle}</div>  // line 512
```
**Fix:** Add `title={c.name}`, `title={c.original}`, `title={c.note}`, `title={vn.title}`, `title={vn.alttitle}` respectively.

---

### ISSUE 17 [missing-title-truncated] [src/app/tag/[id]/page.tsx:193, 472]
**Severity: LOW**
**Description:** Two VN title paragraphs using `line-clamp-2` in the tag detail page lack `title` attributes.
**Code:**
```tsx
<p className="line-clamp-2 text-xs font-bold transition-colors group-hover:text-accent">{v.title}</p>
```
**Fix:** Add `title={v.title}` to both occurrences.

---

### ISSUE 18 [missing-title-truncated] [src/app/trait/[id]/page.tsx:169, 173, 178]
**Severity: LOW**
**Description:** Trait detail page character name, original name, and first VN title all use `line-clamp-*` without `title` attributes.
**Code:**
```tsx
<span className="line-clamp-2 text-xs font-bold transition-colors group-hover:text-accent">{c.name}</span>
<div className="mt-0.5 line-clamp-1 text-[10px] text-muted">{c.original}</div>
<span className="line-clamp-1">{firstVn.title ?? firstVn.id}</span>
```
**Fix:** Add `title={c.name}`, `title={c.original}`, `title={firstVn.title ?? firstVn.id}`.

---

### ISSUE 19 [missing-title-truncated] [src/app/compare/page.tsx:310]
**Severity: LOW**
**Description:** Compare page VN card title link uses `line-clamp-2` without a `title` attribute.
**Code:**
```tsx
<Link href={`/vn/${it.id}`} className="mt-2 line-clamp-2 block text-sm font-bold hover:text-accent">
  {it.title}
</Link>
```
**Fix:** Add `title={it.title}`.

---

### ISSUE 20 [missing-title-truncated] [src/components/StaffExtraCredits.tsx:72, 156, 169]
**Severity: LOW**
**Description:** Character link (line 72), VN title link (line 156), and VN alttitle (line 169) use `truncate`/`line-clamp-*` without `title` attributes.
**Code:**
```tsx
<Link href={…} className="truncate font-semibold text-white/85 hover:text-accent">{ch.name}</Link>
<Link href={…} className="line-clamp-2 text-xs font-bold transition-colors hover:text-accent">{vn.title}</Link>
<div className="mt-0.5 line-clamp-1 text-[10px] text-muted">{vn.alttitle}</div>
```
**Fix:** Add `title={ch.name}`, `title={vn.title}`, `title={vn.alttitle}`.

---

### ISSUE 21 [missing-title-truncated] [src/components/ReadingQueueStripView.tsx:69]
**Severity: LOW**
**Description:** Queue entry title `<span>` uses `line-clamp-1 max-w-[200px]` without a `title` attribute. The parent `<Link>` has no `title` either.
**Code:**
```tsx
<span className="line-clamp-1 max-w-[200px] font-semibold transition-colors group-hover:text-accent">
  {e.title}
</span>
```
**Fix:** Add `title={e.title}` to the `<Link>` or the `<span>`.

---

### ISSUE 22 [missing-title-truncated] [src/components/EgsSyncBlock.tsx:200]
**Severity: LOW**
**Description:** EGS sync matched VN title link uses `truncate` without a `title` attribute.
**Code:**
```tsx
<Link href={…} className="min-w-0 flex-1 truncate font-bold hover:text-accent">{s.vn_title}</Link>
```
**Fix:** Add `title={s.vn_title}`.

---

### ISSUE 23 [missing-title-truncated] [src/components/VnSeedPicker.tsx:299, 408–412]
**Severity: LOW**
**Description:** Multiple `line-clamp-1` texts in the seed picker search results lack `title` attributes: alttitle display (line 299), search result title (line 408), alttitle (line 410), year+developer (line 412).
**Code:**
```tsx
<p className="line-clamp-1 text-[11px] text-muted">{initialSeed.alttitle}</p>
<p className="line-clamp-1 text-[12px] font-semibold">{hit.title}</p>
<p className="line-clamp-1 text-[10px] text-muted">{hit.alttitle}</p>
<p className="line-clamp-1 text-[10px] text-muted">{[year, hit.developer].filter(Boolean).join(' · ')}</p>
```
**Fix:** Add `title={initialSeed.alttitle}`, `title={hit.title}`, `title={hit.alttitle}`, and `title={…}` for the composed string.

---

### ISSUE 24 [missing-title-truncated] [src/components/CompareVnPicker.tsx:216, 220, 324, 326]
**Severity: LOW**
**Description:** Selected VN title (line 216), alttitle (line 220), search result title (line 324), and alttitle (line 326) use `line-clamp-*` without `title` attributes.
**Code:**
```tsx
<p className="line-clamp-2 max-w-[140px] text-[12px] font-semibold leading-tight">{vn.title}</p>
<p className="line-clamp-1 max-w-[140px] text-[10px] text-muted">{vn.alttitle}</p>
<p className="line-clamp-1 text-sm font-semibold">{hit.title}</p>
<p className="line-clamp-1 text-[11px] text-muted">{hit.alttitle}</p>
```
**Fix:** Add `title={…}` to each.

---

### ISSUE 25 [missing-title-truncated] [src/components/ListsPickerButton.tsx:231]
**Severity: LOW**
**Description:** List name in the picker uses `line-clamp-1` without a `title` attribute.
**Code:**
```tsx
<span className="line-clamp-1 flex-1 text-xs">{l.name}</span>
```
**Fix:** Add `title={l.name}` to the `<span>` or its parent button.

---

### ISSUE 26 [missing-title-truncated] [src/components/SavedFilters.tsx:230]
**Severity: LOW**
**Description:** The saved filter name span uses `truncate` and the parent button has `title={f.params}` (the URL query string) rather than `title={f.name}` (the human-readable name). The full filter name is never revealed on hover.
**Code:**
```tsx
<button … title={f.params}>
  <Pin …/>
  <span className="truncate">{f.name}</span>
</button>
```
**Fix:** Change `title={f.params}` to `title={f.name}` (or add both via tooltip), so hovering reveals the complete filter name.

---

### ISSUE 27 [missing-title-truncated] [src/components/SelectiveFullDownload.tsx:348]
**Severity: LOW**
**Description:** Selectable VN row uses `truncate` on the title span without a `title` attribute.
**Code:**
```tsx
<span className="min-w-0 flex-1 truncate font-bold">{r.title}</span>
```
**Fix:** Add `title={r.title}`.

---

### ISSUE 28 [missing-title-truncated] [src/components/CompareWithButton.tsx:134]
**Severity: LOW**
**Description:** Selectable VN row in the compare picker uses `truncate` on the title span without a `title` attribute.
**Code:**
```tsx
<span className="min-w-0 flex-1 truncate font-bold">{r.title}</span>
```
**Fix:** Add `title={r.title}`.

---

### ISSUE 29 [missing-title-truncated] [src/components/MapVnToEgsButton.tsx:280]
**Severity: LOW**
**Description:** EGS candidate game name uses `truncate` without a `title` attribute.
**Code:**
```tsx
<div className="truncate font-bold">{c.gamename}</div>
```
**Fix:** Add `title={c.gamename}`.

---

### ISSUE 30 [missing-title-truncated] [src/components/LinkToVndbButton.tsx:142]
**Severity: LOW**
**Description:** VNDB search result title uses `truncate` without a `title` attribute.
**Code:**
```tsx
<div className="truncate font-bold">{h.title}</div>
```
**Fix:** Add `title={h.title}`.

---

### ISSUE 31 [missing-title-truncated] [src/components/EgsPanel.tsx:269, 539]
**Severity: LOW**
**Description:** EGS game name in the linked game panel (line 269) and in the picker search results (line 539) use `line-clamp-*` without `title` attributes.
**Code:**
```tsx
<div className="mb-2 line-clamp-2 text-sm font-semibold">{game.gamename}</div>
<div className="line-clamp-1 text-sm font-semibold">{c.gamename}</div>
```
**Fix:** Add `title={game.gamename}` and `title={c.gamename}`.

---

### ISSUE 32 [missing-title-truncated] [src/components/BulkDownloadButton.tsx:299]
**Severity: LOW**
**Description:** Currently-downloading VN title uses `truncate` without a `title` attribute.
**Code:**
```tsx
<div className="mt-1 truncate text-xs text-white/80">{currentTitle}</div>
```
**Fix:** Add `title={currentTitle}`.

---

### ISSUE 33 [missing-title-truncated] [src/components/DataMaintenance.tsx:98, 124]
**Severity: LOW**
**Description:** Duplicate prefix string (line 98) and stale VN title link (line 124) use `truncate` without `title` attributes.
**Code:**
```tsx
<div className="mb-1 truncate font-mono text-[10px] text-muted">{g.prefix}</div>
<Link href={…} className="truncate font-semibold hover:text-accent">{s.title}</Link>
```
**Fix:** Add `title={g.prefix}` and `title={s.title}`.

---

### ISSUE 34 [missing-title-truncated] [src/components/SeriesManager.tsx:96]
**Severity: LOW**
**Description:** Series description uses `line-clamp-2` without a `title` attribute.
**Code:**
```tsx
<div className="line-clamp-2 text-xs text-muted">{s.description}</div>
```
**Fix:** Add `title={s.description}`.

---

### ISSUE 35 [missing-title-truncated] [src/components/SearchClient.tsx:650]
**Severity: LOW**
**Description:** EGS search results in the search panel use `line-clamp-2` on the game name without a `title` attribute.
**Code:**
```tsx
<div className="line-clamp-2 text-sm font-semibold">{c.gamename}</div>
```
**Fix:** Add `title={c.gamename}`.

---

### ISSUE 36 [missing-title-truncated] [src/components/ShelfReadOnlyControls.tsx:550]
**Severity: LOW**
**Description:** Row orientation zone label uses `truncate` without a `title` attribute.
**Code:**
```tsx
<span className="flex-1 truncate text-[10px] text-muted">{label}</span>
```
**Fix:** Add `title={label}`.

---

### ISSUE 37 [color-only-state] [src/app/activity/page.tsx:72]
**Severity: MEDIUM**
**Description:** Playtime delta is rendered in `text-green-400` (positive) or `text-red-400` (negative) with no icon or text label indicating direction beyond the `+`/`-` sign prefix. The `+`/`-` sign itself does convey direction textually, so this is a borderline case, but the color is the primary visual differentiator and users with deuteranopia or protanopia cannot distinguish green from red.
**Code:**
```tsx
<span className={`ml-1.5 text-[10px] ${delta > 0 ? 'text-green-400' : 'text-red-400'}`}>
  {delta > 0 ? '+' : ''}{ta.playtimeDelta} {…}
</span>
```
**Fix:** Add a small arrow icon (`<ArrowUp>` / `<ArrowDown>` with `aria-hidden`) alongside the `+`/`-` sign, or use semantic tokens (`text-status-completed` / `text-status-dropped`) so the meaning is discoverable without color alone. Also add `aria-label` for screen readers.

---

### ISSUE 38 [color-only-state] [src/app/activity/page.tsx:81]
**Severity: MEDIUM**
**Description:** Favorite state is shown via `text-yellow-400` (on) vs `text-muted` (off) with text labels (`ta.favOn`/`ta.favOff`). The color changes in addition to the text, so this is not a pure color-only case — however the yellow is the primary visual cue and users scanning quickly may miss the text label.
**Code:**
```tsx
<span className={on ? 'text-yellow-400' : 'text-muted'}>{on ? ta.favOn : ta.favOff}</span>
```
**Fix:** Add a `<Heart>` or `<Star>` icon with `aria-hidden` to reinforce the state beyond color.

---

### ISSUE 39 [visual-consistency] [src/app/egs/page.tsx:251, 341]
**Severity: LOW**
**Description:** EGS linked/unlinked game rows use a horizontal `flex gap-3` card layout (`rounded-xl border border-border bg-bg-card p-3`) instead of the standard portrait card (`aspect-[2/3]` cover + info stacked vertically) used by `/wishlist`, `/recommendations`, `/similar`, `/top-ranked`. This is an intentional design divergence (EGS rows are catalog rows, not portrait cards), but it is a structural inconsistency relative to the audit checklist requirement.
**Code:**
```tsx
className="group relative flex gap-3 rounded-xl border border-border bg-bg-card p-3 …"
```
**Fix:** Document this as a deliberate UX choice (horizontal row for data-dense EGS catalog). If uniformity is required, the cover frame already uses `aspectRatio: '2 / 3'` inline style, which is correct. The outer `flex` layout is the structural difference. No action needed if the row layout is intentional.

---

### ISSUE 40 [loading-states] [src/app/steam/page.tsx — Section 2 "Current links"]
**Severity: LOW**
**Description:** The "Current links" section (`{links.length > 0 && ...}`) renders only when `links` has data. While `suggestionsLoading` is true (and the `links` array is `[]`), this section is entirely absent. There is no skeleton for links during the initial load; the section simply does not appear until `refresh()` completes. If the page loads slowly, the layout shift as the links section appears can be jarring.
**Code:** `src/app/steam/page.tsx:293` — `{links.length > 0 && (...section...)}` with no loading guard.
**Fix:** Add a dedicated `linksLoading` state initialized to `true`, cleared in the `finally` block of `refresh()`, and render a `<SkeletonRows count={3} withThumb={false} />` while it is true, to reserve space and eliminate layout shift.

---

### ISSUE 41 [details-chevron] [src/app/vn/[id]/page.tsx:380–388]
**Severity: PASS**
No issue: The VN detail "All titles" `<details>` uses `<ChevronRight className="… group-open:rotate-90">` — correctly implemented.

---

### ISSUE 42 [hover-only-controls] [src/components/ListCardActions.tsx:87]
**Severity: MEDIUM**
**Description:** The list-card action button uses `md:opacity-0 md:group-hover:opacity-100` with no `focus:opacity-100` fallback on touch — only `focus:opacity-100` without the `md:` prefix is present. On touch devices below `md` breakpoint (< 768px) these controls ARE visible (opacity not 0), which is correct, but the `focus:opacity-100` at line 87 lacks the `md:` prefix — meaning on desktop the button is opacity-0 until hover, but keyboard focus via Tab triggers `focus:opacity-100` (non-prefixed) which overrides the `md:opacity-0`. This actually creates CORRECT behavior. On re-reading the code, this is acceptable — not a real issue.
**Code:**
```tsx
className="rounded-md p-1 text-muted transition-opacity hover:bg-bg-elev hover:text-white focus:opacity-100 md:opacity-0 md:group-hover:opacity-100"
```
**Fix:** No change needed. The `focus:opacity-100` without `md:` prefix ensures keyboard users can always see the control regardless of breakpoint.

---

### ISSUE 43 [safe-area-inset] [ALL fixed-bottom elements]
**Severity: PASS**
All `fixed bottom-*` elements checked (WishlistClient, BulkDownloadButton, DownloadStatusBar, BulkActionBar, TutorialTour, QuoteFooter) correctly reference `env(safe-area-inset-bottom)` via inline `style` properties. No violation found.

---

### ISSUE 44 [progress-bars] [ALL role=progressbar elements]
**Severity: PASS**
All eight `role="progressbar"` elements found (dumped/page.tsx, year/page.tsx, BulkDownloadButton, RoutesSection, ReadingGoalCard, PomodoroTimer, DownloadStatusBar, BulkActionBar) correctly pair the role with `aria-valuenow`, `aria-valuemin`, and `aria-valuemax`. No violation found.

---

### ISSUE 45 [hover-only-controls] [ALL opacity-0 group-hover patterns]
**Severity: PASS**
Every `group-hover:opacity-100` occurrence in the codebase (GameLog, ListRemoveVn, SeriesRemoveVn, FavoriteToggleButton, SeriesManager, CoverRotationButtons, VnCard, ListsPickerButton, CoverEditOverlay, ListCardActions, TagsBrowser, HeroBanner, MediaGallery) is correctly gated behind `md:` or `sm:` breakpoint prefixes. Touch devices always see these controls. No bare `opacity-0 group-hover:opacity-100` patterns exist.

---

### ISSUE 46 [loading-states] [ALL loading.tsx / Skeleton usage]
**Severity: PASS**
Every page route audited has a corresponding `loading.tsx` with skeleton content. Client components with async data (WishlistClient, SearchClient, DataMaintenance, CharactersSection, ReleasesSection, QuotesSection) all show skeletons while loading and only show empty-state copy after the fetch resolves to zero items.

---

### ISSUE 47 [details-chevron] [ALL details elements]
**Severity: PASS**
All `<details>` elements use either `<CollapsibleSummary>` (which provides a rotating ChevronRight via `group-open:rotate-90`), or a manual `{open ? <ChevronDown> : <ChevronRight>}` swap. No `<details>` element suppresses the native triangle without providing a replacement.

---

### ISSUE 48 [unicode-glyphs] [ALL JSX files except SettingsButton]
**Severity: PASS**
No other JSX rendering of raw `●`, `✓`, `✗`, `→`, `←`, `↑`, `↓`, `▲`, `▼`, or `►` as UI indicators was found. The `→` characters found are exclusively in code comments. The `▸` characters in MoreNavMenu are JSDoc comments only. The Circle glyph in SearchClient uses Lucide `<Circle>` with an `aria-label`. The only violation is SettingsButton:1439 (Issue 7 above).

---

## SUMMARY

| Severity | Count |
|----------|-------|
| HIGH | 0 |
| MEDIUM | 5 |
| LOW | 32 |
| PASS | 7 audit areas |

**Total issues: 37**

**By domain:**
- `button-system` (hand-rolled instead of `btn`): 5 issues (ISSUE 1–5, partial ISSUE 6)
- `unicode-glyph` (raw ▲/▼ without accessible text): 1 issue (ISSUE 7)
- `missing-title-truncated` (clamp/truncate without title): 29 issues (ISSUE 8–36)
- `color-only-state` (color without icon/label): 2 issues (ISSUE 37–38)
- `visual-consistency` (EGS row layout vs portrait card): 1 issue (ISSUE 39) — likely intentional
- `loading-states`: 1 issue (ISSUE 40 — steam links section layout shift)

**FALSE_CLOSURE check:** No checklist was provided claiming prior fixes. All issues reported are found in actual code at the cited file:line coordinates as of the audit.

**Key files with highest concentration of issues:**
- `/Users/loicpirez/Perso/vndb-collection-new/src/components/SettingsButton.tsx` — hand-rolled buttons (7+ instances) and ▲/▼ glyph
- `/Users/loicpirez/Perso/vndb-collection-new/src/components/VnSeedPicker.tsx` — 4 truncated texts without title
- `/Users/loicpirez/Perso/vndb-collection-new/src/app/staff/[id]/page.tsx` — 5 truncated texts without title
- `/Users/loicpirez/Perso/vndb-collection-new/src/components/CustomSynopsis.tsx` — 3 hand-rolled buttons