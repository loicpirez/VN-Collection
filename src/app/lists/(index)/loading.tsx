import { SkeletonBlock, SkeletonCompactGrid, SkeletonBoundary } from '@/components/Skeleton';
import { getDict } from '@/lib/i18n/server';

export default async function ListsLoading() {
  const t = await getDict();
  return (
    <SkeletonBoundary label={t.common.loading} className="space-y-4">
      <div className="flex items-center gap-3">
        <SkeletonBlock className="h-7 w-7 rounded-full" />
        <div className="flex-1 space-y-2">
          <SkeletonBlock className="h-7 w-40" />
          <SkeletonBlock className="h-4 w-72 max-w-full" />
        </div>
      </div>
      <SkeletonBlock className="h-32 w-full rounded-xl" />
      <SkeletonCompactGrid count={6} />
    </SkeletonBoundary>
  );
}
