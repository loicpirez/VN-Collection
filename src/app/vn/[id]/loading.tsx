import { SkeletonBlock, SkeletonBoundary, SkeletonRows, SkeletonText } from '@/components/Skeleton';
import { getDict } from '@/lib/i18n/server';

export default async function Loading() {
  const t = await getDict();
  return (
    <SkeletonBoundary label={t.app.loading} className="w-full space-y-4">
      <SkeletonBlock className="h-5 w-24 md:hidden" />
      <div className="relative rounded-2xl border border-border bg-bg-card shadow-card">
        <SkeletonBlock className="h-64 w-full rounded-b-none rounded-t-2xl" />

        <div className="relative -mt-44 grid grid-cols-1 gap-4 px-3 pb-4 sm:gap-6 sm:px-6 sm:pb-6 md:grid-cols-[260px_1fr] md:gap-8 md:px-8 md:pb-8">
          <SkeletonBlock className="mx-auto aspect-[2/3] w-full max-w-[260px] rounded-xl md:mx-0" />
          <div className="min-w-0 space-y-4 pt-6 md:pt-44">
            <div className="space-y-2">
              <SkeletonBlock className="h-8 w-3/4 max-w-xl" />
              <SkeletonBlock className="h-3 w-2/5 max-w-sm" />
            </div>
            <div className="grid grid-cols-3 gap-2 sm:max-w-xl">
              <SkeletonBlock className="h-14 w-full" />
              <SkeletonBlock className="h-14 w-full" />
              <SkeletonBlock className="h-14 w-full" />
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {Array.from({ length: 6 }).map((_, index) => (
                <div key={index} className="space-y-1.5">
                  <SkeletonBlock className="h-2.5 w-16" />
                  <SkeletonBlock className="h-4 w-24 max-w-full" />
                </div>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              <SkeletonBlock className="h-9 w-28" />
              <SkeletonBlock className="h-9 w-32" />
              <SkeletonBlock className="h-9 w-24" />
            </div>
          </div>
        </div>

        <div className="border-t border-border px-3 py-4 sm:px-6 sm:py-6 md:px-8">
          <SkeletonBlock className="mb-3 h-3 w-24" />
          <SkeletonText lines={5} />
        </div>

        <div className="border-t border-border px-3 py-4 sm:px-6 sm:py-6 md:px-8">
          <SkeletonBlock className="mb-3 h-3 w-20" />
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
            {Array.from({ length: 5 }).map((_, index) => (
              <SkeletonBlock key={index} className="aspect-[2/3] w-full rounded-lg" />
            ))}
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-border bg-bg-card p-4 sm:p-6">
        <SkeletonBlock className="mb-4 h-4 w-36" />
        <SkeletonRows count={3} withThumb={false} />
      </div>
    </SkeletonBoundary>
  );
}
