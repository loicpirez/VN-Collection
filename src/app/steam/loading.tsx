import { SkeletonCardGrid, SkeletonBoundary } from '@/components/Skeleton';
import { getDict } from '@/lib/i18n/server';

export default async function Loading() {
  const t = await getDict();
  return (
    <SkeletonBoundary label={t.common.loading} className="space-y-4">
      <div className="h-7 w-48 animate-pulse rounded bg-bg-elev/60" />
      <div className="h-4 w-2/3 animate-pulse rounded bg-bg-elev/40" />
      <SkeletonCardGrid />
    </SkeletonBoundary>
  );
}
