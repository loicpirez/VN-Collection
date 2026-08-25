import { SkeletonBlock, SkeletonBoundary } from '@/components/Skeleton';
import { getDict } from '@/lib/i18n/server';

export default async function Loading() {
  const t = await getDict();
  return (
    <SkeletonBoundary label={t.common.loading} className="w-full">
      <SkeletonBlock className="mb-4 h-11 w-28 md:hidden" />
      <header className="mb-6 rounded-2xl border border-border bg-bg-card p-4 sm:p-6" data-steam-header-skeleton>
        <div className="flex items-center gap-2">
          <SkeletonBlock className="h-6 w-6 shrink-0" />
          <SkeletonBlock className="h-7 w-44" />
        </div>
        <SkeletonBlock className="mt-3 h-3 w-96 max-w-full" />
      </header>

      <SteamRowsSection marker="suggestions" rows={5} />

      <section className="mb-8 rounded-xl border border-border bg-bg-card p-4 sm:p-5" data-steam-section-skeleton="links">
        <SkeletonBlock className="mb-3 h-3 w-32" />
        <div className="grid gap-1.5 sm:grid-cols-2">
          {Array.from({ length: 6 }).map((_, index) => (
            <SkeletonBlock key={index} className="h-14 w-full" />
          ))}
        </div>
      </section>

      <section className="rounded-xl border border-border bg-bg-card p-4 sm:p-5" data-steam-section-skeleton="unlinked">
        <SkeletonBlock className="h-3 w-36" />
        <SkeletonBlock className="mt-3 h-3 w-3/4 max-w-full" />
        <ul className="mt-3 space-y-2">
          {Array.from({ length: 5 }).map((_, index) => (
            <li key={index} className="rounded-lg border border-border bg-bg-elev/30 p-3">
              <div className="flex items-center justify-between gap-3">
                <SkeletonBlock className="h-4 w-1/2" />
                <SkeletonBlock className="h-3 w-20" />
              </div>
              <SkeletonBlock className="mt-3 h-11 w-full" />
            </li>
          ))}
        </ul>
      </section>
    </SkeletonBoundary>
  );
}

function SteamRowsSection({ marker, rows }: { marker: string; rows: number }) {
  return (
    <section className="mb-8 rounded-xl border border-border bg-bg-card p-4 sm:p-5" data-steam-section-skeleton={marker}>
      <SkeletonBlock className="mb-3 h-3 w-36" />
      <ul className="space-y-1.5">
        {Array.from({ length: rows }).map((_, index) => (
          <li key={index} className="flex items-center gap-3 rounded-lg border border-border bg-bg-elev/30 p-2">
            <SkeletonBlock className="h-5 w-5 shrink-0" />
            <div className="min-w-0 flex-1 space-y-2">
              <SkeletonBlock className="h-4 w-2/3" />
              <SkeletonBlock className="h-3 w-1/2" />
            </div>
            <SkeletonBlock className="h-8 w-20 shrink-0" />
          </li>
        ))}
      </ul>
      <div className="mt-4 flex justify-end gap-2">
        <SkeletonBlock className="h-11 w-24" />
        <SkeletonBlock className="h-11 w-28" />
      </div>
    </section>
  );
}
