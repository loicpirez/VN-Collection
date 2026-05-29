import { SkeletonBlock, SkeletonRows, SkeletonBoundary } from '@/components/Skeleton';
import { getDict } from '@/lib/i18n/server';

export default async function TraitLoading() {
  const t = await getDict();
  return (
    <SkeletonBoundary label={t.common.loading} className="space-y-4">
      <SkeletonBlock className="h-6 w-32" />
      <SkeletonBlock className="h-8 w-3/4" />
      <SkeletonBlock className="h-24 w-full" />
      <SkeletonRows count={6} />
    </SkeletonBoundary>
  );
}
