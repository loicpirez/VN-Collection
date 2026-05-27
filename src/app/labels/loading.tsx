import { SkeletonBlock, SkeletonBoundary } from '@/components/Skeleton';
import { getDict } from '@/lib/i18n/server';

export default async function LabelsLoading() {
  const t = await getDict();
  return (
    <SkeletonBoundary label={t.app.loading} className="w-full space-y-4">
      <SkeletonBlock className="h-7 w-48" />
      <SkeletonBlock className="h-24 w-full rounded-2xl" />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {Array.from({ length: 12 }).map((_, i) => (
          <SkeletonBlock key={i} className="h-32 w-full rounded-xl" />
        ))}
      </div>
    </SkeletonBoundary>
  );
}
