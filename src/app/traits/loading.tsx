import { SkeletonBlock, SkeletonBoundary } from '@/components/Skeleton';
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
      <div
        className="grid gap-3"
        data-traits-results-skeleton
        style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, var(--card-density-px, 220px)), 1fr))' }}
      >
        {Array.from({ length: 12 }).map((_, index) => (
          <div key={index} className="rounded-xl border border-border bg-bg-card p-4">
            <div className="flex items-start justify-between gap-3">
              <SkeletonBlock className="h-4 w-2/3" />
              {index % 4 === 0 && <SkeletonBlock className="h-5 w-10 shrink-0" />}
            </div>
            <SkeletonBlock className="mt-2 h-3 w-full" />
            <SkeletonBlock className="mt-1.5 h-3 w-4/5" />
            <SkeletonBlock className="mt-2 h-3 w-20" />
          </div>
        ))}
      </div>
    </SkeletonBoundary>
  );
}
