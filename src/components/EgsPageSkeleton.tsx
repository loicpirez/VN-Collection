import { SkeletonBlock, SkeletonBoundary } from './Skeleton';

/** Render the EGS integration header, sync panel, tools, and horizontal VN rows while data resolves. */
export function EgsPageSkeleton({ label }: { label: string }) {
  return (
    <SkeletonBoundary label={label} className="w-full">
        <SkeletonBlock className="mb-4 h-11 w-28 md:hidden" />
        <header className="mb-6 rounded-2xl border border-border bg-bg-card p-4 sm:p-6">
          <div className="flex items-center gap-2">
            <SkeletonBlock className="h-6 w-6 shrink-0" />
            <SkeletonBlock className="h-7 w-48 max-w-full" />
          </div>
          <SkeletonBlock className="mt-3 h-3 w-96 max-w-full" />
          <div className="mt-3 flex gap-3">
            <SkeletonBlock className="h-5 w-24" />
            <SkeletonBlock className="h-5 w-20 rounded-full" />
          </div>
        </header>

        <section className="mb-6 rounded-2xl border border-border bg-bg-card p-4 sm:p-6">
          <div className="flex items-center gap-2">
            <SkeletonBlock className="h-4 w-4 shrink-0" />
            <SkeletonBlock className="h-5 w-44" />
          </div>
          <SkeletonBlock className="mt-3 h-3 w-3/4 max-w-full" />
          <div className="mt-4 flex flex-wrap gap-2">
            <SkeletonBlock className="h-11 w-32" />
            <SkeletonBlock className="h-11 w-28" />
          </div>
        </section>

        <section className="rounded-2xl border border-border bg-bg-card p-4 sm:p-6">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <SkeletonBlock className="h-5 w-44" />
            <div className="flex gap-2">
              <SkeletonBlock className="h-11 w-48 max-w-full" />
              <SkeletonBlock className="h-11 w-11" />
            </div>
          </div>
          <ul
            className="grid gap-4"
            data-egs-results-skeleton
            style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, var(--card-density-px, 220px)), 1fr))' }}
          >
            {Array.from({ length: 9 }).map((_, index) => (
              <li key={index} className="relative flex gap-3 rounded-xl border border-border bg-bg-card p-3 pr-10">
                <SkeletonBlock
                  className="shrink-0 rounded"
                  style={{
                    width: 'clamp(72px, calc(var(--card-density-px, 220px) * 0.42), 200px)',
                    aspectRatio: '2 / 3',
                  }}
                />
                <div className="min-w-0 flex-1 space-y-2 py-1">
                  <SkeletonBlock className="h-3 w-4/5" />
                  <SkeletonBlock className="h-2.5 w-2/5" />
                  <SkeletonBlock className="h-5 w-20" />
                </div>
                <SkeletonBlock className="absolute right-2 top-2 h-7 w-7" />
              </li>
            ))}
          </ul>
        </section>
    </SkeletonBoundary>
  );
}
