import { SkeletonBlock, SkeletonRows } from '@/components/Skeleton';

export default function ProducersLoading() {
  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <SkeletonBlock className="h-7 w-48" />
      <SkeletonBlock className="h-9 w-64 rounded-xl" />
      <SkeletonRows count={10} />
    </div>
  );
}
