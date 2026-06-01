import { SkeletonBlock, SkeletonBoundary, SkeletonRows } from '@/components/Skeleton';
import { getDict } from '@/lib/i18n/server';

export default async function AliceNetKobeLoading() {
  const t = await getDict();
  return (
    <SkeletonBoundary label={t.common.loading} className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-2">
          <SkeletonBlock className="h-8 w-64" />
          <SkeletonBlock className="h-4 w-96 max-w-full" />
        </div>
        <SkeletonBlock className="h-10 w-40" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <SkeletonBlock key={index} className="h-20 w-full" />
        ))}
      </div>
      <SkeletonRows count={8} />
    </SkeletonBoundary>
  );
}
