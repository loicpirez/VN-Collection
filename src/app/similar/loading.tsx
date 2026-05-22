import { SkeletonBlock, SkeletonCardGrid } from '@/components/Skeleton';

export default function SimilarLoading() {
  return (
    <div className="w-full space-y-4">
      <SkeletonBlock className="h-7 w-48" />
      <SkeletonBlock className="h-20 w-full rounded-2xl" />
      <SkeletonCardGrid count={12} />
    </div>
  );
}
