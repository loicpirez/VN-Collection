import { SkeletonBlock } from '@/components/Skeleton';

export default function ReleaseLoading() {
  return (
    <div className="space-y-4">
      <SkeletonBlock className="h-6 w-32" />
      <SkeletonBlock className="h-9 w-2/3" />
      <SkeletonBlock className="h-5 w-1/3" />
      <div className="grid gap-3 sm:grid-cols-2">
        <SkeletonBlock className="h-24" />
        <SkeletonBlock className="h-24" />
        <SkeletonBlock className="h-24" />
        <SkeletonBlock className="h-24" />
      </div>
    </div>
  );
}
