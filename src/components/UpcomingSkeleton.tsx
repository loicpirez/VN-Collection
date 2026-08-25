import { SkeletonBlock, SkeletonBoundary } from './Skeleton';

/** Render the density-aware upcoming release cards used by route and tab loading states. */
export function UpcomingResultsSkeleton({ anticipated = false }: { anticipated?: boolean }) {
  const density = anticipated ? '280px' : '240px';
  const widthMultiplier = anticipated ? '0.45' : '0.42';
  return (
    <section
      className={`rounded-xl p-4 sm:p-5 ${anticipated ? 'border border-accent/40 bg-accent/5' : 'border border-border bg-bg-card'}`}
      data-upcoming-results-skeleton={anticipated ? 'anticipated' : 'releases'}
    >
      <SkeletonBlock className="mb-4 h-3 w-72 max-w-full" />
      <ol
        className="grid gap-4 lg:gap-5"
        style={{
          gridTemplateColumns:
            `repeat(auto-fill, minmax(min(100%, max(280px, var(--card-density-px, ${density}))), min(600px, calc(var(--card-density-px, ${density}) * 1.4))))`,
        }}
      >
        {Array.from({ length: 8 }).map((_, index) => (
          <li key={index} className="flex items-start gap-3 rounded-xl border border-border bg-bg-card p-3 sm:p-4">
            <SkeletonBlock
              className="shrink-0 rounded"
              style={{
                width: `clamp(${anticipated ? '72px' : '64px'}, calc(var(--card-density-px, 220px) * ${widthMultiplier}), ${anticipated ? '220px' : '200px'})`,
                aspectRatio: '2 / 3',
              }}
            />
            <div className="min-w-0 flex-1 space-y-3">
              <SkeletonBlock className="h-5 w-5/6" />
              <SkeletonBlock className="h-3 w-2/3" />
              <div className="flex flex-wrap gap-1.5">
                <SkeletonBlock className="h-7 w-20" />
                <SkeletonBlock className="h-7 w-20" />
                <SkeletonBlock className="h-7 w-20" />
              </div>
              <div className="flex flex-wrap gap-2">
                <SkeletonBlock className="h-11 w-24" />
                <SkeletonBlock className="h-11 w-20" />
              </div>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

/** Render the upcoming page controls and default release results while the route resolves. */
export function UpcomingRouteSkeleton({ label }: { label: string }) {
  return (
    <SkeletonBoundary label={label} className="w-full">
      <SkeletonBlock className="mb-4 h-11 w-28 md:hidden" />
      <header className="mb-6 rounded-2xl border border-border bg-bg-card p-4 sm:p-6" data-upcoming-header-skeleton>
        <div className="flex flex-wrap items-start gap-3">
          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex items-center gap-2">
              <SkeletonBlock className="h-6 w-6 shrink-0" />
              <SkeletonBlock className="h-7 w-48" />
            </div>
            <SkeletonBlock className="h-3 w-96 max-w-full" />
          </div>
          <div className="flex flex-wrap gap-2">
            <SkeletonBlock className="h-11 w-48" />
            <SkeletonBlock className="h-11 w-32" />
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-1">
          {Array.from({ length: 3 }).map((_, index) => (
            <SkeletonBlock key={index} className="h-11 w-32" />
          ))}
        </div>
      </header>
      <UpcomingResultsSkeleton />
    </SkeletonBoundary>
  );
}
