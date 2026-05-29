import { SkeletonBlock, SkeletonCardGrid, SkeletonBoundary } from '@/components/Skeleton';
import { getDict } from '@/lib/i18n/server';

export default async function TagDetailLoading() {
  const t = await getDict();
  return (
    <SkeletonBoundary label={t.common.loading} className="w-full space-y-6">
      <SkeletonBlock className="h-36 w-full rounded-2xl" />
      <SkeletonBlock className="h-10 w-full rounded-xl" />
      <SkeletonCardGrid count={12} />
    </SkeletonBoundary>
  );
}
