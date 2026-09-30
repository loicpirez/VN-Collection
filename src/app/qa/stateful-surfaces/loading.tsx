import { SkeletonBlock, SkeletonBoundary } from '@/components/Skeleton';

/** Preserve representative component geometry while QA fixtures load. */
export default function QaStatefulSurfacesLoading() {
  return (
    <SkeletonBoundary label="Loading" className="mx-auto max-w-4xl space-y-6 p-6">
      <SkeletonBlock className="h-8 w-1/2" />
      <SkeletonBlock className="h-48 w-full" />
      <SkeletonBlock className="h-64 w-full" />
    </SkeletonBoundary>
  );
}
