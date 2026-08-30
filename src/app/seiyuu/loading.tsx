import { SkeletonBlock, SkeletonBoundary } from '@/components/Skeleton';
import { getDict } from '@/lib/i18n/server';

export default async function SeiyuuLoading() {
  const t = await getDict();
  return (
    <SkeletonBoundary label={t.common.loading} className="w-full" densityScope="staffWorks">
      <SkeletonBlock className="mb-4 h-11 w-28 md:hidden" />
      <header className="mb-5 border-b border-border pb-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 space-y-2 sm:flex-1">
            <SkeletonBlock className="h-8 w-48 max-w-full" />
            <SkeletonBlock className="h-4 w-[38rem] max-w-full" />
          </div>
          <SkeletonBlock className="h-11 w-full sm:w-36" />
        </div>
        <div className="mt-4 grid grid-cols-2 border-y border-border sm:grid-cols-3 xl:grid-cols-6">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className={`space-y-2 px-3 py-3 ${index > 0 ? 'border-l border-border' : ''}`}>
              <SkeletonBlock className="h-3 w-24 max-w-full" />
              <SkeletonBlock className="h-6 w-16" />
            </div>
          ))}
        </div>
        <div className="mt-4 flex gap-2">
          <SkeletonBlock className="h-11 w-40" />
          <SkeletonBlock className="h-11 w-52" />
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
          <SkeletonBlock className="h-14 sm:col-span-2 xl:col-span-1" />
          {Array.from({ length: 4 }).map((_, index) => (
            <SkeletonBlock key={index} className="h-14" />
          ))}
          <SkeletonBlock className="h-11 self-end" />
        </div>
      </header>
      <div className="mb-3 flex justify-between">
        <SkeletonBlock className="h-3 w-28" />
        <SkeletonBlock className="h-3 w-20" />
      </div>
      <ol
        className="grid gap-3"
        data-seiyuu-results-skeleton
        style={{
          gridTemplateColumns:
            'repeat(auto-fill, minmax(min(100%, calc(var(--card-density-px, 220px) + 40px)), 1fr))',
        }}
      >
        {Array.from({ length: 12 }).map((_, index) => (
          <li key={index} className="rounded-lg border border-border bg-bg-elev/35 p-3">
            <SkeletonBlock className="h-3 w-14" />
            <SkeletonBlock className="mt-2 h-5 w-2/3" />
            <SkeletonBlock className="mt-2 h-3 w-1/2" />
            <div className="mt-3 grid grid-cols-2 gap-2">
              <SkeletonBlock className="h-3 w-20" />
              <SkeletonBlock className="h-3 w-24" />
              <SkeletonBlock className="h-3 w-28" />
              <SkeletonBlock className="h-3 w-20" />
            </div>
            <SkeletonBlock className="mt-3 h-1.5 w-full" />
            <div className="mt-3 flex gap-2">
              {Array.from({ length: 3 }).map((_, imageIndex) => (
                <SkeletonBlock key={imageIndex} className="aspect-square flex-1" />
              ))}
            </div>
            <SkeletonBlock className="mt-3 h-11 w-full" />
          </li>
        ))}
      </ol>
    </SkeletonBoundary>
  );
}
