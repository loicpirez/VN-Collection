import { SkeletonBlock, SkeletonBoundary } from '@/components/Skeleton';
import { ComparePickerSkeleton } from '@/components/ComparePickerSkeleton';
import { getDict } from '@/lib/i18n/server';

export default async function CompareLoading() {
  const t = await getDict();
  return (
    <SkeletonBoundary label={t.app.loading} className="w-full space-y-4">
      <SkeletonBlock className="h-11 w-24 md:hidden" />
      <header className="rounded-2xl border border-border bg-bg-card p-4 sm:p-6" data-compare-picker-skeleton>
        <SkeletonBlock className="h-7 w-44" />
        <ComparePickerSkeleton />
      </header>
    </SkeletonBoundary>
  );
}
