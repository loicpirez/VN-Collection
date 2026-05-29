import { SkeletonBlock, SkeletonRows } from '@/components/Skeleton';

export default function ListsLoading() {
  return (
    <div role="status" aria-busy="true" aria-live="polite" className="space-y-4">
      <SkeletonBlock className="h-7 w-40" />
      <SkeletonBlock className="h-32 w-full" />
      <SkeletonRows count={5} withThumb={false} />
    </div>
  );
}
