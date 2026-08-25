import { SkeletonBlock, SkeletonBoundary } from '@/components/Skeleton';
import { getDict } from '@/lib/i18n/server';

export default async function Loading() {
  const t = await getDict();
  return (
    <SkeletonBoundary label={t.common.loading} className="space-y-6" densityScope="lists">
      <SkeletonBlock className="h-11 w-36 rounded-md md:hidden" />
      <header className="overflow-hidden rounded-2xl border border-border bg-bg-card p-5" data-list-detail-skeleton>
        <div className="flex items-start gap-4">
          <SkeletonBlock className="h-12 w-12 shrink-0 rounded-xl" />
          <div className="min-w-0 flex-1 space-y-2">
            <SkeletonBlock className="h-7 w-52 max-w-full" />
            <SkeletonBlock className="h-4 w-4/5" />
            <SkeletonBlock className="h-3 w-16" />
          </div>
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
            <SkeletonBlock className="hidden h-11 w-36 rounded-md sm:block" />
            {Array.from({ length: 3 }).map((_, index) => (
              <SkeletonBlock key={index} className="h-11 w-11 rounded-md" />
            ))}
          </div>
        </div>
      </header>
      <section className="rounded-xl border border-border bg-bg-card p-4 sm:p-6" data-list-add-skeleton>
        <div className="flex flex-wrap items-center gap-2">
          <SkeletonBlock className="h-11 min-w-[140px] flex-1 rounded-md sm:min-w-[180px]" />
          <SkeletonBlock className="h-11 w-28 rounded-md" />
        </div>
      </section>
      <ul
        className="grid gap-5"
        data-list-items-skeleton
        style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, var(--card-density-px, 220px)), 1fr))' }}
      >
        {Array.from({ length: 12 }).map((_, index) => (
          <li key={index} className="relative overflow-hidden rounded-xl border border-border bg-bg-card">
            <SkeletonBlock className="aspect-[2/3] w-full rounded-none" />
            <div className="space-y-2 p-3">
              <SkeletonBlock className="h-3 w-3/4" />
              <SkeletonBlock className="h-2.5 w-1/2" />
            </div>
            <SkeletonBlock className="absolute right-2 top-2 h-11 w-11 rounded-md" />
          </li>
        ))}
      </ul>
    </SkeletonBoundary>
  );
}
