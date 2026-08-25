import { SkeletonBlock, SkeletonBoundary } from '@/components/Skeleton';
import { getDict } from '@/lib/i18n/server';

export default async function CharacterLoading() {
  const t = await getDict();
  return (
    <SkeletonBoundary label={t.common.loading} className="w-full">
      <SkeletonBlock className="mb-4 h-11 w-28 md:hidden" />
      <div className="grid gap-4 rounded-2xl border border-border bg-bg-card p-4 sm:gap-6 sm:p-6 md:grid-cols-[200px_1fr] md:gap-8">
        <SkeletonBlock className="aspect-[2/3] w-full rounded-xl" />
        <div className="min-w-0">
          <SkeletonBlock className="h-8 w-3/4 max-w-full" />
          <SkeletonBlock className="mt-2 h-4 w-1/2" />
          <SkeletonBlock className="mt-2 h-3 w-2/3" />
          <div className="mt-4 grid grid-cols-2 gap-x-3 gap-y-3 sm:grid-cols-3">
            {Array.from({ length: 6 }).map((_, index) => (
              <div key={index} className="space-y-1.5">
                <SkeletonBlock className="h-2.5 w-16" />
                <SkeletonBlock className="h-4 w-24 max-w-full" />
              </div>
            ))}
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <SkeletonBlock className="h-11 w-24" />
            <SkeletonBlock className="h-11 w-36" />
          </div>
        </div>
      </div>

      <section className="mt-6 rounded-xl border border-border bg-bg-card p-4 sm:p-6">
        <SkeletonBlock className="h-4 w-40" />
        <div className="mt-4 space-y-2">
          <SkeletonBlock className="h-3 w-full" />
          <SkeletonBlock className="h-3 w-5/6" />
          <SkeletonBlock className="h-3 w-2/3" />
        </div>
      </section>

      <section className="mt-6 rounded-xl border border-border bg-bg-card p-4 sm:p-6">
        <SkeletonBlock className="mb-3 h-4 w-44" />
        <ul
          className="grid gap-3"
          data-character-credit-grid-skeleton
          style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, var(--card-density-px, 220px)), 1fr))' }}
        >
          {Array.from({ length: 8 }).map((_, index) => (
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
                <div className="mt-3 flex gap-2">
                  <SkeletonBlock className="h-5 w-12" />
                  <SkeletonBlock className="h-5 w-16" />
                </div>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </SkeletonBoundary>
  );
}
