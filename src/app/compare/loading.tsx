import { SkeletonBlock, SkeletonBoundary } from '@/components/Skeleton';
import { getDict } from '@/lib/i18n/server';

export default async function CompareLoading() {
  const t = await getDict();
  return (
    <SkeletonBoundary label={t.app.loading} className="w-full space-y-4">
      <SkeletonBlock className="h-11 w-24 md:hidden" />
      <header className="rounded-2xl border border-border bg-bg-card p-4 sm:p-6" data-compare-picker-skeleton>
        <SkeletonBlock className="h-7 w-44" />
        <div className="mt-4 flex flex-wrap gap-2">
          <SkeletonBlock className="h-11 min-w-[160px] flex-1 rounded-md" />
          <SkeletonBlock className="h-11 w-24 rounded-md" />
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <SkeletonBlock className="h-11 w-36 rounded-md" />
          <SkeletonBlock className="h-11 w-40 rounded-md" />
        </div>
      </header>

      <section className="rounded-2xl border border-accent/40 bg-accent/5 p-4 sm:p-6" data-compare-common-skeleton>
        <div className="flex items-center justify-between gap-2">
          <SkeletonBlock className="h-4 w-36" />
          <SkeletonBlock className="h-3 w-20" />
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="space-y-2 rounded-md border border-border/60 p-3">
              <SkeletonBlock className="h-3 w-24" />
              <div className="flex flex-wrap gap-1">
                <SkeletonBlock className="h-5 w-16 rounded-md" />
                <SkeletonBlock className="h-5 w-20 rounded-md" />
              </div>
            </div>
          ))}
        </div>
      </section>

      <ul className="grid gap-4 md:hidden" data-compare-mobile-skeleton>
        {Array.from({ length: 2 }).map((_, itemIndex) => (
          <li key={itemIndex} className="overflow-hidden rounded-lg border border-border bg-bg-card">
            <div className="flex gap-4 border-b border-border p-4">
              <SkeletonBlock className="aspect-[2/3] w-20 shrink-0 rounded" />
              <div className="min-w-0 flex-1 space-y-2 self-center">
                <SkeletonBlock className="h-4 w-4/5" />
                <SkeletonBlock className="h-3 w-3/5" />
              </div>
            </div>
            <div className="divide-y divide-border/70">
              {Array.from({ length: 9 }).map((__, rowIndex) => (
                <div key={rowIndex} className="grid min-h-[44px] grid-cols-[minmax(6.5rem,0.7fr)_minmax(0,1.3fr)] items-center gap-3 px-4 py-3">
                  <SkeletonBlock className="h-3 w-20" />
                  <SkeletonBlock className="h-3 w-full" />
                </div>
              ))}
            </div>
          </li>
        ))}
      </ul>

      <div className="hidden overflow-hidden rounded-xl border border-border bg-bg-card md:block" data-compare-desktop-skeleton>
        <div className="grid grid-cols-[180px_repeat(2,minmax(220px,1fr))] gap-px bg-border">
          <SkeletonBlock className="h-48 w-full rounded-none" />
          {Array.from({ length: 2 }).map((_, index) => (
            <div key={index} className="bg-bg-card p-3">
              <SkeletonBlock className="mx-auto aspect-[2/3] w-full max-w-[140px] rounded" />
              <SkeletonBlock className="mt-2 h-3 w-4/5" />
            </div>
          ))}
          {Array.from({ length: 9 }).flatMap((_, rowIndex) => [
            <div key={`label-${rowIndex}`} className="bg-bg-elev/50 p-3"><SkeletonBlock className="h-3 w-24" /></div>,
            <div key={`left-${rowIndex}`} className="bg-bg-card p-3"><SkeletonBlock className="h-3 w-3/4" /></div>,
            <div key={`right-${rowIndex}`} className="bg-bg-card p-3"><SkeletonBlock className="h-3 w-3/4" /></div>,
          ])}
        </div>
      </div>
    </SkeletonBoundary>
  );
}
