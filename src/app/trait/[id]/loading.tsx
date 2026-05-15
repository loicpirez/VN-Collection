import { SkeletonBlock, SkeletonRows } from '@/components/Skeleton';

export default function TraitLoading() {
  return (
    <div className="space-y-4">
      <SkeletonBlock className="h-6 w-32" />
      <SkeletonBlock className="h-8 w-3/4" />
      <SkeletonBlock className="h-24 w-full" />
      <SkeletonRows count={6} />
    </div>
  );
}
