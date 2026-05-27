import { SkeletonBlock, SkeletonBoundary } from '@/components/Skeleton';
import { getDict } from '@/lib/i18n/server';

export default async function CompareLoading() {
  const t = await getDict();
  return (
    <SkeletonBoundary label={t.app.loading} className="w-full space-y-4">
      <SkeletonBlock className="h-7 w-40" />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <SkeletonBlock key={i} className="aspect-[2/3] w-full rounded-xl" />
        ))}
      </div>
      <SkeletonBlock className="h-64 w-full rounded-2xl" />
    </SkeletonBoundary>
  );
}
