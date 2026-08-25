import { SkeletonBlock, SkeletonBoundary } from '@/components/Skeleton';
import { getDict } from '@/lib/i18n/server';

export default async function ActivityLoading() {
  const t = await getDict();
  return (
    <SkeletonBoundary label={t.common.loading} className="w-full">
      <header className="mb-5 rounded-2xl border border-border bg-bg-card p-4 sm:p-6" data-activity-header-skeleton>
        <div className="flex items-center gap-2">
          <SkeletonBlock className="h-6 w-6 shrink-0" />
          <SkeletonBlock className="h-7 w-44" />
        </div>
        <SkeletonBlock className="mt-3 h-3 w-96 max-w-full" />
        <div className="mt-4 flex flex-wrap items-end gap-2">
          <div className="min-w-[140px] flex-1 sm:min-w-[220px]">
            <SkeletonBlock className="mb-2 h-3 w-24" />
            <SkeletonBlock className="h-11 w-full" />
          </div>
          {Array.from({ length: 2 }).map((_, index) => (
            <div key={index} className="min-w-[140px] flex-1 sm:min-w-[160px]">
              <SkeletonBlock className="mb-2 h-3 w-20" />
              <SkeletonBlock className="h-11 w-full" />
            </div>
          ))}
          <SkeletonBlock className="h-11 w-24" />
        </div>
      </header>

      <div className="space-y-8">
        {Array.from({ length: 2 }).map((_, sectionIndex) => (
          <section key={sectionIndex} data-activity-log-skeleton={sectionIndex}>
            <SkeletonBlock className="mb-3 h-3 w-36" />
            <ol className="space-y-2">
              {Array.from({ length: 5 }).map((_, rowIndex) => (
                <li key={rowIndex} className="rounded-xl border border-border bg-bg-card p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1 space-y-2">
                      <div className="flex items-center gap-2">
                        <SkeletonBlock className="h-5 w-20" />
                        <SkeletonBlock className="h-4 w-1/2" />
                      </div>
                      <SkeletonBlock className="h-3 w-3/4" />
                    </div>
                    <SkeletonBlock className="h-3 w-24 shrink-0" />
                  </div>
                </li>
              ))}
            </ol>
            <div className="mt-4 flex items-center gap-2">
              <SkeletonBlock className="h-11 w-24" />
              <SkeletonBlock className="h-3 w-16" />
              <SkeletonBlock className="h-11 w-24" />
            </div>
          </section>
        ))}
      </div>
    </SkeletonBoundary>
  );
}
