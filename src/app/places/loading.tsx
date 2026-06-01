import { SkeletonBlock, SkeletonBoundary, SkeletonCardGrid } from '@/components/Skeleton';
import { getDict } from '@/lib/i18n/server';

export default async function PlacesLoading() {
  const t = await getDict();
  return (
    <SkeletonBoundary label={t.common.loading} className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-2">
          <SkeletonBlock className="h-8 w-48" />
          <SkeletonBlock className="h-4 w-72 max-w-full" />
        </div>
        <SkeletonBlock className="h-10 w-36" />
      </div>
      <SkeletonBlock className="h-10 w-full" />
      <SkeletonCardGrid count={8} />
    </SkeletonBoundary>
  );
}
