import { SkeletonBlock, SkeletonBoundary } from '@/components/Skeleton';
import { getDict } from '@/lib/i18n/server';

export default async function MapLoading() {
  const t = await getDict();
  return (
    <SkeletonBoundary label={t.common.loading} className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-2">
          <SkeletonBlock className="h-8 w-48" />
          <SkeletonBlock className="h-4 w-80 max-w-full" />
        </div>
        <SkeletonBlock className="h-10 w-36" />
      </div>
      <SkeletonBlock className="h-10 w-full" />
      <SkeletonBlock className="h-[55vh] min-h-[400px] w-full rounded-xl" />
    </SkeletonBoundary>
  );
}
