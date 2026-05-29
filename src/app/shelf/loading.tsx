import { SkeletonBlock, SkeletonRows } from '@/components/Skeleton';

export default function ShelfLoading() {
  return (
    <div role="status" aria-busy="true" aria-live="polite" className="w-full space-y-4">
      <SkeletonBlock className="h-4 w-24" />
      <SkeletonBlock className="h-32 w-full rounded-2xl" />
      <SkeletonBlock className="h-9 w-64 rounded-xl" />
      <SkeletonRows count={4} />
    </div>
  );
}
