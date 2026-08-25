import { SkeletonBlock, SkeletonCardGrid, SkeletonBoundary } from '@/components/Skeleton';
import { getDict } from '@/lib/i18n/server';

export default async function RecommendationsLoading() {
  const t = await getDict();
  return (
    <SkeletonBoundary label={t.common.loading} className="w-full">
      <SkeletonBlock className="mb-4 h-11 w-28 md:hidden" />
      <header className="mb-6 rounded-2xl border border-border bg-bg-card p-4 sm:p-6" data-recommendations-header-skeleton>
        <div className="flex items-center gap-2">
          <SkeletonBlock className="h-6 w-6 shrink-0" />
          <SkeletonBlock className="h-7 w-56 max-w-full" />
        </div>
        <SkeletonBlock className="mt-3 h-3 w-96 max-w-full" />
        <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-5" data-recommendation-modes-skeleton>
          {Array.from({ length: 5 }).map((_, index) => (
            <SkeletonBlock key={index} className="h-16 w-full" />
          ))}
        </div>
        <div className="mt-4 rounded-lg border border-border bg-bg-elev/30 p-3">
          <SkeletonBlock className="h-3 w-36" />
          <SkeletonBlock className="mt-3 h-3 w-full" />
          <SkeletonBlock className="mt-2 h-3 w-3/4" />
        </div>
        <div className="mt-3 flex flex-wrap gap-3">
          {Array.from({ length: 4 }).map((_, index) => (
            <SkeletonBlock key={index} className="h-11 w-32" />
          ))}
        </div>
        <SkeletonBlock className="mt-3 h-11 w-full" />
      </header>
      <SkeletonCardGrid count={12} />
    </SkeletonBoundary>
  );
}
