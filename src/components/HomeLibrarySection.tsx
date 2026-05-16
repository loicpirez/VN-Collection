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
    <section className="mt-8" aria-labelledby="home-library-controls-heading">
      <header className="mb-2 flex items-center justify-between gap-2">
        <h2
          id="home-library-controls-heading"
          className="text-xs font-bold uppercase tracking-widest text-muted"
        >
          {t.homeSections.libraryControlsTitle}
        </h2>
        <HomeSectionControls
          state={state}
          busy={busy}
          onCollapseToggle={toggleCollapsed}
          onHide={hide}
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
  const t = useT();
  const { state, busy, isHidden, isCollapsed, toggleCollapsed, hide } = useHomeSection(
    'library-grid',
    initialState,
  );
  if (isHidden) return null;
  return (
    <section className="mt-4" aria-labelledby="home-library-grid-heading">
      <header className="mb-2 flex items-center justify-between gap-2">
        <h2
          id="home-library-grid-heading"
          className="text-xs font-bold uppercase tracking-widest text-muted"
        >
          {t.homeSections.libraryGridTitle}
        </h2>
        <HomeSectionControls
          state={state}
          busy={busy}
          onCollapseToggle={toggleCollapsed}
          onHide={hide}
        />
      </header>
      {!isCollapsed && <LibraryClient mode="grid-only" />}
    </section>
  );
}
