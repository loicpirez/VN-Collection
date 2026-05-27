import { SkeletonBlock, SkeletonBoundary } from '@/components/Skeleton';
import { getDict } from '@/lib/i18n/server';

export default async function DataLoading() {
  const t = await getDict();
  return (
    <SkeletonBoundary label={t.app.loading} className="w-full space-y-6">
      <SkeletonBlock className="h-9 w-48" />
      {Array.from({ length: 6 }).map((_, i) => (
        <SkeletonBlock key={i} className="h-32 w-full rounded-2xl" />
      ))}
    </SkeletonBoundary>
  );
}
