# accessibility-audit — agent aed52a32a6f877551 — FAILED/PARTIAL

Agent hit context limit before completing. Partial findings below.

I need to check the remaining components (LibraryClient, SavedFilters, MediaGallery, ListsPickerButton, ListCardActions, HomeSectionMenu) before producing the final report.

---

HomeSectionMenu: the menu opens (Escape closes), but there is NO ArrowDown/ArrowUp/Home/End keyboard navigation within the menu items — it's missing the required ARIA menu keyboard pattern. Also, no focus is moved into the menu when it opens.

---

ListCardActions issues:
1. Trigger button has NO `aria-label` (icon-only button) and NO `aria-controls`
2. Menu panel has `role="menu"` but NO `aria-label` or `aria-labelledby`
3. No ArrowDown/ArrowUp keyboard navigation within the menu
4. No focus restoration on close

---

ListsPickerButton has a `role="menu"` inside a `PortalPopover`. The menu items use `role="menuitemcheckbox"` — correct. But again, no ArrowDown/ArrowUp keyboard navigation within menu items. The popover itself does have `aria-modal="true"` missing (from the PortalPopover analysis). 

The `role="menu"` wraps a `<div>` with an inner `role="menu"`, and PortalPopover itself has `role="dialog"` - there's actually a nested dialog+menu situation here. Let me check that.

---

The PortalPopover wraps the content as `role="dialog"` and the inner content has `role="menu"`. So we have `role="dialog"` > `role="menu"` — that's an unusual composition. The `aria-haspopup="menu"` on the trigger says it expects a menu, but PortalPopover gives it a dialog. This is a mismatch.

---

SavedFilters: Has proper ArrowDown/ArrowUp/Home/End keyboard navigation and aria-label on menu. BUT trigger button has NO `aria-label` — it has `title` but not `aria-label`. The button uses an icon + text content, so text is accessible. The trigger's `title` is not ideal but text content exists.

Also note: no focus is moved into the menu on open, and no focus restoration on close.

---

MediaGallery lightbox: uses `useDialogA11y`, `aria-modal="true"`, `aria-labelledby` — well implemented. The lightbox is good. Menu in MediaTile: also well implemented with ArrowDown/ArrowUp/Home/End and focus restoration.

Now let me check LibraryClient for remaining issues:

---

Confirmed: the library filter input at line 494 has no `aria-label`. The status buttons at line 468-483 have visible text content but no `aria-pressed` state to indicate which is active. Let me check:

---

AdvancedFiltersDrawer button at line 1354 has `aria-expanded` but no `aria-label` (has visible text content though, which is OK). The `aria-controls` is missing on the drawer button though.

Let me check the status filter buttons more carefully:

---

Status filter buttons: no `aria-pressed` attribute. The active state is conveyed only through CSS class (`chip-active`), not via ARIA. Screen readers cannot determine which filter is active.

---

No `aria-live` for search result counts in LibraryClient. Now let me do a broader sweep for any remaining unlabeled form controls and missing ARIA:

---

Status filter buttons in LibraryClient (line 468-484) do NOT have `aria-pressed`. Let me also check the app routes for heading hierarchy issues:

---

The VN detail page at `/app/vn/[id]/page.tsx` has `<h3>` for sections (Media, Personal Notes) but **no `<h1>` or `<h2>` for the VN title** on the happy path. The `<h1>` is only in the not-found branch (line 188). The VN title is rendered somewhere without a heading — let me verify:

---

Good — `TitleLine` renders `<h1>`. So VN detail page has `<h1>` (from `TitleLine`) then jumps directly to `<h3>` for Media/Notes sections — skipping `<h2>`. This is a heading hierarchy gap.

Let me check the producer page similarly:

---

The EGS page (line 165 and 195) renders `<h1>` inside the `EgsPageSkeleton` AND inside `EgsPageContent`. Since only one renders at a time (skeleton or content), there's only one `<h1>` active at any time — that's OK.

Let me also check the similar page which has two `<h1>` elements:

---

The similar page renders two different branches, each with a single `<h1>`. Since these are conditionally rendered (one branch renders based on `seedId`), only one `<h1>` is active at a time — OK.

Now let me check for any missing `alt` attributes on images across the app:

---

ProducerLogo: img has `alt={producer.name}` — correct. HeroBanner decorative image has `alt=""` and `aria-hidden` — correct.

---

QuoteAvatar: img has `alt={altText}` — correct.

Now let me check the `<Next.js Image>` usage and any remaining patterns:

---

Good — no Next.js `<Image>` component used; app uses `<img>` directly or `SafeImage`.

Now let me check the home page for any unlabeled form controls or missing ARIA:

---

Now I need to check which of these have separate aria-label declarations (on the line before/after the placeholder):

---

Confirmed: LibraryClient filter input (line 494-500) has no `aria-label`. Let me check a few more concerning ones: