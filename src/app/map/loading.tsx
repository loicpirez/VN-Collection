import { SkeletonBlock, SkeletonBoundary } from '@/components/Skeleton';
import { getDict } from '@/lib/i18n/server';

export default async function MapLoading() {
  const t = await getDict();
  return (
    <section className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8" data-map-route-skeleton>
      <SkeletonBoundary label={t.common.loading}>
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-2">
            <SkeletonBlock className="h-8 w-48" />
            <SkeletonBlock className="h-4 w-80 max-w-full" />
          </div>
          <div className="flex flex-wrap gap-2" data-map-header-actions-skeleton>
            <SkeletonBlock className="h-11 w-36" />
            <SkeletonBlock className="h-11 w-32" />
          </div>
        </div>

        <div className="mb-3 rounded-lg border border-border bg-bg-elev/35 p-3" data-map-privacy-skeleton>
          <div className="flex items-start gap-2.5">
            <SkeletonBlock className="h-4 w-4 shrink-0" />
            <div className="min-w-0 flex-1">
              <SkeletonBlock className="h-3 w-40" />
              <SkeletonBlock className="mt-2 h-3 w-full max-w-2xl" />
              <SkeletonBlock className="mt-2 h-11 w-40" />
            </div>
          </div>
        </div>

        <div className="mb-2 flex items-center gap-2" data-map-search-skeleton>
          <SkeletonBlock className="h-11 min-w-0 flex-1 rounded-md" />
          <SkeletonBlock className="h-11 w-28 rounded-md" />
        </div>

        <div className="mb-4 grid grid-cols-2 gap-1 sm:flex sm:items-center sm:justify-end" data-map-size-skeleton>
          {Array.from({ length: 4 }).map((_, index) => (
            <SkeletonBlock key={index} className="h-11 min-w-24 flex-1 rounded sm:flex-none" />
          ))}
        </div>

        <SkeletonBlock className="h-[55vh] min-h-[400px] w-full rounded-xl" data-map-frame-skeleton />
      </SkeletonBoundary>
    </section>
  );
}
