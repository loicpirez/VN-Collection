import { SkeletonBlock, SkeletonBoundary } from '@/components/Skeleton';
import { getDict } from '@/lib/i18n/server';

export default async function ListsLoading() {
  const t = await getDict();
  return (
    <SkeletonBoundary label={t.common.loading} className="space-y-4">
      <div className="flex items-center gap-3">
        <SkeletonBlock className="h-7 w-7 rounded-full" />
        <div className="flex-1 space-y-2">
          <SkeletonBlock className="h-7 w-40" />
          <SkeletonBlock className="h-4 w-72 max-w-full" />
        </div>
      </div>
      <section className="rounded-xl border border-border bg-bg-card p-4 sm:p-6" data-lists-create-skeleton>
        <div className="flex flex-wrap items-start gap-2">
          <SkeletonBlock className="h-11 min-w-[140px] flex-1 rounded-md sm:min-w-[180px]" />
          <SkeletonBlock className="h-11 min-w-[140px] flex-[2] rounded-md sm:min-w-[180px]" />
          <div className="flex h-11 items-center gap-1 rounded-md border border-border bg-bg-elev/30 p-1">
            {Array.from({ length: 7 }).map((_, index) => (
              <SkeletonBlock key={index} className="h-6 w-6 rounded" />
            ))}
          </div>
          <SkeletonBlock className="h-11 w-28 rounded-md" />
        </div>
      </section>
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" data-lists-grid-skeleton>
        {Array.from({ length: 6 }).map((_, index) => (
          <li key={index} className="relative min-h-[112px] rounded-xl border border-border bg-bg-card p-4">
            <div className="mb-1 flex items-center gap-2 pr-10">
              <SkeletonBlock className="h-8 w-8 shrink-0 rounded-md" />
              <SkeletonBlock className="h-4 w-2/3" />
            </div>
            <SkeletonBlock className="mt-2 h-3 w-4/5" />
            <SkeletonBlock className="mt-1.5 h-3 w-3/5" />
            <SkeletonBlock className="mt-3 h-3 w-16" />
            <SkeletonBlock className="absolute right-2 top-2 h-11 w-11 rounded-md" />
          </li>
        ))}
      </ul>
    </SkeletonBoundary>
  );
}
