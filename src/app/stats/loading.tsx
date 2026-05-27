import { SkeletonBlock, SkeletonBoundary } from '@/components/Skeleton';
import { getDict } from '@/lib/i18n/server';

export default async function StatsLoading() {
  const t = await getDict();
  return (
    <SkeletonBoundary label={t.app.loading} className="w-full space-y-4">
      <SkeletonBlock className="h-7 w-40" />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <SkeletonBlock key={i} className="h-20 w-full rounded-xl" />
        ))}
      </div>
      <SkeletonBlock className="h-72 w-full rounded-2xl" />
      <SkeletonBlock className="h-72 w-full rounded-2xl" />
    </SkeletonBoundary>
  );
}
