import { SkeletonBlock, SkeletonBoundary, SkeletonTable } from '@/components/Skeleton';
import { getDict } from '@/lib/i18n/server';

export default async function SchemaLoading() {
  const t = await getDict();
  return (
    <SkeletonBoundary label={t.common.loading} className="w-full">
      <SkeletonBlock className="mb-4 h-11 w-28 md:hidden" />
      <header className="mb-6 rounded-2xl border border-border bg-bg-card p-4 sm:p-6" data-schema-header-skeleton>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <SkeletonBlock className="h-6 w-6 shrink-0" />
              <SkeletonBlock className="h-7 w-56 max-w-full" />
            </div>
            <SkeletonBlock className="h-3 w-96 max-w-full" />
          </div>
          <SkeletonBlock className="h-11 w-32" />
        </div>
        <SkeletonBlock className="mt-3 h-3 w-64 max-w-full" />
      </header>

      <SchemaSectionSkeleton marker="local" cards={4} />
      <SchemaSectionSkeleton marker="egs" cards={3} />

      <section className="mb-6 rounded-2xl border border-border bg-bg-card p-4 sm:p-6" data-schema-section-skeleton="vndb">
        <div className="flex items-center gap-2">
          <SkeletonBlock className="h-5 w-5 shrink-0" />
          <SkeletonBlock className="h-5 w-44" />
        </div>
        <SkeletonBlock className="mt-3 h-3 w-3/4 max-w-full" />
        <div className="mt-4 flex flex-wrap gap-2">
          <SkeletonBlock className="h-11 min-w-48 flex-1" />
          <SkeletonBlock className="h-11 w-36" />
        </div>
        <div className="mt-4 overflow-hidden">
          <SkeletonTable rows={7} cols={4} />
        </div>
      </section>
    </SkeletonBoundary>
  );
}

function SchemaSectionSkeleton({ marker, cards }: { marker: string; cards: number }) {
  return (
    <section className="mb-6 rounded-2xl border border-border bg-bg-card p-4 sm:p-6" data-schema-section-skeleton={marker}>
      <div className="flex items-center gap-2">
        <SkeletonBlock className="h-5 w-5 shrink-0" />
        <SkeletonBlock className="h-5 w-44" />
      </div>
      <SkeletonBlock className="mt-3 h-3 w-2/3 max-w-full" />
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: cards }).map((_, index) => (
          <div key={index} className="rounded-lg border border-border bg-bg-elev/40 p-3">
            <SkeletonBlock className="h-3 w-24" />
            <SkeletonBlock className="mt-2 h-6 w-16" />
          </div>
        ))}
      </div>
    </section>
  );
}
