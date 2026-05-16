import { Suspense } from 'react';
import { LibraryClient } from '@/components/LibraryClient';
import { RecentlyViewedStrip } from '@/components/RecentlyViewedStrip';
import { AnniversaryFeed } from '@/components/AnniversaryFeed';
import { ReadingQueueStrip } from '@/components/ReadingQueueStrip';
import { HomeLibraryControlsSection, HomeLibraryGridSection } from '@/components/HomeLibrarySection';
import { HomeLayoutEditorTrigger } from '@/components/HomeLayoutEditorTrigger';
import { getAppSetting } from '@/lib/db';
import { parseHomeSectionLayoutV1, type HomeSectionId } from '@/lib/home-section-layout';

export const dynamic = 'force-dynamic';

export default function HomePage() {
  // Server-read once per render. Each strip ignores its body and
  // returns null when `state.visible === false`; the menu inside each
  // header writes mutations back via PATCH /api/settings and triggers
  // a router.refresh() so the next paint reflects the change.
  const layout = parseHomeSectionLayoutV1(getAppSetting('home_section_layout_v1'));
  // Map every section id to its renderable element so the order array
  // can drive the page composition. Library is a registered section so
  // the user can hide / collapse / reorder it like every other strip.
  const sectionRenderers: Record<HomeSectionId, React.ReactNode> = {
    'recently-viewed': (
      <RecentlyViewedStrip initialState={layout.sections['recently-viewed']} />
    ),
    'reading-queue': <ReadingQueueStrip initialState={layout.sections['reading-queue']} />,
    anniversary: <AnniversaryFeed initialState={layout.sections.anniversary} />,
    'library-controls': (
      <HomeLibraryControlsSection initialState={layout.sections['library-controls']} />
    ),
    'library-grid': (
      <HomeLibraryGridSection initialState={layout.sections['library-grid']} />
    ),
  };
  return (
    <Suspense>
      <HomeLayoutEditorTrigger layout={layout} />
      {layout.order.map((id) => (
        <div key={id}>{sectionRenderers[id]}</div>
      ))}
    </Suspense>
  );
}
