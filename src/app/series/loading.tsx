import { SkeletonBlock, SkeletonRows } from '@/components/Skeleton';

export default function SeriesLoading() {
  return (
    <div className="space-y-4">
      <SkeletonBlock className="h-7 w-48" />
      <SkeletonBlock className="h-40 w-full" />
      <SkeletonRows count={4} withThumb={false} />
    </div>
  );
}
