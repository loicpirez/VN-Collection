import { SkeletonBlock, SkeletonBoundary } from '@/components/Skeleton';
import { getDict } from '@/lib/i18n/server';

export default async function StatsLoading() {
  const t = await getDict();
  return (
    <SkeletonBoundary label={t.app.loading} className="w-full space-y-8">
      <header className="flex items-center gap-3">
        <SkeletonBlock className="h-7 w-7 shrink-0" />
        <SkeletonBlock className="h-7 w-44 max-w-full" />
      </header>

      <StatsPanelSkeleton marker="summary">
        <SkeletonBlock className="h-3 w-2/3 max-w-full" />
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="rounded-lg border border-border bg-bg-elev/50 p-4 text-center">
              <SkeletonBlock className="mx-auto h-2.5 w-20 max-w-full" />
              <SkeletonBlock className="mx-auto mt-2 h-7 w-16" />
            </div>
          ))}
        </div>
        <div className="mt-6 flex items-center justify-center gap-6">
          <SkeletonBlock className="h-32 w-32 shrink-0 rounded-full" />
          <div className="hidden w-48 space-y-3 sm:block">
            {Array.from({ length: 4 }).map((_, index) => (
              <SkeletonBlock key={index} className="h-3 w-full" />
            ))}
          </div>
        </div>
      </StatsPanelSkeleton>

      <StatsPanelSkeleton marker="goal">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <SkeletonBlock className="h-4 w-36" />
          <SkeletonBlock className="h-9 w-24" />
        </div>
        <SkeletonBlock className="mt-4 h-3 w-full rounded-full" />
        <SkeletonBlock className="mt-3 h-3 w-40" />
      </StatsPanelSkeleton>

      <StatsPanelSkeleton marker="histogram">
        <SkeletonBlock className="h-3 w-3/4 max-w-full" />
        <div className="mt-5 flex h-32 items-end gap-1" data-stats-bars-skeleton>
          {Array.from({ length: 10 }).map((_, index) => (
            <SkeletonBlock
              key={index}
              className="min-w-0 flex-1 rounded-b-none"
              style={{ height: `${35 + ((index * 17) % 65)}%` }}
            />
          ))}
        </div>
      </StatsPanelSkeleton>

      <div className="grid gap-6 md:grid-cols-2" data-stats-chart-grid-skeleton>
        {Array.from({ length: 2 }).map((_, panelIndex) => (
          <StatsPanelSkeleton key={panelIndex} marker={`ranking-${panelIndex}`}>
            <div className="mt-4 space-y-3">
              {Array.from({ length: 6 }).map((_, rowIndex) => (
                <div key={rowIndex} className="flex items-center gap-3">
                  <SkeletonBlock className="h-3 w-24 shrink-0" />
                  <SkeletonBlock className="h-3 flex-1" style={{ maxWidth: `${95 - rowIndex * 9}%` }} />
                </div>
              ))}
            </div>
          </StatsPanelSkeleton>
        ))}
      </div>
    </SkeletonBoundary>
  );
}

function StatsPanelSkeleton({
  children,
  marker,
}: {
  children: React.ReactNode;
  marker: string;
}) {
  return (
    <section
      className="rounded-2xl border border-border bg-bg-card p-4 sm:p-6"
      data-stats-panel-skeleton={marker}
    >
      <div className="mb-4 flex items-center gap-2">
        <SkeletonBlock className="h-5 w-5 shrink-0" />
        <SkeletonBlock className="h-5 w-48 max-w-full" />
      </div>
      {children}
    </section>
  );
}
