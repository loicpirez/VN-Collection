import { SkeletonBlock, SkeletonRows } from '@/components/Skeleton';

export default function ListsLoading() {
  return (
    <div className="space-y-4">
      <SkeletonBlock className="h-7 w-40" />
      <SkeletonBlock className="h-32 w-full" />
      <SkeletonRows count={5} withThumb={false} />
    </div>
  );
}
