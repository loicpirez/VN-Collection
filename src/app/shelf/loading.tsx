import { SkeletonBlock, SkeletonRows, SkeletonBoundary } from '@/components/Skeleton';
import { getDict } from '@/lib/i18n/server';

export default async function ShelfLoading() {
  const t = await getDict();
  return (
    <SkeletonBoundary label={t.common.loading} className="w-full space-y-4">
      <SkeletonBlock className="h-4 w-24" />
      <SkeletonBlock className="h-32 w-full rounded-2xl" />
      <SkeletonBlock className="h-9 w-64 rounded-xl" />
      <SkeletonRows count={4} />
    </SkeletonBoundary>
  );
}
