import { SkeletonBlock, SkeletonCompactGrid, SkeletonBoundary } from '@/components/Skeleton';
import { getDict } from '@/lib/i18n/server';

export default async function SeriesLoading() {
  const t = await getDict();
  return (
    <SkeletonBoundary label={t.common.loading} className="space-y-4">
      <div className="flex items-center gap-3">
        <SkeletonBlock className="h-7 w-7 rounded-full" />
        <SkeletonBlock className="h-7 w-48" />
      </div>
      <SkeletonBlock className="h-24 w-full rounded-2xl" />
      <SkeletonCompactGrid count={8} />
    </SkeletonBoundary>
  );
}
