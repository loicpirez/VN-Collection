import { SkeletonBlock, SkeletonBoundary } from '@/components/Skeleton';
import { ProducerVnsSkeleton } from '@/components/ProducerVnsSkeleton';
import { getDict } from '@/lib/i18n/server';

export default async function Loading() {
  const t = await getDict();
  return (
    <SkeletonBoundary label={t.common.loading} className="w-full" densityScope="producerWorks">
      <SkeletonBlock className="mb-4 h-11 w-28 md:hidden" />
      <header className="mb-6 flex flex-col gap-4 rounded-2xl border border-border bg-bg-card p-4 sm:flex-row sm:items-start sm:p-6">
        <SkeletonBlock className="h-24 w-24 shrink-0 rounded-xl" />
        <div className="min-w-0 flex-1">
          <SkeletonBlock className="h-8 w-72 max-w-full" />
          <SkeletonBlock className="mt-2 h-4 w-48 max-w-full" />
          <div className="mt-3 flex flex-wrap gap-2">
            <SkeletonBlock className="h-7 w-20" />
            <SkeletonBlock className="h-7 w-16" />
            <SkeletonBlock className="h-7 w-36" />
          </div>
          <SkeletonBlock className="mt-4 h-3 w-20" />
          <div className="mt-2 flex flex-wrap gap-1.5">
            <SkeletonBlock className="h-7 w-28" />
            <SkeletonBlock className="h-7 w-24" />
          </div>
        </div>
      </header>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <SkeletonBlock className="h-11 w-36" />
        <SkeletonBlock className="h-11 w-36" />
      </div>
      <ProducerVnsSkeleton label={t.common.loading} />
    </SkeletonBoundary>
  );
}
