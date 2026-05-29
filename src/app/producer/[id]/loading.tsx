import { SkeletonCardGrid, SkeletonBoundary } from '@/components/Skeleton';
import { getDict } from '@/lib/i18n/server';

export default async function Loading() {
  const t = await getDict();
  return (
    <SkeletonBoundary label={t.common.loading}>
      <div className="mb-6 h-32 animate-pulse rounded-2xl bg-bg-card" />
      <SkeletonCardGrid count={12} />
    </SkeletonBoundary>
  );
}
