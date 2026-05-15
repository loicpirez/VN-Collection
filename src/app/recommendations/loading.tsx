import { SkeletonBlock, SkeletonCardGrid } from '@/components/Skeleton';

export default function RecommendationsLoading() {
  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <SkeletonBlock className="h-7 w-56" />
      <SkeletonBlock className="h-20 w-full rounded-2xl" />
      <SkeletonCardGrid count={12} />
    </div>
  );
}
