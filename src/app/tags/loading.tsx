import { SkeletonBlock, SkeletonBoundary } from '@/components/Skeleton';
import { TagFlatResultsSkeleton } from '@/components/TagsBrowserSkeleton';
import { getDict } from '@/lib/i18n/server';

export default async function TagsLoading() {
  const t = await getDict();
  return (
    <SkeletonBoundary label={t.common.loading}>
      <header className="mb-6 flex flex-wrap items-start gap-3" data-tags-header-skeleton>
        <SkeletonBlock className="h-7 w-7 rounded-full" />
        <div className="min-w-0 flex-1 space-y-2">
          <SkeletonBlock className="h-7 w-40" />
          <SkeletonBlock className="h-4 w-72 max-w-full" />
        </div>
        <SkeletonBlock className="h-11 w-32 rounded-md" />
      </header>
      <div className="mb-4 inline-flex gap-1 rounded-md border border-border bg-bg-elev/30 p-1" data-tags-tabs-skeleton>
        <SkeletonBlock className="h-11 w-24 rounded" />
        <SkeletonBlock className="h-11 w-24 rounded" />
      </div>
      <div className="mb-6 flex flex-wrap gap-2" data-tags-controls-skeleton>
        <SkeletonBlock className="h-11 min-w-[160px] flex-1 rounded-md sm:min-w-[200px]" />
        <SkeletonBlock className="h-11 w-full rounded-md sm:w-[220px]" />
      </div>
      <TagFlatResultsSkeleton />
    </SkeletonBoundary>
  );
}
