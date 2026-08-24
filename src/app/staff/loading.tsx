import { SkeletonBlock, SkeletonCompactGrid, SkeletonBoundary } from '@/components/Skeleton';
import { getDict } from '@/lib/i18n/server';

export default async function StaffLoading() {
  const t = await getDict();
  return (
    <SkeletonBoundary label={t.common.loading} className="w-full space-y-4">
      <SkeletonBlock className="h-5 w-24 md:hidden" />
      <SkeletonBlock className="h-64 w-full rounded-2xl" />
      <SkeletonCompactGrid count={10} />
    </SkeletonBoundary>
  );
}
