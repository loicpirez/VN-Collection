import { SkeletonBlock, SkeletonBoundary, SkeletonRows } from '@/components/Skeleton';
import { getDict } from '@/lib/i18n/server';

export default async function PlaceDetailLoading() {
  const t = await getDict();
  return (
    <SkeletonBoundary label={t.common.loading} className="space-y-4">
      <SkeletonBlock className="h-5 w-28" />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-2">
          <SkeletonBlock className="h-8 w-56" />
          <SkeletonBlock className="h-4 w-80 max-w-full" />
        </div>
        <SkeletonBlock className="h-10 w-40" />
      </div>
      <SkeletonBlock className="h-28 w-full" />
      <SkeletonRows count={6} />
    </SkeletonBoundary>
  );
}
