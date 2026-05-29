import { SkeletonRows, SkeletonBoundary } from '@/components/Skeleton';
import { getDict } from '@/lib/i18n/server';

export default async function Loading() {
  const t = await getDict();
  return (
    <SkeletonBoundary label={t.common.loading} className="w-full">
      <div className="mb-6 h-32 animate-pulse rounded-2xl bg-bg-card" />
      <SkeletonRows count={6} />
    </SkeletonBoundary>
  );
}
