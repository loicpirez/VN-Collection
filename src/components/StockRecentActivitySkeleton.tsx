import { SkeletonBlock } from './Skeleton';

/**
 * Loading body shared by the stock route and its hydrated recent-activity panel.
 *
 * @param label Accessible loading announcement.
 * @param announce Whether this instance owns the live status announcement.
 * @returns Destination-shaped recent checks and completed batches.
 */
export function StockRecentActivitySkeleton({
  label,
  announce = true,
}: {
  label: string;
  announce?: boolean;
}) {
  return (
    <div
      role={announce ? 'status' : undefined}
      aria-live={announce ? 'polite' : undefined}
      aria-busy={announce ? true : undefined}
      aria-label={announce ? label : undefined}
      aria-hidden={announce ? undefined : true}
      className="mt-4"
      data-stock-recent-body-skeleton
    >
      <SkeletonBlock className="h-2.5 w-28" />
      <ul className="mt-2 grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-2" data-stock-recent-checks-skeleton>
        {Array.from({ length: 4 }).map((_, index) => (
          <li key={index} className="flex min-h-[44px] min-w-0 items-center justify-between gap-2 rounded-md border border-border bg-bg px-3 py-2">
            <SkeletonBlock className="h-3 min-w-0 flex-1" />
            <SkeletonBlock className="h-2.5 w-14 shrink-0" />
          </li>
        ))}
      </ul>
      <SkeletonBlock className="mt-4 h-2.5 w-28" />
      <ul className="mt-2 divide-y divide-border rounded-md border border-border bg-bg px-3" data-stock-recent-batches-skeleton>
        {Array.from({ length: 2 }).map((_, index) => (
          <li key={index} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 py-2">
            <SkeletonBlock className="h-3 w-40 max-w-[65%]" />
            <SkeletonBlock className="h-2.5 w-24" />
            <SkeletonBlock className="h-2.5 w-48 max-w-full" />
          </li>
        ))}
      </ul>
    </div>
  );
}
