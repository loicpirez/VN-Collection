import { SkeletonBlock, SkeletonBoundary } from '@/components/Skeleton';
import { getDict } from '@/lib/i18n/server';

export default async function QuotesLoading() {
  const t = await getDict();
  return (
    <SkeletonBoundary label={t.common.loading} className="w-full">
      <SkeletonBlock className="mb-4 h-11 w-28 md:hidden" />
      <header className="mb-6 rounded-2xl border border-border bg-bg-card p-4 sm:p-6" data-quotes-header-skeleton>
        <div className="flex items-center gap-2">
          <SkeletonBlock className="h-6 w-6 shrink-0" />
          <SkeletonBlock className="h-7 w-48" />
        </div>
        <SkeletonBlock className="mt-3 h-3 w-96 max-w-full" />
        <div className="mt-3 flex max-w-md items-center gap-2">
          <SkeletonBlock className="h-4 w-4 shrink-0" />
          <SkeletonBlock className="h-11 flex-1" />
        </div>
      </header>

      <ul className="space-y-3" data-quotes-results-skeleton>
        {Array.from({ length: 8 }).map((_, index) => (
          <li key={index} className="rounded-xl border border-border bg-bg-card p-4">
            <div className="space-y-2">
              <SkeletonBlock className="h-3 w-full" />
              <SkeletonBlock className="h-3 w-11/12" />
              <SkeletonBlock className="h-3 w-2/3" />
            </div>
            <div className="mt-3 flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2">
                <SkeletonBlock className="h-7 w-7 shrink-0 rounded-full" />
                <SkeletonBlock className="h-3 w-48 max-w-full" />
              </div>
              <SkeletonBlock className="h-3 w-10 shrink-0" />
            </div>
          </li>
        ))}
      </ul>
      <div className="mt-6 flex items-center justify-between gap-4">
        <SkeletonBlock className="h-11 w-24" />
        <SkeletonBlock className="h-3 w-16" />
        <SkeletonBlock className="h-11 w-24" />
      </div>
    </SkeletonBoundary>
  );
}
