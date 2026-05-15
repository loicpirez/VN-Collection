import { SkeletonBlock, SkeletonRows } from '@/components/Skeleton';

export default function StaffLoading() {
  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <SkeletonBlock className="h-4 w-24" />
      <SkeletonBlock className="h-32 w-full rounded-2xl" />
      <SkeletonRows count={6} withThumb={false} />
    </div>
  );
}
