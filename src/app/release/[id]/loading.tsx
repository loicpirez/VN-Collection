import { SkeletonBlock, SkeletonBoundary, SkeletonRows } from '@/components/Skeleton';
import { getDict } from '@/lib/i18n/server';

export default async function ReleaseLoading() {
  const t = await getDict();
  return (
    <SkeletonBoundary label={t.app.loading} className="space-y-4">
      <SkeletonBlock className="h-5 w-28 md:hidden" />
      <div className="rounded-2xl border border-border bg-bg-card p-4 sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 space-y-2">
            <SkeletonBlock className="h-8 w-2/3" />
            <SkeletonBlock className="h-4 w-1/3" />
          </div>
          <SkeletonBlock className="h-10 w-24" />
        </div>
        <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-3">
          {Array.from({ length: 9 }).map((_, index) => (
            <div key={index} className="space-y-1.5">
              <SkeletonBlock className="h-2.5 w-16" />
              <SkeletonBlock className="h-4 w-24 max-w-full" />
            </div>
          ))}
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <SkeletonBlock className="h-6 w-20" />
          <SkeletonBlock className="h-6 w-24" />
          <SkeletonBlock className="h-6 w-16" />
        </div>
      </div>
      <div className="rounded-2xl border border-border bg-bg-card p-4 sm:p-6">
        <SkeletonBlock className="mb-3 h-3 w-40" />
        <SkeletonRows count={2} withThumb={false} />
      </div>
      <div className="rounded-2xl border border-border bg-bg-card p-4 sm:p-6">
        <SkeletonBlock className="mb-3 h-3 w-24" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {Array.from({ length: 5 }).map((_, index) => (
            <SkeletonBlock key={index} className="aspect-[2/3] w-full rounded-lg" />
          ))}
        </div>
      </div>
    </SkeletonBoundary>
  );
}
