import { SkeletonBlock, SkeletonRows, SkeletonBoundary } from '@/components/Skeleton';
import { getDict } from '@/lib/i18n/server';

export default async function LoadingStockPage() {
  const t = await getDict();
  return (
    <SkeletonBoundary label={t.common.loading} className="page-space mx-auto max-w-screen-2xl px-4 py-6">
      <SkeletonBlock className="mb-5 h-10 w-64" />
      <div className="rounded-xl border border-border bg-bg-card p-5">
        <SkeletonBlock className="mb-3 h-9 w-full" />
        <SkeletonRows count={3} withThumb />
      </div>
      <div className="mt-5 rounded-xl border border-border bg-bg-card p-5">
        <SkeletonRows count={4} withThumb={false} />
      </div>
    </SkeletonBoundary>
  );
}
