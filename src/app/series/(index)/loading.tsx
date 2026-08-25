import { SkeletonBlock, SkeletonBoundary } from '@/components/Skeleton';
import { getDict } from '@/lib/i18n/server';

export default async function SeriesLoading() {
  const t = await getDict();
  return (
    <SkeletonBoundary label={t.common.loading} className="space-y-4">
      <div className="flex items-center gap-3">
        <SkeletonBlock className="h-7 w-7 rounded-full" />
        <SkeletonBlock className="h-7 w-48" />
      </div>
      <div className="rounded-2xl border border-border bg-bg-card p-4 sm:p-5" data-series-create-skeleton>
        <div className="grid gap-3 sm:grid-cols-[1fr_2fr_auto]">
          <SkeletonBlock className="h-11 w-full rounded-md" />
          <SkeletonBlock className="h-11 w-full rounded-md" />
          <SkeletonBlock className="h-11 w-28 rounded-md" />
        </div>
      </div>
      <div
        className="grid gap-3"
        data-series-grid-skeleton
        style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, var(--card-density-px, 220px)), 1fr))' }}
      >
        {Array.from({ length: 8 }).map((_, index) => (
          <div key={index} className="flex min-h-[76px] items-center justify-between gap-3 rounded-xl border border-border bg-bg-card p-4">
            <div className="min-w-0 flex-1 space-y-2">
              <SkeletonBlock className="h-4 w-2/3" />
              <SkeletonBlock className="h-3 w-4/5" />
            </div>
            <SkeletonBlock className="h-11 w-11 shrink-0 rounded-md" />
          </div>
        ))}
      </div>
    </SkeletonBoundary>
  );
}
