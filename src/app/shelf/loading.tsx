import { SkeletonBlock, SkeletonBoundary } from '@/components/Skeleton';
import { getDict } from '@/lib/i18n/server';

export default async function ShelfLoading() {
  const t = await getDict();
  return (
    <SkeletonBoundary label={t.common.loading} className="w-full space-y-4" densityScope="shelf">
      <SkeletonBlock className="h-11 w-24 md:hidden" />
      <div className="grid gap-4 rounded-2xl border border-border bg-bg-card p-4 sm:p-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start">
        <div className="min-w-0">
          <SkeletonBlock className="h-8 w-48" />
          <SkeletonBlock className="mt-2 h-4 w-72 max-w-full" />
          <div className="mt-3 flex flex-wrap gap-3">
            <SkeletonBlock className="h-4 w-24" />
            <SkeletonBlock className="h-4 w-28" />
            <SkeletonBlock className="h-4 w-20" />
          </div>
        </div>
        <div className="flex min-w-0 flex-wrap gap-2 lg:justify-end">
          <SkeletonBlock className="h-[54px] w-full sm:w-56" />
          <SkeletonBlock className="h-11 w-44" />
        </div>
      </div>
      <SkeletonBlock className="h-11 w-full max-w-xl rounded-xl" />
      <div className="rounded-xl border border-border bg-bg-card p-3 sm:p-5">
        <div className="mb-3 flex items-center justify-between gap-3">
          <SkeletonBlock className="h-6 w-36" />
          <SkeletonBlock className="h-9 w-28" />
        </div>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-8">
          {Array.from({ length: 16 }).map((_, index) => (
            <SkeletonBlock key={index} className="aspect-[2/3] w-full rounded-sm" />
          ))}
        </div>
        <SkeletonBlock className="mt-3 h-3 w-full rounded-none" />
      </div>
    </SkeletonBoundary>
  );
}
