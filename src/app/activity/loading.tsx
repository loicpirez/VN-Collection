import { SkeletonBlock, SkeletonRows } from '@/components/Skeleton';

export default function ActivityLoading() {
  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <SkeletonBlock className="h-32 w-full rounded-2xl" />
      <SkeletonRows count={10} withThumb={false} />
    </div>
  );
}
