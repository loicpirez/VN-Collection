import { SkeletonBlock, SkeletonCardGrid, SkeletonBoundary } from '@/components/Skeleton';
import { getDict } from '@/lib/i18n/server';

export default async function SimilarLoading() {
  const t = await getDict();
  return (
    <SkeletonBoundary label={t.common.loading} className="w-full space-y-4">
      <SkeletonBlock className="h-7 w-48" />
      <SkeletonBlock className="h-20 w-full rounded-2xl" />
      <SkeletonCardGrid count={12} />
    </SkeletonBoundary>
  );
}
