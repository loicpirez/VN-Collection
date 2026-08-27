import { SkeletonBlock, SkeletonBoundary } from '@/components/Skeleton';
import { getAppSettingRepository } from '@/lib/db/repositories/app-setting';
import { getDict } from '@/lib/i18n/server';
import { parseSeriesDetailLayoutV1, type SeriesSectionId } from '@/lib/series-detail-layout';

const SERIES_LAYOUT_KEY = 'series_detail_section_layout_v1';

function HeroSkeleton() {
  return (
    <header className="overflow-hidden rounded-2xl border border-border bg-bg-card" data-series-hero-skeleton>
      <div className="grid gap-4 p-4 sm:p-6 lg:grid-cols-[auto_minmax(0,1fr)_auto] lg:items-start">
        <div className="flex min-w-0 items-start gap-4 lg:contents">
          <SkeletonBlock className="h-7 w-7 shrink-0" />
          <div className="min-w-0 flex-1 space-y-2">
            <SkeletonBlock className="h-7 w-64 max-w-full" />
            <SkeletonBlock className="h-4 w-4/5" />
            <SkeletonBlock className="h-3 w-16" />
          </div>
        </div>
        <SkeletonBlock className="h-[54px] w-full min-w-0 rounded-md lg:w-56 lg:shrink-0" />
      </div>
    </header>
  );
}

function WorksSkeleton() {
  return (
    <div className="space-y-4" data-series-works-skeleton>
      <div className="rounded-xl border border-border bg-bg-card p-4">
        <SkeletonBlock className="h-3 w-24" />
        <div className="mt-1 flex gap-2">
          <SkeletonBlock className="h-11 min-w-0 flex-1 rounded-md" />
          <SkeletonBlock className="h-11 w-24 rounded-md" />
        </div>
        <SkeletonBlock className="mt-1 h-3 w-56 max-w-full" />
      </div>
      <ul
        className="grid gap-5"
        style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, var(--card-density-px, 220px)), 1fr))' }}
      >
        {Array.from({ length: 12 }).map((_, index) => (
          <li key={index} className="relative overflow-hidden rounded-xl border border-border bg-bg-card">
            <SkeletonBlock className="aspect-[2/3] w-full rounded-none" />
            <div className="space-y-2 p-3">
              <SkeletonBlock className="h-3 w-3/4" />
              <SkeletonBlock className="h-2.5 w-1/2" />
            </div>
            <SkeletonBlock className="absolute right-2 top-2 h-11 w-11 rounded-md" />
          </li>
        ))}
      </ul>
    </div>
  );
}

function MetadataSkeleton() {
  return (
    <div className="rounded-xl border border-border bg-bg-card p-4" data-series-metadata-skeleton>
      <div className="grid gap-4 md:grid-cols-[140px_1fr]">
        <div className="flex flex-col gap-2">
          <SkeletonBlock className="h-3 w-16" />
          <SkeletonBlock className="aspect-[2/3] w-full rounded-lg" />
          <SkeletonBlock className="h-11 w-full rounded-md" />
        </div>
        <div className="flex flex-col gap-3">
          <SkeletonBlock className="h-3 w-20" />
          <SkeletonBlock className="h-11 w-full rounded-md" />
          <SkeletonBlock className="h-3 w-28" />
          <SkeletonBlock className="h-20 w-full rounded-md" />
          <SkeletonBlock className="h-3 w-20" />
          <SkeletonBlock className="h-28 w-full rounded-lg" />
          <SkeletonBlock className="h-11 w-28 rounded-md" />
        </div>
      </div>
      <div className="mt-4 flex justify-end">
        <SkeletonBlock className="h-11 w-24 rounded-md" />
      </div>
    </div>
  );
}

export default async function Loading() {
  const [t, rawLayout] = await Promise.all([
    getDict(),
    getAppSettingRepository().get(SERIES_LAYOUT_KEY),
  ]);
  const layout = parseSeriesDetailLayoutV1(rawLayout);
  const sections: Partial<Record<SeriesSectionId, React.ReactNode>> = {
    hero: <HeroSkeleton />,
    works: <WorksSkeleton />,
    metadata: <MetadataSkeleton />,
  };

  return (
    <SkeletonBoundary label={t.common.loading} className="space-y-4" densityScope="seriesWorks">
      <SkeletonBlock className="h-11 w-32 rounded-md md:hidden" />
      <div className="flex items-center justify-between gap-2" data-series-detail-skeleton>
        <SkeletonBlock className="h-3 w-24" />
        <SkeletonBlock className="h-11 w-28 rounded-md" />
      </div>
      <div className="space-y-4">
        {layout.order.map((sectionId) => {
          if (!layout.sections[sectionId].visible) return null;
          const skeleton = sections[sectionId];
          if (!skeleton) return null;
          if (layout.sections[sectionId].collapsedByDefault) {
            return (
              <section key={sectionId} className="rounded-xl border border-border bg-bg-card" data-series-collapsed-skeleton={sectionId}>
                <div className="flex min-h-[44px] items-center px-4 py-3">
                  <SkeletonBlock className="h-3 w-32" />
                </div>
              </section>
            );
          }
          return <section key={sectionId} data-series-section-skeleton={sectionId}>{skeleton}</section>;
        })}
      </div>
    </SkeletonBoundary>
  );
}
