import type { ReactElement } from 'react';
import { SkeletonBlock, SkeletonCardGrid } from './Skeleton';

/**
 * Reserve the complete non-empty Wishlist workspace while its first page loads.
 *
 * @returns Search, sorting, actions, advanced filters, and density-aware cards.
 */
export function WishlistWorkspaceSkeleton(): ReactElement {
  return (
    <div data-wishlist-workspace-skeleton>
      <div className="mb-2 flex flex-wrap items-center gap-2" data-wishlist-controls-skeleton>
        <SkeletonBlock className="h-11 min-w-[160px] flex-1 sm:min-w-[200px]" />
        <SkeletonBlock className="h-11 w-full" />
        <SkeletonBlock className="h-11 w-full" />
        <SkeletonBlock className="h-11 w-44" />
        <SkeletonBlock className="h-11 w-48" />
        <SkeletonBlock className="h-11 w-32" />
        <SkeletonBlock className="h-11 w-56" />
        <SkeletonBlock className="h-11 w-28" />
        <SkeletonBlock className="ml-auto h-3 w-52 max-w-full" />
      </div>

      <div
        className="mb-4 rounded-lg border border-border bg-bg-elev/20 p-3"
        data-wishlist-filters-skeleton
      >
        <SkeletonBlock className="mb-2 h-3 w-24" />
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <SkeletonBlock className="h-11 w-full" />
          <SkeletonBlock className="h-11 w-full" />
          <div className="flex items-center gap-1">
            <SkeletonBlock className="h-11 w-20" />
            <SkeletonBlock className="h-2 w-2" />
            <SkeletonBlock className="h-11 w-20" />
          </div>
          <div className="flex items-center gap-1">
            <SkeletonBlock className="h-11 w-20" />
            <SkeletonBlock className="h-2 w-2" />
            <SkeletonBlock className="h-11 w-20" />
          </div>
        </div>
      </div>

      <SkeletonCardGrid count={18} />
    </div>
  );
}
