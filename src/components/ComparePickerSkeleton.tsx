import { SkeletonBlock } from './Skeleton';

/**
 * Route-safe placeholder for the compare picker. Selected VNs are optional and
 * unavailable to both the route boundary and the lazy-module boundary, so only
 * the guaranteed label and search field are reserved here.
 */
export function ComparePickerSkeleton() {
  return (
    <div className="mt-4" data-compare-picker-controls-skeleton>
      <SkeletonBlock className="mb-2 h-3 w-24" />
      <SkeletonBlock className="h-11 w-full rounded-md" />
    </div>
  );
}
