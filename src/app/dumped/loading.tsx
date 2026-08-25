import { SkeletonBlock, SkeletonBoundary } from '@/components/Skeleton';
import { getDict } from '@/lib/i18n/server';

export default async function DumpedLoading() {
  const t = await getDict();
  return (
    <SkeletonBoundary label={t.common.loading} className="w-full" densityScope="dumped">
      <SkeletonBlock className="mb-4 h-11 w-28 md:hidden" />
      <header className="mb-6 rounded-2xl border border-border bg-bg-card p-4 sm:p-6" data-dumped-header-skeleton>
        <div className="flex items-center gap-2">
          <SkeletonBlock className="h-6 w-6 shrink-0" />
          <SkeletonBlock className="h-7 w-52" />
        </div>
        <SkeletonBlock className="mt-3 h-3 w-96 max-w-full" />
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="rounded-lg border border-border bg-bg-elev/50 p-3 text-center">
              <SkeletonBlock className="mx-auto h-3 w-20" />
              <SkeletonBlock className="mx-auto mt-2 h-6 w-14" />
            </div>
          ))}
        </div>
        <SkeletonBlock className="mt-4 h-2 w-full rounded-full" />
      </header>

      <nav className="mb-4 flex flex-wrap gap-2" data-dumped-tabs-skeleton>
        {Array.from({ length: 5 }).map((_, index) => (
          <SkeletonBlock key={index} className="h-11 w-28 sm:h-8" />
        ))}
      </nav>
      <SkeletonBlock className="mb-3 h-11 w-48" />

      <ul
        className="grid gap-3"
        data-dumped-items-skeleton
        style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, var(--card-density-px, 220px)), 1fr))' }}
      >
        {Array.from({ length: 9 }).map((_, index) => (
          <li key={index} className="flex gap-3 rounded-lg border border-border bg-bg-elev/40 p-2">
            <SkeletonBlock
              className="shrink-0 rounded"
              style={{
                width: 'clamp(64px, calc(var(--card-density-px, 220px) * 0.32), 160px)',
                aspectRatio: '2 / 3',
              }}
            />
            <div className="min-w-0 flex-1 space-y-2 py-1">
              <SkeletonBlock className="h-3 w-4/5" />
              <SkeletonBlock className="h-3 w-2/3" />
              <SkeletonBlock className="h-2 w-full rounded-full" />
              <SkeletonBlock className="h-3 w-1/2" />
            </div>
          </li>
        ))}
      </ul>
    </SkeletonBoundary>
  );
}
