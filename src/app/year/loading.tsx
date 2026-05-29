import { SkeletonBlock, SkeletonCardGrid, SkeletonBoundary } from '@/components/Skeleton';
import { getDict } from '@/lib/i18n/server';

export default async function YearLoading() {
  const t = await getDict();
  return (
    <SkeletonBoundary label={t.common.loading} className="w-full space-y-4">
      <SkeletonBlock className="h-7 w-40" />
      <SkeletonBlock className="h-28 w-full rounded-2xl" />
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <SkeletonBlock key={i} className="h-24 w-full rounded-xl" />
        ))}
      </div>
      <SkeletonCardGrid count={6} />
    </SkeletonBoundary>
  );
}
