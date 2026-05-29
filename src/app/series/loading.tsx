import { SkeletonBlock, SkeletonRows, SkeletonBoundary } from '@/components/Skeleton';
import { getDict } from '@/lib/i18n/server';

export default async function SeriesLoading() {
  const t = await getDict();
  return (
    <SkeletonBoundary label={t.common.loading} className="space-y-4">
      <SkeletonBlock className="h-7 w-48" />
      <SkeletonBlock className="h-40 w-full" />
      <SkeletonRows count={4} withThumb={false} />
    </SkeletonBoundary>
  );
}
