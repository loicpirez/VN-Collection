import { SkeletonBlock } from './Skeleton';

/**
 * Preserve the guaranteed TagPicker frame while recommendation seeds resolve.
 *
 * @returns A label, chip row, search field, and hint matching SeedTagControls.
 */
export function SeedTagControlsSkeleton() {
  return (
    <div className="mt-3 rounded-lg border border-border bg-bg-elev/40 p-3" data-seed-tag-controls-skeleton>
      <div className="mb-2 flex items-center gap-2">
        <SkeletonBlock className="h-3 w-3" />
        <SkeletonBlock className="h-3 w-32" />
      </div>
      <div className="mb-2 flex min-h-[20px] flex-wrap gap-1.5">
        <SkeletonBlock className="h-5 w-24 rounded-full" />
        <SkeletonBlock className="h-5 w-20 rounded-full" />
        <SkeletonBlock className="h-5 w-28 rounded-full" />
      </div>
      <SkeletonBlock className="h-11 w-full rounded-md" />
      <SkeletonBlock className="mt-2 h-3 w-3/4" />
    </div>
  );
}
