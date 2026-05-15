import { SkeletonBlock, SkeletonCardGrid } from '@/components/Skeleton';

export default function HomeLoading() {
  return (
    <div className="space-y-6">
      <SkeletonBlock className="h-9 w-64" />
      <SkeletonBlock className="h-10 w-full rounded-xl" />
      <SkeletonCardGrid count={18} />
    </div>
  );
}
