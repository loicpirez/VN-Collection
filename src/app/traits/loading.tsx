import { SkeletonBlock, SkeletonBoundary } from '@/components/Skeleton';
import { TraitResultsSkeleton } from '@/components/TraitsBrowserSkeleton';
import { getDict } from '@/lib/i18n/server';

export default async function TraitsLoading() {
  const t = await getDict();
  return (
    <SkeletonBoundary label={t.common.loading} densityScope="traitsList">
      <header className="mb-6 flex flex-wrap items-start gap-3" data-traits-header-skeleton>
        <SkeletonBlock className="h-7 w-7 rounded-full" />
        <div className="min-w-0 flex-1 space-y-2">
          <SkeletonBlock className="h-7 w-40" />
          <SkeletonBlock className="h-4 w-72 max-w-full" />
        </div>
        <SkeletonBlock className="h-11 w-32 rounded-md" />
      </header>
      <div className="mb-6 flex flex-wrap gap-2" data-traits-controls-skeleton>
        <SkeletonBlock className="h-11 min-w-[160px] flex-1 rounded-md sm:min-w-[200px]" />
        <SkeletonBlock className="h-11 w-36 rounded-md" />
        <SkeletonBlock className="h-[54px] w-full max-w-[320px] rounded-md" />
      </div>
      <TraitResultsSkeleton />
    </SkeletonBoundary>
  );
}
