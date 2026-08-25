import { SkeletonBlock, SkeletonBoundary } from '@/components/Skeleton';
import { getDict } from '@/lib/i18n/server';

export default async function TraitLoading() {
  const t = await getDict();
  return (
    <SkeletonBoundary label={t.common.loading} className="w-full" densityScope="characterWorks">
      <SkeletonBlock className="mb-4 h-11 w-28 md:hidden" />

      <header
        className="mb-6 rounded-2xl border border-border bg-bg-card p-4 sm:p-6"
        data-trait-detail-skeleton
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <SkeletonBlock className="h-6 w-6 shrink-0" />
              <SkeletonBlock className="h-7 w-64 max-w-[calc(100%-2rem)]" />
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <SkeletonBlock className="h-4 w-28" />
              <SkeletonBlock className="h-4 w-36" />
              <SkeletonBlock className="h-5 w-12" />
            </div>
            <div className="mt-4 space-y-2">
              <SkeletonBlock className="h-3 w-full" />
              <SkeletonBlock className="h-3 w-5/6" />
            </div>
          </div>
          <div className="flex w-full min-w-0 flex-col gap-2 sm:w-auto sm:shrink-0 sm:flex-row">
            <SkeletonBlock className="h-[54px] w-full sm:w-[320px]" />
            <SkeletonBlock className="h-11 w-full sm:w-24" />
          </div>
        </div>
      </header>

      <section className="rounded-xl border border-border bg-bg-card p-4 sm:p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <SkeletonBlock className="h-4 w-44" />
          <div className="inline-flex gap-1 rounded-md border border-border bg-bg-elev/30 p-0.5">
            <SkeletonBlock className="h-11 w-20 can-hover:sm:h-8" />
            <SkeletonBlock className="h-11 w-28 can-hover:sm:h-8" />
          </div>
        </div>
        <ul
          className="grid gap-3"
          data-trait-character-grid-skeleton
          style={{
            gridTemplateColumns:
              'repeat(auto-fill, minmax(min(100%, var(--card-density-px, 220px)), 1fr))',
          }}
        >
          {Array.from({ length: 10 }).map((_, index) => (
            <li key={index} className="flex gap-3 rounded-lg border border-border bg-bg-elev/40 p-2">
              <SkeletonBlock
                className="shrink-0 rounded"
                style={{
                  width: 'clamp(64px, calc(var(--card-density-px, 220px) * 0.32), 160px)',
                  aspectRatio: '2 / 3',
                }}
              />
              <div className="min-w-0 flex-1 py-1">
                <SkeletonBlock className="h-4 w-4/5" />
                <SkeletonBlock className="mt-2 h-3 w-3/5" />
                <SkeletonBlock className="mt-3 h-3 w-2/3" />
              </div>
            </li>
          ))}
        </ul>
      </section>
    </SkeletonBoundary>
  );
}
