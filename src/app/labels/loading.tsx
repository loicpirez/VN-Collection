import { SkeletonBlock, SkeletonBoundary } from '@/components/Skeleton';
import { getDict } from '@/lib/i18n/server';

export default async function LabelsLoading() {
  const t = await getDict();
  return (
    <SkeletonBoundary label={t.app.loading} className="w-full space-y-4">
      <div className="flex items-center justify-between gap-3" data-labels-toolbar-skeleton>
        <SkeletonBlock className="h-11 w-24" />
        <SkeletonBlock className="h-11 w-24 rounded-md" />
      </div>
      <SkeletonBlock className="h-7 w-48" />
      <SkeletonBlock className="h-4 w-80 max-w-full" />
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4" data-label-sheet-skeleton>
        {Array.from({ length: 12 }).map((_, i) => (
          <div key={i} className="flex items-center gap-2 rounded-md border border-border bg-bg-card p-2">
            <SkeletonBlock className="h-20 w-20 shrink-0 rounded-none" />
            <div className="min-w-0 flex-1 space-y-2">
              <SkeletonBlock className="h-3 w-full" />
              <SkeletonBlock className="h-2.5 w-12" />
              <SkeletonBlock className="h-2.5 w-3/4" />
            </div>
          </div>
        ))}
      </div>
    </SkeletonBoundary>
  );
}
