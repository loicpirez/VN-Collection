import { Suspense } from 'react';
import { LibraryClient } from '@/components/LibraryClient';
import { RecentlyViewedStrip } from '@/components/RecentlyViewedStrip';
import { AnniversaryFeed } from '@/components/AnniversaryFeed';
import { ReadingQueueStrip } from '@/components/ReadingQueueStrip';

export const dynamic = 'force-dynamic';

export default function HomePage() {
  return (
    <Suspense>
      <RecentlyViewedStrip />
      <ReadingQueueStrip />
      <AnniversaryFeed />
      <LibraryClient />
    </Suspense>
  );
}
