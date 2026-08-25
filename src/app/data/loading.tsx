import { SkeletonBlock, SkeletonBoundary } from '@/components/Skeleton';
import { getDict } from '@/lib/i18n/server';

export default async function DataLoading() {
  const t = await getDict();
  return (
    <SkeletonBoundary label={t.app.loading} className="w-full space-y-8">
      <header className="flex items-center gap-3">
        <SkeletonBlock className="h-7 w-7 shrink-0" />
        <div className="min-w-0 flex-1 space-y-2">
          <SkeletonBlock className="h-7 w-52 max-w-full" />
          <SkeletonBlock className="h-3 w-96 max-w-full" />
        </div>
      </header>
      <SkeletonBlock className="h-11 w-32" />

      <DataPanelSkeleton marker="status">
        <SkeletonBlock className="h-3 w-3/4 max-w-full" />
        <div className="mt-4 grid gap-3 sm:grid-cols-2" data-data-status-grid-skeleton>
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="rounded-lg border border-border bg-bg-elev/40 p-3">
              <SkeletonBlock className="h-2.5 w-24" />
              <SkeletonBlock className="mt-2 h-4 w-2/3" />
              <SkeletonBlock className="mt-2 h-2.5 w-1/2" />
            </div>
          ))}
        </div>
        <SkeletonBlock className="mt-4 h-10 w-full" />
      </DataPanelSkeleton>

      <DataPanelSkeleton marker="export">
        <SkeletonBlock className="h-3 w-2/3 max-w-full" />
        <div className="mt-4 flex flex-wrap gap-2">
          {Array.from({ length: 6 }).map((_, index) => (
            <SkeletonBlock key={index} className="h-11 w-28" />
          ))}
        </div>
        <SkeletonBlock className="mt-3 h-2.5 w-72 max-w-full" />
      </DataPanelSkeleton>

      <DataPanelSkeleton marker="import">
        <SkeletonBlock className="h-3 w-3/4 max-w-full" />
        <div className="mt-4 flex flex-wrap gap-2">
          <SkeletonBlock className="h-11 w-40" />
          <SkeletonBlock className="h-11 w-28" />
        </div>
        <SkeletonBlock className="mt-3 h-2.5 w-64 max-w-full" />
      </DataPanelSkeleton>

      <DataPanelSkeleton marker="maintenance">
        <SkeletonBlock className="h-3 w-2/3 max-w-full" />
        <div
          className="mt-4 grid min-w-0 gap-4 md:grid-cols-2 lg:grid-cols-3"
          data-data-maintenance-grid-skeleton
        >
          {Array.from({ length: 3 }).map((_, columnIndex) => (
            <div key={columnIndex} className="min-w-0 space-y-2">
              <SkeletonBlock className="h-3 w-28" />
              {Array.from({ length: 3 }).map((_, rowIndex) => (
                <SkeletonBlock key={rowIndex} className="h-12 w-full" />
              ))}
            </div>
          ))}
        </div>
      </DataPanelSkeleton>

      <div className="grid gap-6 md:grid-cols-2" data-data-tools-grid-skeleton>
        {Array.from({ length: 2 }).map((_, index) => (
          <DataPanelSkeleton key={index} marker={`tool-${index}`}>
            <SkeletonBlock className="h-3 w-full" />
            <SkeletonBlock className="mt-2 h-3 w-3/4" />
            <div className="mt-4 flex gap-2">
              <SkeletonBlock className="h-11 w-28" />
              <SkeletonBlock className="h-11 w-32" />
            </div>
          </DataPanelSkeleton>
        ))}
      </div>
    </SkeletonBoundary>
  );
}

function DataPanelSkeleton({
  children,
  marker,
}: {
  children: React.ReactNode;
  marker: string;
}) {
  return (
    <section
      className="rounded-2xl border border-border bg-bg-card p-4 sm:p-6"
      data-data-panel-skeleton={marker}
    >
      <div className="mb-3 flex items-center gap-2">
        <SkeletonBlock className="h-5 w-5 shrink-0" />
        <SkeletonBlock className="h-5 w-44 max-w-full" />
      </div>
      {children}
    </section>
  );
}
