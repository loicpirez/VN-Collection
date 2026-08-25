import { SkeletonBlock, SkeletonBoundary } from './Skeleton';

/**
 * Preserve the Eroge Price identity, statistics, and history card while its
 * data or client-only module is loading.
 *
 * @returns A destination-shaped, accessible loading placeholder.
 */
export function ErogePricePanelSkeleton() {
  return (
    <div
      className="rounded-2xl border border-border bg-bg-card p-4"
      data-eroge-price-panel-skeleton
    >
      <SkeletonBoundary>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <SkeletonBlock className="h-4 w-32" />
          <SkeletonBlock className="h-6 w-28 rounded-md" />
        </div>
        <div className="flex flex-wrap items-start gap-4">
          <SkeletonBlock className="aspect-[2/3] h-32 w-24 shrink-0 rounded-lg" />
          <div className="min-w-0 flex-1 space-y-2 pt-1">
            <SkeletonBlock className="h-5 w-2/3" />
            <SkeletonBlock className="h-3 w-1/2" />
            <SkeletonBlock className="h-3 w-1/3" />
          </div>
        </div>
        <div className="mt-4 grid gap-2 sm:grid-cols-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <SkeletonBlock key={index} className="h-16 rounded-lg" />
          ))}
        </div>
        <SkeletonBlock className="mt-4 h-40 w-full rounded-lg" />
      </SkeletonBoundary>
    </div>
  );
}
