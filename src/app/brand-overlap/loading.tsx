import { SkeletonBlock, SkeletonBoundary } from '@/components/Skeleton';
import { getDict } from '@/lib/i18n/server';

export default async function Loading() {
  const t = await getDict();
  return (
    <SkeletonBoundary label={t.common.loading} className="w-full">
      <SkeletonBlock className="mb-4 h-11 w-28 md:hidden" />
      <header className="mb-6 rounded-2xl border border-border bg-bg-card p-4 sm:p-6" data-brand-overlap-header-skeleton>
        <div className="flex items-center gap-2">
          <SkeletonBlock className="h-6 w-6 shrink-0" />
          <SkeletonBlock className="h-7 w-56 max-w-full" />
        </div>
        <SkeletonBlock className="mt-3 h-3 w-96 max-w-full" />
        <div className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_auto] sm:items-end">
          <SkeletonBlock className="h-11 w-full" />
          <SkeletonBlock className="hidden h-5 w-5 sm:block" />
          <SkeletonBlock className="h-11 w-full" />
          <SkeletonBlock className="h-11 w-28" />
        </div>
      </header>

      <section className="rounded-2xl border border-border bg-bg-card p-4 sm:p-6" data-brand-overlap-results-skeleton>
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <SkeletonBlock className="h-4 w-40" />
          <SkeletonBlock className="h-4 w-4" />
          <SkeletonBlock className="h-4 w-40" />
          <SkeletonBlock className="ml-auto h-3 w-20" />
        </div>
        <ul className="space-y-2">
          {Array.from({ length: 6 }).map((_, index) => (
            <li key={index} className="rounded-lg border border-border bg-bg-elev/30 p-3">
              <div className="flex items-center justify-between gap-2">
                <SkeletonBlock className="h-4 w-44 max-w-full" />
                <SkeletonBlock className="h-3 w-12" />
              </div>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {Array.from({ length: 2 }).map((_, columnIndex) => (
                  <div key={columnIndex} className="space-y-2">
                    <SkeletonBlock className="h-3 w-28" />
                    {Array.from({ length: 3 }).map((_, rowIndex) => (
                      <SkeletonBlock key={rowIndex} className="h-3 w-4/5" />
                    ))}
                  </div>
                ))}
              </div>
            </li>
          ))}
        </ul>
      </section>
    </SkeletonBoundary>
  );
}
