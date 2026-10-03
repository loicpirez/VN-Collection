'use client';
import { HomeSectionControls, useHomeSection } from './HomeSectionMenu';
import { LibraryClient } from './LibraryClient';
import { useT } from '@/lib/i18n/client';
import type { HomeSectionState } from '@/lib/home-section-layout';

/**
 * Home library surface with one section owner for its heading, controls,
 * and card grid.
 */
export function HomeLibrarySection({ initialState }: { initialState?: HomeSectionState }) {
  const t = useT();
  const { state, busy, isHidden, isCollapsed, toggleCollapsed, hide } = useHomeSection(
    'library',
    initialState,
  );
  if (isHidden) return null;
  return (
    <section aria-labelledby="home-library-heading">
      <header className="mb-3 flex items-center justify-between gap-2">
        <h2
          id="home-library-heading"
          className="text-base font-bold text-white"
        >
          {t.homeSections.libraryTitle}
        </h2>
        <HomeSectionControls
          state={state}
          busy={busy}
          onCollapseToggle={toggleCollapsed}
          onHide={hide}
          sectionLabel={t.homeLayout.sectionLabels.library}
        />
      </header>
      {!isCollapsed && <LibraryClient />}
    </section>
  );
}
