import { SkeletonBlock, SkeletonRows } from '@/components/Skeleton';

export default function SchemaLoading() {
  return (
    <div className="w-full space-y-4">
      <SkeletonBlock className="h-4 w-24" />
      <SkeletonBlock className="h-24 w-full rounded-2xl" />
      <SkeletonBlock className="h-9 w-full rounded-lg" />
      <SkeletonRows count={6} withThumb={false} />
    </div>
  );
}
