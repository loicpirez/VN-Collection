import { SkeletonBlock, SkeletonRows, SkeletonBoundary } from '@/components/Skeleton';
import { getDict } from '@/lib/i18n/server';

export default async function ListsLoading() {
  const t = await getDict();
  return (
    <SkeletonBoundary label={t.common.loading} className="space-y-4">
      <SkeletonBlock className="h-7 w-40" />
      <SkeletonBlock className="h-32 w-full" />
      <SkeletonRows count={5} withThumb={false} />
    </SkeletonBoundary>
  );
}
