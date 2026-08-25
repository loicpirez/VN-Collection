import { SkeletonBlock, SkeletonBoundary } from '@/components/Skeleton';
import { getDict } from '@/lib/i18n/server';

export default async function CharactersLoading() {
  const t = await getDict();
  return (
    <SkeletonBoundary label={t.common.loading} className="w-full space-y-4" densityScope="characterWorks">
      <SkeletonBlock className="h-5 w-24 md:hidden" />
      <SkeletonBlock className="h-72 w-full rounded-2xl" />
      <div
        className="grid gap-3"
        style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, var(--card-density-px, 220px)), 1fr))' }}
      >
        {Array.from({ length: 12 }).map((_, index) => (
          <div key={index} className="rounded-lg border border-border bg-bg-elev/40 p-2">
            <SkeletonBlock className="aspect-[3/4] w-full rounded" />
            <SkeletonBlock className="mt-2 h-4 w-3/4" />
            <SkeletonBlock className="mt-2 h-3 w-1/2" />
          </div>
        ))}
      </div>
    </SkeletonBoundary>
  );
}
