import { SkeletonBlock, SkeletonRows } from '@/components/Skeleton';

export default function QuotesLoading() {
  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <SkeletonBlock className="h-7 w-48" />
      <SkeletonBlock className="h-24 w-full rounded-2xl" />
      <SkeletonRows count={8} />
    </div>
  );
}
