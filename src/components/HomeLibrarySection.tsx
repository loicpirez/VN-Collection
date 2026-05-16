'use client';
import { HomeSectionControls, useHomeSection } from './HomeSectionMenu';
import { LibraryClient } from './LibraryClient';
import { useT } from '@/lib/i18n/client';
import type { HomeSectionState } from '@/lib/home-section-layout';

/**
 * Library section wrapped in the same hide / collapse / reorder shell
 * as every other home strip. When the user hides it, the giant library
 * grid is removed from the home page entirely (still reachable via
 * `/?status=…` etc.); collapsing keeps the header but drops the grid.
 *
 * The header is intentionally compact so it doesn't fight LibraryClient's
 * own filter bar (the library carries its own internal toolbar). Showing
 * a chevron + menu lets the user retract it without leaving the page.
 */
export function HomeLibrarySection({ initialState }: { initialState?: HomeSectionState }) {
  const t = useT();
  const { state, busy, isHidden, isCollapsed, toggleCollapsed, hide } = useHomeSection(
    'library',
    initialState,
  );
  if (isHidden) return null;
  return (
    <section className="mt-8" aria-labelledby="home-library-heading">
      <header className="mb-2 flex items-center justify-between gap-2">
        <h2
          id="home-library-heading"
          className="text-xs font-bold uppercase tracking-widest text-muted"
        >
          {t.homeSections.libraryTitle}
        </h2>
        <HomeSectionControls
          state={state}
          busy={busy}
          onCollapseToggle={toggleCollapsed}
          onHide={hide}
        />
      </header>
      {!isCollapsed && <LibraryClient />}
    </section>
  );
}
