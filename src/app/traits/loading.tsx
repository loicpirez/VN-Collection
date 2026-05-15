import { SkeletonBlock, SkeletonRows } from '@/components/Skeleton';

export default function TraitsLoading() {
  return (
    <div className="space-y-4">
      <SkeletonBlock className="h-7 w-40" />
      <SkeletonBlock className="h-10 w-full max-w-md" />
      <SkeletonRows count={8} withThumb={false} />
    </div>
  );
}
