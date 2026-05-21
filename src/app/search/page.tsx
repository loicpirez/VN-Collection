import type { Metadata } from 'next';
import { Suspense } from 'react';
import { SearchClient } from '@/components/SearchClient';
import { getDict } from '@/lib/i18n/server';
import { SkeletonRows } from '@/components/Skeleton';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const dict = await getDict();
  return { title: dict.nav.search };
}

export default function SearchPage() {
  return (
    <Suspense fallback={<SkeletonRows count={8} />}>
      <SearchClient />
    </Suspense>
  );
}
