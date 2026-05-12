import { Suspense } from 'react';
import { LibraryClient } from '@/components/LibraryClient';
import { RecentlyViewedStrip } from '@/components/RecentlyViewedStrip';
import { AnniversaryFeed } from '@/components/AnniversaryFeed';

export default function HomePage() {
  return (
    <Suspense>
      <RecentlyViewedStrip />
      <AnniversaryFeed />
      <LibraryClient />
    </Suspense>
  );
}
