import { SkeletonBlock, SkeletonBoundary, SkeletonText } from '@/components/Skeleton';
import { getDict } from '@/lib/i18n/server';

export default async function Loading() {
  const t = await getDict();
  return (
    <SkeletonBoundary label={t.app.loading}>
      <SkeletonBlock className="mb-6 h-40 w-full rounded-2xl" />
      <div className="grid gap-6 md:grid-cols-[180px_1fr]">
        <SkeletonBlock className="aspect-[2/3] w-full rounded-xl" />
        <div className="space-y-4">
          <SkeletonBlock className="h-8 w-2/3" />
          <SkeletonBlock className="h-4 w-1/3" />
          <SkeletonText lines={6} />
        </div>
      </div>
    </SkeletonBoundary>
  );
}
