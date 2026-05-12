import { SkeletonBlock, SkeletonText } from '@/components/Skeleton';

export default function Loading() {
  return (
    <div>
      <SkeletonBlock className="mb-6 h-40 w-full rounded-2xl" />
      <div className="grid gap-6 md:grid-cols-[180px_1fr]">
        <SkeletonBlock className="aspect-[2/3] w-full rounded-xl" />
        <div className="space-y-4">
          <SkeletonBlock className="h-8 w-2/3" />
          <SkeletonBlock className="h-4 w-1/3" />
          <SkeletonText lines={6} />
        </div>
      </div>
    </div>
  );
}
