import { Suspense } from 'react';
import { LibraryClient } from '@/components/LibraryClient';
import { RecentlyViewedStrip } from '@/components/RecentlyViewedStrip';
import { AnniversaryFeed } from '@/components/AnniversaryFeed';
import { ReadingQueueStrip } from '@/components/ReadingQueueStrip';
import { getAppSetting } from '@/lib/db';
import { parseHomeSectionLayoutV1 } from '@/lib/home-section-layout';

export const dynamic = 'force-dynamic';

export default function HomePage() {
  // Server-read once per render. Each strip ignores its body and
  // returns null when `state.visible === false`; the menu inside each
  // header writes mutations back via PATCH /api/settings and triggers
  // a router.refresh() so the next paint reflects the change.
  const layout = parseHomeSectionLayoutV1(getAppSetting('home_section_layout_v1'));
  return (
    <Suspense>
      <RecentlyViewedStrip initialState={layout['recently-viewed']} />
      <ReadingQueueStrip initialState={layout['reading-queue']} />
      <AnniversaryFeed initialState={layout.anniversary} />
      <LibraryClient />
    </Suspense>
  );
}
