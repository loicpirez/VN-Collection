import { SkeletonBlock, SkeletonCardGrid } from '@/components/Skeleton';

export default function DumpedLoading() {
  return (
    <div className="w-full space-y-4">
      <SkeletonBlock className="h-4 w-24" />
      <SkeletonBlock className="h-40 w-full rounded-2xl" />
      <SkeletonCardGrid count={9} />
    </div>
  );
}
