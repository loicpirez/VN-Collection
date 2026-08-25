import { SkeletonBlock, SkeletonBoundary } from '@/components/Skeleton';
import { getDict } from '@/lib/i18n/server';

export default async function PlacesLoading() {
  const t = await getDict();
  return (
    <SkeletonBoundary label={t.common.loading} className="mx-auto max-w-7xl space-y-5 px-4 py-8 sm:px-6 lg:px-8" densityScope="places">
      <div className="flex items-center gap-3">
        <SkeletonBlock className="h-5 w-5" />
        <SkeletonBlock className="h-7 w-48" />
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6" data-place-stats-skeleton>
        {Array.from({ length: 6 }).map((_, index) => (
          <div key={index} className="rounded-xl border border-border bg-bg-card p-4 text-center">
            <SkeletonBlock className="mx-auto mb-3 h-3 w-20" />
            <SkeletonBlock className="mx-auto h-8 w-14" />
            <SkeletonBlock className="mx-auto mt-3 h-2.5 w-full" />
          </div>
        ))}
      </div>

      <section className="rounded-xl border border-border bg-bg-card p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-2">
            {Array.from({ length: 4 }).map((_, index) => (
              <SkeletonBlock key={index} className="h-11 w-24" />
            ))}
          </div>
          <SkeletonBlock className="h-11 w-36" />
        </div>
        <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(16rem,1fr)_12rem_auto] lg:items-end">
          <SkeletonBlock className="h-11 w-full" />
          <SkeletonBlock className="h-11 w-full" />
          <SkeletonBlock className="h-11 w-28" />
        </div>
      </section>

      <ul className="grid gap-3" data-place-rows-skeleton>
        {Array.from({ length: 6 }).map((_, index) => (
          <li key={index} className="rounded-xl border border-border bg-bg-card p-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1 space-y-2">
                <SkeletonBlock className="h-4 w-48 max-w-full" />
                <SkeletonBlock className="h-3 w-32 max-w-full" />
                <SkeletonBlock className="h-3 w-72 max-w-full" />
              </div>
              <div className="flex w-full flex-col gap-2 sm:w-auto sm:items-end">
                <div className="flex flex-wrap gap-2 sm:justify-end">
                  <SkeletonBlock className="h-7 w-16 rounded-full" />
                  <SkeletonBlock className="h-7 w-28 rounded-full" />
                  <SkeletonBlock className="h-7 w-20" />
                </div>
                <div className="flex flex-wrap gap-2 sm:justify-end">
                  <SkeletonBlock className="h-11 w-28" />
                  <SkeletonBlock className="h-11 w-11" />
                  <SkeletonBlock className="h-11 w-11" />
                </div>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </SkeletonBoundary>
  );
}
