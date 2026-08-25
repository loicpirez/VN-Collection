import { SkeletonBlock, SkeletonBoundary } from '@/components/Skeleton';
import { StockRecentActivitySkeleton } from '@/components/StockRecentActivitySkeleton';
import { getDict } from '@/lib/i18n/server';

export default async function LoadingStockPage() {
  const t = await getDict();
  return (
    <SkeletonBoundary label={t.common.loading} className="page-space mx-auto max-w-screen-2xl px-4 py-6">
      <header className="mb-5 space-y-2">
        <div className="flex items-center gap-2">
          <SkeletonBlock className="h-5 w-5 shrink-0" />
          <SkeletonBlock className="h-7 w-52" />
        </div>
        <SkeletonBlock className="h-3 w-96 max-w-full" />
      </header>

      <section className="rounded-xl border border-border bg-bg-card p-4 sm:p-5" data-stock-picker-skeleton>
        <SkeletonBlock className="h-3 w-32" />
        <SkeletonBlock className="mt-3 h-3 w-2/3 max-w-full" />
        <SkeletonBlock className="mt-3 h-11 w-full" />
      </section>

      <SkeletonBlock className="mt-5 h-20 w-full rounded-xl" />

      <section className="mt-4 rounded-xl border border-border bg-bg-card p-4 sm:p-5" data-stock-recent-skeleton>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-2">
            <SkeletonBlock className="h-4 w-44" />
            <SkeletonBlock className="h-3 w-72 max-w-full" />
          </div>
          <SkeletonBlock className="h-11 w-28" />
        </div>
        <StockRecentActivitySkeleton label={t.common.loading} announce={false} />
      </section>

      <section className="mt-5 rounded-xl border border-border bg-bg-card p-4 sm:p-5" data-stock-batch-skeleton>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-2">
            <SkeletonBlock className="h-5 w-52" />
            <SkeletonBlock className="h-3 w-96 max-w-full" />
          </div>
          <SkeletonBlock className="h-11 w-32" />
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <SkeletonBlock key={index} className="h-11 w-full" />
          ))}
        </div>
        <SkeletonBlock className="mt-4 h-28 w-full" />
      </section>
    </SkeletonBoundary>
  );
}
