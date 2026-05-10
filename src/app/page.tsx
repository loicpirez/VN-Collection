import { Suspense } from 'react';
import { LibraryClient } from '@/components/LibraryClient';
import { RecentlyViewedStrip } from '@/components/RecentlyViewedStrip';

export default function HomePage() {
  return (
    <Suspense>
      <RecentlyViewedStrip />
      <LibraryClient />
    </Suspense>
  );
}
