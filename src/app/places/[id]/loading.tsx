import { SkeletonBlock, SkeletonBoundary } from '@/components/Skeleton';
import { getDict } from '@/lib/i18n/server';

export default async function PlaceDetailLoading() {
  const t = await getDict();
  return (
    <SkeletonBoundary label={t.common.loading} className="mx-auto max-w-7xl space-y-5 px-4 py-8 sm:px-6 lg:px-8">
      <SkeletonBlock className="h-11 w-28" />
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <SkeletonBlock className="mt-1 h-5 w-5 shrink-0" />
          <div className="min-w-0 space-y-2">
            <SkeletonBlock className="h-8 w-64 max-w-full" />
            <SkeletonBlock className="h-4 w-36" />
            <SkeletonBlock className="h-4 w-80 max-w-full" />
            <SkeletonBlock className="h-5 w-20" />
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {Array.from({ length: 5 }).map((_, index) => (
            <SkeletonBlock key={index} className="h-11 w-28" />
          ))}
        </div>
      </div>

      <div className="flex gap-1">
        <SkeletonBlock className="h-11 w-36" />
        <SkeletonBlock className="h-11 w-40" />
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7" data-place-detail-stats-skeleton>
        {Array.from({ length: 7 }).map((_, index) => (
          <div key={index} className="rounded-xl border border-border bg-bg-card p-4 text-center">
            <SkeletonBlock className="mx-auto mb-3 h-3 w-20 max-w-full" />
            <SkeletonBlock className="mx-auto h-8 w-14" />
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-border bg-bg-card p-3" data-place-detail-controls-skeleton>
        <div className="flex flex-wrap gap-2">
          {Array.from({ length: 5 }).map((_, index) => (
            <SkeletonBlock key={index} className="h-11 w-24" />
          ))}
        </div>
        <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(16rem,1fr)_12rem_12rem_auto]">
          <SkeletonBlock className="h-11 w-full" />
          <SkeletonBlock className="h-11 w-full" />
          <SkeletonBlock className="h-11 w-full" />
          <SkeletonBlock className="h-11 w-full lg:w-64" />
        </div>
      </div>

      <div
        className="grid gap-3"
        data-place-detail-items-skeleton
        style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, var(--card-density-px, 220px)), 1fr))' }}
      >
        {Array.from({ length: 8 }).map((_, index) => (
          <SkeletonBlock key={index} className="h-96 w-full rounded-xl" />
        ))}
      </div>
    </SkeletonBoundary>
  );
}
