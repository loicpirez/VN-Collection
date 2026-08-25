import { SkeletonBlock } from './Skeleton';

/** Render the density-aware horizontal ranking cards used by both route and Suspense loading states. */
export function TopRankedResultsSkeleton() {
  return (
    <section className="rounded-xl border border-border bg-bg-card p-3 sm:p-5" data-top-ranked-results-skeleton>
      <ol
        className="grid gap-4"
        style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, var(--card-density-px, 220px)), 1fr))' }}
      >
        {Array.from({ length: 12 }).map((_, index) => (
          <li key={index} className="relative flex gap-3 rounded-xl border border-border bg-bg-card p-3">
            <SkeletonBlock className="absolute -left-1.5 -top-1.5 z-10 h-6 w-7 rounded-full" />
            <SkeletonBlock
              className="shrink-0 rounded-lg"
              style={{
                width: 'clamp(64px, calc(var(--card-density-px, 220px) * 0.42), 200px)',
                aspectRatio: '2 / 3',
              }}
            />
            <div className="min-w-0 flex-1 py-1">
              <SkeletonBlock className="h-4 w-4/5" />
              <SkeletonBlock className="mt-2 h-3 w-3/5" />
              <div className="mt-3 flex flex-wrap gap-2">
                <SkeletonBlock className="h-5 w-12" />
                <SkeletonBlock className="h-5 w-16" />
              </div>
              <SkeletonBlock className="mt-3 h-2.5 w-2/3" />
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

/** Render the complete Top Ranked header geometry above the shared horizontal results. */
export function TopRankedRouteSkeleton() {
  return (
    <>
      <SkeletonBlock className="mb-4 h-11 w-28 md:hidden" />
      <header className="mb-6 rounded-2xl border border-border bg-bg-card p-4 sm:p-6">
        <div className="flex flex-wrap items-start gap-3">
          <div className="min-w-0 flex-1 space-y-2">
            <SkeletonBlock className="h-8 w-52 max-w-full" />
            <SkeletonBlock className="h-4 w-[30rem] max-w-full" />
          </div>
          <div className="flex flex-wrap gap-2">
            <SkeletonBlock className="h-11 w-36" />
            <SkeletonBlock className="h-11 w-28" />
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-1">
          <SkeletonBlock className="h-11 w-28 can-hover:sm:h-8" />
          <SkeletonBlock className="h-11 w-28 can-hover:sm:h-8" />
        </div>
        <div className="mt-3 flex flex-wrap items-end justify-between gap-3">
          <div className="space-y-2">
            <SkeletonBlock className="h-2.5 w-64 max-w-full" />
            <SkeletonBlock className="h-2.5 w-48 max-w-full" />
          </div>
          <div className="flex flex-wrap gap-1">
            {Array.from({ length: 5 }).map((_, index) => (
              <SkeletonBlock key={index} className="h-11 w-12 can-hover:sm:h-7" />
            ))}
          </div>
        </div>
      </header>
      <TopRankedResultsSkeleton />
    </>
  );
}
