import { SkeletonBlock, SkeletonBoundary } from '@/components/Skeleton';
import { getDict } from '@/lib/i18n/server';

export default async function ReleaseLoading() {
  const t = await getDict();
  return (
    <SkeletonBoundary label={t.app.loading} className="space-y-4">
      <SkeletonBlock className="h-6 w-32" />
      <SkeletonBlock className="h-9 w-2/3" />
      <SkeletonBlock className="h-5 w-1/3" />
      <div className="grid gap-3 sm:grid-cols-2">
        <SkeletonBlock className="h-24" />
        <SkeletonBlock className="h-24" />
        <SkeletonBlock className="h-24" />
        <SkeletonBlock className="h-24" />
      </div>
    </SkeletonBoundary>
  );
}
