import { SkeletonBlock, SkeletonBoundary } from '@/components/Skeleton';
import { getDict } from '@/lib/i18n/server';

export default async function CharactersLoading() {
  const t = await getDict();
  return (
    <SkeletonBoundary label={t.common.loading} className="w-full space-y-4" densityScope="characterWorks">
      <SkeletonBlock className="h-11 w-24 md:hidden" />
      <header className="rounded-2xl border border-border bg-bg-card p-4 sm:p-6" data-characters-browser-skeleton>
        <SkeletonBlock className="h-7 w-48" />
        <SkeletonBlock className="mt-2 h-4 w-72 max-w-full" />
        <div className="mt-4 flex flex-wrap gap-2">
          <SkeletonBlock className="h-11 min-w-[140px] flex-1 rounded-md sm:min-w-[200px]" />
          <SkeletonBlock className="h-11 w-24 rounded-md" />
          <SkeletonBlock className="h-11 w-20 rounded-md" />
        </div>
        <div className="mt-3 flex flex-wrap gap-1 rounded-md border border-border bg-bg-elev/30 p-1">
          {Array.from({ length: 3 }).map((_, index) => (
            <SkeletonBlock key={index} className="h-11 w-24 rounded-md can-hover:sm:h-7" />
          ))}
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="space-y-2">
              <SkeletonBlock className="h-3 w-20" />
              <div className="flex flex-wrap gap-1">
                {Array.from({ length: index === 3 ? 2 : 5 }).map((__, chipIndex) => (
                  <SkeletonBlock key={chipIndex} className="h-11 w-16 rounded-md can-hover:sm:h-7" />
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="rounded-md border border-border bg-bg-elev/30 p-2">
              <SkeletonBlock className="h-3 w-16" />
              <div className="mt-2 grid grid-cols-2 gap-1">
                <SkeletonBlock className="h-10 w-full rounded-md" />
                <SkeletonBlock className="h-10 w-full rounded-md" />
              </div>
            </div>
          ))}
        </div>
      </header>
      <div
        className="grid gap-3"
        style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, var(--card-density-px, 220px)), 1fr))' }}
      >
        {Array.from({ length: 12 }).map((_, index) => (
          <div key={index} className="rounded-lg border border-border bg-bg-elev/40 p-2">
            <SkeletonBlock className="aspect-[3/4] w-full rounded" />
            <SkeletonBlock className="mt-2 h-4 w-3/4" />
            <SkeletonBlock className="mt-2 h-3 w-1/2" />
          </div>
        ))}
      </div>
    </SkeletonBoundary>
  );
}
