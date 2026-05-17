'use client';
import { HomeSectionControls, useHomeSection } from './HomeSectionMenu';
import { LibraryClient } from './LibraryClient';
import { useT } from '@/lib/i18n/client';
import type { HomeSectionState } from '@/lib/home-section-layout';

/**
 * Library is split across the home page into two independently
 * reorderable / hideable / collapsible sections:
 *   - `library-controls` — chips/search/filters/sort/group/density/actions
 *   - `library-grid`     — the actual VN cards
 *
 * Each section owns its own `HomeSectionControls` chevron + menu so
 * the user can hide one without losing the other. URL state
 * (filters, sort, group, density) is shared because both halves
 * derive from useSearchParams — changing a filter in the controls
 * section immediately updates the grid section.
 *
 * Acceptable cost: the two sections each mount `<LibraryClient>` in
 * a different mode, so the data-fetch effect inside LibraryClient
 * runs twice. Both calls hit the same `/api/collection?…` URL with
 * identical params and benefit from the browser's HTTP cache; the
 * extra round-trip on first paint is ~50ms locally and is the price
 * for splitting state-free between the two sections without a
 * shared Provider refactor.
 */
export function HomeLibraryControlsSection({
  initialState,
}: {
  initialState?: HomeSectionState;
}) {
  const t = useT();
  const { state, busy, isHidden, isCollapsed, toggleCollapsed, hide } = useHomeSection(
    'library-controls',
    initialState,
  );
  if (isHidden) return null;
  return (
    // mt-2 (was mt-8) — the preceding strip already declares mb-4,
    // so a generous mt-8 stacked under that produced ~50px of dead
    // space before the user reached the first Library control.
    // The library is the page's primary content, not a tertiary
    // strip; treat it as part of the natural flow.
    <section className="mt-2" aria-labelledby="home-library-controls-heading">
      <header className="mb-3 flex items-center justify-between gap-2">
        {/*
          Promoted from text-xs/uppercase/muted to a proper section
          heading. The earlier "uppercase eyebrow" weight was
          indistinguishable from the strip headings above (Reading
          queue, Anniversary) and made the page look like a
          uniform stack of equally-weighted blocks. Use the canonical
          Library title and an Ma bibliothèque framing to anchor the
          page.
        */}
        <h2
          id="home-library-controls-heading"
          className="text-base font-bold text-white"
        >
          {t.homeSections.libraryTitle}
        </h2>
        <HomeSectionControls
          state={state}
          busy={busy}
          onCollapseToggle={toggleCollapsed}
          onHide={hide}
          sectionLabel={t.homeLayout.sectionLabels['library-controls']}
        />
      </header>
      {!isCollapsed && <LibraryClient mode="controls-only" />}
    </section>
  );
}

export function HomeLibraryGridSection({
  initialState,
}: {
  initialState?: HomeSectionState;
}) {
  const { state, busy, isHidden, isCollapsed, toggleCollapsed, hide } = useHomeSection(
    'library-grid',
    initialState,
  );
  if (isHidden) return null;
  return (
    // mt-3 (was mt-4) — sits directly under the controls section,
    // forming a visually-cohesive Library block. The eyebrow h2 +
    // duplicate chevron+menu have been removed so the toolbar and
    // grid look like one product surface. The grid still gets its
    // own chevron + menu (collapsed by default = false from the
    // versioned layout config) so a power user can hide only the
    // grid when working through filter combinations.
    <GridSectionInner
      state={state}
      busy={busy}
      isCollapsed={isCollapsed}
      toggleCollapsed={toggleCollapsed}
      hide={hide}
    />
  );
}

function GridSectionInner({
  state,
  busy,
  isCollapsed,
  toggleCollapsed,
  hide,
}: {
  state: HomeSectionState;
  busy: boolean;
  isCollapsed: boolean;
  toggleCollapsed: () => void;
  hide: () => void;
}) {
  const t = useT();
  return (
    <section className="mt-3" aria-label={t.homeLayout.sectionLabels['library-grid']}>
      {/* Discrete inline controls — top-right, dim by default,
          full opacity on hover. No banner heading: the controls-
          section heading above already says "Ma bibliothèque". */}
      <div className="mb-2 flex items-center justify-end opacity-60 transition-opacity hover:opacity-100">
        <HomeSectionControls
          state={state}
          busy={busy}
          onCollapseToggle={toggleCollapsed}
          onHide={hide}
          sectionLabel={t.homeLayout.sectionLabels['library-grid']}
        />
      </div>
      {!isCollapsed && <LibraryClient mode="grid-only" />}
    </section>
  );
}
