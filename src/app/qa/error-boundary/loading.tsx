import { SkeletonBlock, SkeletonBoundary } from '@/components/Skeleton';

/** Preserve the global-boundary QA shell while its route loads. */
export default function QaGlobalErrorLoading() {
  return (
    <SkeletonBoundary label="Loading" className="mx-auto max-w-lg p-6">
      <SkeletonBlock className="h-8 w-2/3" />
      <SkeletonBlock className="mt-4 h-20 w-full" />
      <SkeletonBlock className="mt-4 h-11 w-32" />
    </SkeletonBoundary>
  );
}
