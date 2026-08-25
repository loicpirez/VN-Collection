import { SkeletonBoundary } from '@/components/Skeleton';
import { TopRankedRouteSkeleton } from '@/components/TopRankedSkeleton';
import { getDict } from '@/lib/i18n/server';

export default async function Loading() {
  const t = await getDict();
  return (
    <SkeletonBoundary label={t.common.loading} className="w-full">
      <TopRankedRouteSkeleton />
    </SkeletonBoundary>
  );
}
