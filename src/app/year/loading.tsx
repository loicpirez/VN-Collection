import { SkeletonBlock, SkeletonBoundary } from '@/components/Skeleton';
import { getDict } from '@/lib/i18n/server';

export default async function YearLoading() {
  const t = await getDict();
  return (
    <SkeletonBoundary label={t.common.loading} className="w-full">
      <SkeletonBlock className="mb-4 h-11 w-28 md:hidden" />
      <header className="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-border bg-bg-card p-4 sm:p-6" data-year-header-skeleton>
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <SkeletonBlock className="h-6 w-6 shrink-0" />
            <SkeletonBlock className="h-7 w-48" />
          </div>
          <SkeletonBlock className="h-3 w-72 max-w-full" />
        </div>
        <div className="flex items-center gap-1">
          <SkeletonBlock className="h-11 w-11" />
          <SkeletonBlock className="h-8 w-16" />
          <SkeletonBlock className="h-11 w-11" />
        </div>
      </header>

      <div className="mb-6 grid gap-4 md:grid-cols-3" data-year-stats-skeleton>
        {Array.from({ length: 3 }).map((_, index) => (
          <div key={index} className="rounded-xl border border-border bg-bg-card p-4 sm:p-5">
            <SkeletonBlock className="h-3 w-28" />
            <SkeletonBlock className="mt-2 h-8 w-20" />
          </div>
        ))}
      </div>

      <section className="mb-6 rounded-xl border border-accent/40 bg-accent/5 p-5" data-year-goal-skeleton>
        <div className="flex items-center justify-between gap-3">
          <SkeletonBlock className="h-4 w-56 max-w-full" />
          <SkeletonBlock className="h-3 w-10" />
        </div>
        <SkeletonBlock className="mt-3 h-2 w-full rounded-full" />
      </section>

      <section className="mb-6 rounded-xl border border-border bg-bg-card p-4 sm:p-5" data-year-heatmap-skeleton>
        <SkeletonBlock className="mb-4 h-4 w-40" />
        <div className="grid grid-cols-[repeat(18,minmax(0,1fr))] gap-1 overflow-hidden">
          {Array.from({ length: 108 }).map((_, index) => (
            <SkeletonBlock key={index} className="aspect-square min-w-2 rounded-sm" />
          ))}
        </div>
      </section>

      <section className="mb-6 rounded-xl border border-border bg-bg-card p-4 sm:p-5">
        <SkeletonBlock className="mb-3 h-3 w-28" />
        <div className="flex flex-wrap gap-1.5">
          {Array.from({ length: 10 }).map((_, index) => (
            <SkeletonBlock key={index} className="h-7 w-20" />
          ))}
        </div>
      </section>

      <section className="rounded-xl border border-border bg-bg-card p-4 sm:p-5" data-year-ranking-skeleton>
        <SkeletonBlock className="mb-3 h-3 w-32" />
        <ol className="space-y-2">
          {Array.from({ length: 8 }).map((_, index) => (
            <li key={index} className="flex items-center justify-between gap-3">
              <SkeletonBlock className="h-4 w-2/3" />
              <SkeletonBlock className="h-4 w-10 shrink-0" />
            </li>
          ))}
        </ol>
      </section>
    </SkeletonBoundary>
  );
}
