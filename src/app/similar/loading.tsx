import { SkeletonBlock, SkeletonBoundary } from '@/components/Skeleton';
import { getDict } from '@/lib/i18n/server';

export default async function SimilarLoading() {
  const t = await getDict();
  return (
    <SkeletonBoundary label={t.common.loading} className="w-full" densityScope="vnSimilar">
      <SkeletonBlock className="mb-4 h-11 w-32 rounded-md md:hidden" />
      <header className="rounded-2xl border border-border bg-bg-card p-4 sm:p-6" data-similar-seed-skeleton>
        <div className="flex items-center gap-2">
          <SkeletonBlock className="h-6 w-6 rounded-full" />
          <SkeletonBlock className="h-7 w-48" />
        </div>
        <SkeletonBlock className="mt-2 h-4 w-96 max-w-full" />
        <div className="mt-4 w-full">
          <SkeletonBlock className="mb-1.5 h-3 w-28" />
          <SkeletonBlock className="h-11 w-full rounded-md" />
        </div>
      </header>
    </SkeletonBoundary>
  );
}
