import { SkeletonBlock, SkeletonBoundary } from '@/components/Skeleton';
import { getDict } from '@/lib/i18n/server';

function CreditCardSkeleton({ withCharacters }: { withCharacters: boolean }) {
  return (
    <li className="flex gap-3 rounded-lg border border-border bg-bg-elev/40 p-2">
      <SkeletonBlock
        className="shrink-0 rounded"
        style={{
          width: 'clamp(72px, calc(var(--card-density-px, 220px) * 0.42), 200px)',
          aspectRatio: '2 / 3',
        }}
      />
      <div className="min-w-0 flex-1 py-1">
        <SkeletonBlock className="h-4 w-4/5" />
        <SkeletonBlock className="mt-2 h-3 w-3/5" />
        <div className="mt-3 flex gap-2">
          <SkeletonBlock className="h-5 w-12" />
          <SkeletonBlock className="h-5 w-14" />
        </div>
        {withCharacters && (
          <div className="mt-3 flex items-start gap-2">
            <SkeletonBlock className="h-11 w-11 shrink-0" />
            <div className="min-w-0 flex-1 space-y-2 pt-1">
              <SkeletonBlock className="h-3 w-3/4" />
              <SkeletonBlock className="h-2.5 w-1/2" />
            </div>
          </div>
        )}
      </div>
    </li>
  );
}

function CreditSectionSkeleton({ withCharacters = false }: { withCharacters?: boolean }) {
  return (
    <section className="rounded-xl border border-border bg-bg-card p-4 sm:p-6">
      <SkeletonBlock className="mb-4 h-4 w-44" />
      <ul
        className="grid gap-3"
        data-staff-credit-grid-skeleton
        style={{
          gridTemplateColumns: `repeat(auto-fill, minmax(min(100%, var(--card-density-px, ${withCharacters ? '280' : '220'}px)), 1fr))`,
        }}
      >
        {Array.from({ length: 4 }).map((_, index) => (
          <CreditCardSkeleton key={index} withCharacters={withCharacters} />
        ))}
      </ul>
    </section>
  );
}

export default async function StaffDetailLoading() {
  const t = await getDict();
  return (
    <SkeletonBoundary label={t.common.loading} className="w-full">
      <SkeletonBlock className="mb-4 h-11 w-28 md:hidden" />

      <header className="mb-6 rounded-2xl border border-border bg-bg-card p-4 sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 flex-1">
            <SkeletonBlock className="h-8 w-72 max-w-full" />
            <SkeletonBlock className="mt-2 h-4 w-48 max-w-full" />
            <div className="mt-3 flex flex-wrap gap-2">
              <SkeletonBlock className="h-11 w-24 sm:h-7" />
              <SkeletonBlock className="h-11 w-28 sm:h-7" />
              <SkeletonBlock className="h-11 w-36 sm:h-7" />
              <SkeletonBlock className="h-11 w-32 sm:h-7" />
            </div>
            <SkeletonBlock className="mt-4 h-3 w-20" />
            <div className="mt-2 flex flex-wrap gap-1.5">
              <SkeletonBlock className="h-7 w-28" />
              <SkeletonBlock className="h-7 w-24" />
              <SkeletonBlock className="h-7 w-32" />
            </div>
            <SkeletonBlock className="mt-4 h-3 w-24" />
            <div className="mt-2 space-y-2">
              <SkeletonBlock className="h-3 w-full" />
              <SkeletonBlock className="h-3 w-5/6" />
              <SkeletonBlock className="h-3 w-2/3" />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 self-start">
            <SkeletonBlock className="h-11 w-36" />
            <SkeletonBlock className="h-11 w-32" />
            <SkeletonBlock className="h-11 w-24" />
          </div>
        </div>
        <div className="mt-4 inline-flex max-w-full items-center gap-2 rounded-md border border-border bg-bg-elev p-1">
          <SkeletonBlock className="h-9 w-24" />
          <SkeletonBlock className="h-9 w-36" />
        </div>
      </header>

      <div className="space-y-6">
        <section className="rounded-xl border border-border bg-bg-card p-4 sm:p-5" data-staff-timeline-skeleton>
          <SkeletonBlock className="h-4 w-40" />
          <div className="mt-4 flex items-end gap-2 overflow-hidden">
            {['h-12', 'h-20', 'h-16', 'h-28', 'h-24', 'h-32', 'h-20', 'h-14'].map((height, index) => (
              <SkeletonBlock key={index} className={`${height} min-w-8 flex-1 rounded-sm`} />
            ))}
          </div>
        </section>
        <CreditSectionSkeleton withCharacters />
        <CreditSectionSkeleton />
      </div>
    </SkeletonBoundary>
  );
}
