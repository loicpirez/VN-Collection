import { SkeletonBlock, SkeletonBoundary } from '@/components/Skeleton';
import { getDict } from '@/lib/i18n/server';

export default async function StaffLoading() {
  const t = await getDict();
  return (
    <SkeletonBoundary label={t.common.loading} className="w-full" densityScope="staffWorks">
      <SkeletonBlock className="mb-4 h-11 w-28 md:hidden" />

      <header className="mb-5 rounded-2xl border border-border bg-bg-card p-4 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1 space-y-2">
            <SkeletonBlock className="h-8 w-56 max-w-full" />
            <SkeletonBlock className="h-4 w-[28rem] max-w-full" />
          </div>
          <SkeletonBlock className="h-11 w-36" />
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <SkeletonBlock className="h-11 min-w-[140px] flex-1 sm:min-w-[200px]" />
          <SkeletonBlock className="h-11 w-32" />
          <SkeletonBlock className="h-11 w-24" />
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          <SkeletonBlock className="h-9 w-28" />
          <SkeletonBlock className="h-9 w-28" />
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <SkeletonBlock className="h-9 w-24" />
          <SkeletonBlock className="h-9 w-36" />
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {Array.from({ length: 10 }).map((_, index) => (
            <SkeletonBlock key={index} className="h-7 w-20" />
          ))}
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          <SkeletonBlock className="h-7 w-20" />
          <SkeletonBlock className="h-7 w-24" />
          <SkeletonBlock className="h-7 w-20" />
        </div>
      </header>

      <SkeletonBlock className="mb-3 h-3 w-28" />
      <ul
        className="grid gap-3"
        data-staff-list-results-skeleton
        style={{
          gridTemplateColumns:
            'repeat(auto-fill, minmax(min(100%, var(--card-density-px, 220px)), 1fr))',
        }}
      >
        {Array.from({ length: 10 }).map((_, index) => (
          <li key={index} className="rounded-lg border border-border bg-bg-elev/40 p-3">
            <SkeletonBlock className="h-4 w-2/3" />
            <SkeletonBlock className="mt-2 h-3 w-1/2" />
            <div className="mt-2 flex flex-wrap gap-1">
              <SkeletonBlock className="h-5 w-14" />
              <SkeletonBlock className="h-5 w-20" />
            </div>
          </li>
        ))}
      </ul>
    </SkeletonBoundary>
  );
}
