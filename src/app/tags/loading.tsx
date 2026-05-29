import { SkeletonBlock, SkeletonRows } from '@/components/Skeleton';

export default function TagsLoading() {
  return (
    <div role="status" aria-busy="true" aria-live="polite" className="space-y-4">
      <SkeletonBlock className="h-7 w-40" />
      <SkeletonBlock className="h-10 w-full max-w-md" />
      <SkeletonRows count={8} withThumb={false} />
    </div>
  );
}
