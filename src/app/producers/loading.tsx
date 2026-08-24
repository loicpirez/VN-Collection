import { SkeletonBlock, SkeletonBoundary, SkeletonRows, SkeletonTable } from '@/components/Skeleton';
import { getDict } from '@/lib/i18n/server';

export default async function ProducersLoading() {
  const t = await getDict();
  return (
    <SkeletonBoundary label={t.common.loading} className="w-full space-y-4">
      <div className="flex items-center gap-3">
        <SkeletonBlock className="h-7 w-7 rounded-full" />
        <div className="flex-1 space-y-2">
          <SkeletonBlock className="h-7 w-48" />
          <SkeletonBlock className="h-4 w-64 max-w-full" />
        </div>
      </div>
      <SkeletonBlock className="h-10 w-full max-w-md rounded-xl" />
      <div className="sm:hidden"><SkeletonRows count={8} /></div>
      <div className="hidden sm:block"><SkeletonTable rows={10} cols={5} /></div>
    </SkeletonBoundary>
  );
}
