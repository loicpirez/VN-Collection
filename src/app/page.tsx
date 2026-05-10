import { Suspense } from 'react';
import { LibraryClient } from '@/components/LibraryClient';

export default function HomePage() {
  return (
    <Suspense>
      <LibraryClient />
    </Suspense>
  );
}
