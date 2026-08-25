import { SkeletonBlock, SkeletonBoundary } from '../Skeleton';

const CHIP_WIDTHS = [24, 20, 28, 18, 24, 20, 28, 20, 24, 18, 20, 28, 16] as const;

/**
 * Preserve the complete tri-state flag panel while its lazy module loads.
 *
 * @returns A destination-shaped, accessible loading placeholder.
 */
export function MoreFiltersSkeleton() {
  return (
    <div
      className="mt-3 rounded-lg border border-border bg-bg-card/40 p-3"
      data-library-more-filters-skeleton
    >
      <SkeletonBoundary>
        <SkeletonBlock className="mb-2 h-2.5 w-32" />
        <SkeletonBlock className="mb-2 h-2.5 w-64 max-w-full" />
        <div className="flex flex-wrap gap-1.5">
          {CHIP_WIDTHS.map((width, index) => (
            <SkeletonBlock
              key={index}
              className="h-11 rounded-md can-hover:sm:h-7"
              style={{ width: `${width * 4}px` }}
            />
          ))}
        </div>
      </SkeletonBoundary>
    </div>
  );
}
