import { SkeletonBlock, SkeletonCardGrid, SkeletonBoundary } from '@/components/Skeleton';
import { getDict } from '@/lib/i18n/server';

export default async function TagDetailLoading() {
  const t = await getDict();
  return (
    <SkeletonBoundary label={t.common.loading} className="w-full space-y-6" densityScope="tagPage">
      <SkeletonBlock className="h-11 w-24" />
      <header
        className="rounded-2xl border border-border bg-bg-card p-4 sm:p-6"
        data-tag-detail-skeleton
      >
        <SkeletonBlock className="h-7 w-56 max-w-full" />
        <div className="mt-2 flex flex-wrap gap-2">
          <SkeletonBlock className="h-5 w-16 rounded-md" />
          <SkeletonBlock className="h-5 w-20 rounded-md" />
          <SkeletonBlock className="h-5 w-20 rounded-md" />
        </div>
        <SkeletonBlock className="mt-3 h-3 w-72 max-w-full" />
        <div className="mt-4 inline-flex max-w-full gap-1 rounded-md border border-border bg-bg-elev/30 p-1">
          <SkeletonBlock className="h-11 w-24 rounded-md can-hover:sm:h-7" />
          <SkeletonBlock className="h-11 w-20 rounded-md can-hover:sm:h-7" />
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <SkeletonBlock className="h-11 w-32 rounded-md" />
          <SkeletonBlock className="h-11 w-24 rounded-md" />
          <SkeletonBlock className="h-[54px] w-full max-w-[320px] rounded-md" />
        </div>
      </header>
      <section className="rounded-xl border border-border bg-bg-card p-4 sm:p-6" data-tag-results-skeleton>
        <SkeletonBlock className="mb-3 h-3 w-32" />
        <SkeletonCardGrid count={12} />
      </section>
    </SkeletonBoundary>
  );
}
