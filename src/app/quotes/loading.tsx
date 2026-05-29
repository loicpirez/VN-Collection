import { SkeletonBlock, SkeletonRows, SkeletonBoundary } from '@/components/Skeleton';
import { getDict } from '@/lib/i18n/server';

export default async function QuotesLoading() {
  const t = await getDict();
  return (
    <SkeletonBoundary label={t.common.loading} className="w-full space-y-4">
      <SkeletonBlock className="h-7 w-48" />
      <SkeletonBlock className="h-24 w-full rounded-2xl" />
      <SkeletonRows count={8} />
    </SkeletonBoundary>
  );
}
