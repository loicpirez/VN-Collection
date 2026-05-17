import { SkeletonBlock, SkeletonCardGrid } from '@/components/Skeleton';

export default function TagDetailLoading() {
  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <SkeletonBlock className="h-36 w-full rounded-2xl" />
      <SkeletonBlock className="h-10 w-full rounded-xl" />
      <SkeletonCardGrid count={12} />
    </div>
  );
}
