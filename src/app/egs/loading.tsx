import { SkeletonBlock, SkeletonCardGrid } from '@/components/Skeleton';

export default function EgsLoading() {
  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <SkeletonBlock className="h-4 w-24" />
      <SkeletonBlock className="h-28 w-full rounded-2xl" />
      <SkeletonBlock className="h-40 w-full rounded-2xl" />
      <SkeletonCardGrid count={9} />
    </div>
  );
}
