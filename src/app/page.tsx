import { Fragment, Suspense } from 'react';

import { RecentlyViewedStrip } from '@/components/RecentlyViewedStrip';
import { AnniversaryFeed } from '@/components/AnniversaryFeed';
import { ReadingQueueStrip } from '@/components/ReadingQueueStrip';
import { HomeLibraryControlsSection, HomeLibraryGridSection } from '@/components/HomeLibrarySection';
import { HomeLayoutEditorTrigger } from '@/components/HomeLayoutEditorTrigger';
import { getAppSettingRepository } from '@/lib/db/repositories/app-setting';
import { parseHomeSectionLayoutV1, type HomeSectionId } from '@/lib/home-section-layout';
import { HomeSectionSkeleton } from '@/components/HomePageSkeleton';
import type { Metadata } from 'next';
import { getDict } from '@/lib/i18n/server';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDict();
  return { title: t.nav.library };
}

export default async function HomePage() {
  const t = await getDict();
  // Server-read once per render. Each strip ignores its body and
  // returns null when `state.visible === false`; the menu inside each
  // header writes mutations back via PATCH /api/settings and triggers
  // a router.refresh() so the next paint reflects the change.
  let layout: ReturnType<typeof parseHomeSectionLayoutV1>;
  try {
    layout = parseHomeSectionLayoutV1(await getAppSettingRepository().get('home_section_layout_v1'));
  } catch {
    layout = parseHomeSectionLayoutV1(null);
  }
  // Map every section id to its renderable element so the order array
  // can drive the page composition. Library is a registered section so
  // the user can hide / collapse / reorder it like every other strip.
  const sectionRenderers: Record<HomeSectionId, React.ReactNode> = {
    'recently-viewed': layout.sections['recently-viewed'].visible ? (
      <RecentlyViewedStrip initialState={layout.sections['recently-viewed']} />
    ) : null,
    'reading-queue': layout.sections['reading-queue'].visible ? (
      <Suspense
        fallback={(
          <HomeSectionSkeleton
            id="reading-queue"
            state={layout.sections['reading-queue']}
            label={t.app.loading}
          />
        )}
      >
        <ReadingQueueStrip initialState={layout.sections['reading-queue']} />
      </Suspense>
    ) : null,
    anniversary: layout.sections.anniversary.visible ? (
      <Suspense
        fallback={(
          <HomeSectionSkeleton
            id="anniversary"
            state={layout.sections.anniversary}
            label={t.app.loading}
          />
        )}
      >
        <AnniversaryFeed initialState={layout.sections.anniversary} />
      </Suspense>
    ) : null,
    'library-controls': layout.sections['library-controls'].visible ? (
      <HomeLibraryControlsSection initialState={layout.sections['library-controls']} />
    ) : null,
    'library-grid': layout.sections['library-grid'].visible ? (
      <HomeLibraryGridSection initialState={layout.sections['library-grid']} />
    ) : null,
  };
  return (
    <>
      <h1 className="sr-only">{t.nav.library}</h1>
      <HomeLayoutEditorTrigger layout={layout} />
      <div className="space-y-5">
        {layout.order.map((id) => (
          <Fragment key={id}>{sectionRenderers[id]}</Fragment>
        ))}
      </div>
    </>
  );
}
