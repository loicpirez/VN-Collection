import { SkeletonBlock, SkeletonCardGrid, SkeletonBoundary } from '@/components/Skeleton';
import { getDict } from '@/lib/i18n/server';

export default async function HomeLoading() {
  const t = await getDict();
  return (
    <SkeletonBoundary label={t.app.loading} className="space-y-6">
      <SkeletonBlock className="h-9 w-64" />
      <SkeletonBlock className="h-10 w-full rounded-xl" />
      <SkeletonCardGrid count={18} />
    </SkeletonBoundary>
  );
}
