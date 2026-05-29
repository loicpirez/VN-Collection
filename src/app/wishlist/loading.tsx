import { SkeletonCardGrid, SkeletonBoundary } from '@/components/Skeleton';
import { getDict } from '@/lib/i18n/server';

export default async function Loading() {
  const t = await getDict();
  return (
    <SkeletonBoundary label={t.common.loading}>
      <div className="mb-6 h-10 w-48 animate-pulse rounded-md bg-bg-elev/60" />
      <SkeletonCardGrid count={18} />
    </SkeletonBoundary>
  );
}
