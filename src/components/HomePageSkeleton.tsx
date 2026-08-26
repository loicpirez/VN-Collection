import {
  SkeletonBlock,
  SkeletonBoundary,
  SkeletonCard,
} from './Skeleton';
import { Fragment } from 'react';
import type {
  HomeSectionId,
  HomeSectionLayoutV1,
  HomeSectionState,
} from '@/lib/home-section-layout';

interface HomePageSkeletonProps {
  /** Persisted home composition used by the resolved page. */
  layout: HomeSectionLayoutV1;
  /** Localized loading announcement for assistive technology. */
  label: string;
}

/**
 * Loading surface for the configurable home page.
 *
 * The skeleton follows the saved section order and visibility state instead
 * of flashing an unrelated cover grid before the server sections resolve.
 * Collapsed sections retain only their final header geometry.
 *
 * @param layout Persisted section order, visibility, and collapsed state.
 * @param label Localized loading announcement.
 * @returns A density-aware skeleton matching the configured home page.
 */
export function HomePageSkeleton({ layout, label }: HomePageSkeletonProps) {
  const renderers: Record<HomeSectionId, React.ReactNode> = {
    'recently-viewed': renderHomeSectionSkeleton(
      'recently-viewed',
      layout.sections['recently-viewed'],
    ),
    'reading-queue': renderHomeSectionSkeleton(
      'reading-queue',
      layout.sections['reading-queue'],
    ),
    anniversary: renderHomeSectionSkeleton('anniversary', layout.sections.anniversary),
    'library-controls': renderHomeSectionSkeleton(
      'library-controls',
      layout.sections['library-controls'],
    ),
    'library-grid': renderHomeSectionSkeleton(
      'library-grid',
      layout.sections['library-grid'],
    ),
  };

  return (
    <SkeletonBoundary
      label={label}
      className="space-y-5"
      densityScope="library"
    >
      {layout.order.map((id) => (
        <Fragment key={id}>{renderers[id]}</Fragment>
      ))}
    </SkeletonBoundary>
  );
}

/**
 * Isolated fallback for a single asynchronous home section.
 *
 * @param id Home section whose final geometry is being reserved.
 * @param state Persisted visibility and collapsed state for the section.
 * @param label Localized loading announcement.
 * @returns An announced section skeleton, or an empty boundary when hidden.
 */
export function HomeSectionSkeleton({
  id,
  state,
  label,
}: {
  id: HomeSectionId;
  state: HomeSectionState;
  label: string;
}) {
  return (
    <SkeletonBoundary label={label}>
      {renderHomeSectionSkeleton(id, state)}
    </SkeletonBoundary>
  );
}

function renderHomeSectionSkeleton(
  id: HomeSectionId,
  state: HomeSectionState,
): React.ReactNode {
  if (id === 'library-controls') return <LibraryControlsSkeleton state={state} />;
  if (id === 'library-grid') return <LibraryGridSkeleton state={state} />;
  return <HomeStripSkeleton kind={id} state={state} />;
}

function SectionHeaderSkeleton({ compact = false }: { compact?: boolean }) {
  return (
    <div className={compact ? 'mb-2 flex items-center justify-between gap-2' : 'mb-3 flex items-center justify-between gap-2'}>
      <div className="flex min-w-0 items-center gap-2">
        {compact && <SkeletonBlock className="h-3.5 w-3.5 shrink-0 rounded-sm" />}
        <SkeletonBlock className={compact ? 'h-3 w-32' : 'h-5 w-40'} />
        {compact && <SkeletonBlock className="h-2.5 w-5" />}
      </div>
      <div className="flex shrink-0 gap-1">
        <SkeletonBlock className="h-7 w-7" />
        <SkeletonBlock className="h-7 w-7" />
      </div>
    </div>
  );
}

function HomeStripSkeleton({
  kind,
  state,
}: {
  kind: 'recently-viewed' | 'reading-queue' | 'anniversary';
  state: HomeSectionState;
}) {
  if (!state.visible) return null;
  const shellClass = kind === 'recently-viewed'
    ? 'rounded-2xl border border-border bg-bg-card/60 px-4 py-3'
    : kind === 'anniversary'
      ? 'rounded-xl border border-accent/30 bg-accent/5 p-3'
      : 'rounded-xl border border-border bg-bg-card p-3';

  return (
    <section data-home-section-skeleton={kind} className={shellClass}>
      <SectionHeaderSkeleton compact />
      {!state.collapsed && (
        kind === 'recently-viewed'
          ? <RecentItemsSkeleton />
          : <CompactItemsSkeleton anniversary={kind === 'anniversary'} />
      )}
    </section>
  );
}

function RecentItemsSkeleton() {
  return (
    <div className="flex snap-x snap-mandatory gap-3 overflow-hidden pb-1">
      {Array.from({ length: 6 }).map((_, index) => (
        <div
          key={index}
          className="flex flex-none snap-start flex-col gap-1"
          style={{ width: 'min(40vw, calc(var(--card-density-px, 180px) * 0.55))' }}
        >
          <SkeletonBlock className="aspect-[2/3] w-full rounded-md" />
          <SkeletonBlock className="h-2.5 w-full" />
          <SkeletonBlock className="h-2.5 w-2/3" />
        </div>
      ))}
    </div>
  );
}

function CompactItemsSkeleton({ anniversary }: { anniversary: boolean }) {
  return (
    <div className="flex flex-wrap gap-2">
      {Array.from({ length: anniversary ? 4 : 6 }).map((_, index) => (
        <div
          key={index}
          className="flex min-h-[44px] items-center gap-2 rounded-md bg-bg-elev/40 px-2 py-1"
        >
          {!anniversary && <SkeletonBlock className="h-2.5 w-3" />}
          <SkeletonBlock className="h-8 w-6 shrink-0 rounded" />
          <div className="space-y-1.5">
            <SkeletonBlock className={index % 2 === 0 ? 'h-2.5 w-28' : 'h-2.5 w-20'} />
            {anniversary && <SkeletonBlock className="h-2 w-14" />}
          </div>
          {!anniversary && index % 2 === 0 && <SkeletonBlock className="h-5 w-16" />}
        </div>
      ))}
    </div>
  );
}

function LibraryControlsSkeleton({ state }: { state: HomeSectionState }) {
  if (!state.visible) return null;
  return (
    <section data-home-section-skeleton="library-controls">
      <SectionHeaderSkeleton />
      {!state.collapsed && (
        <div>
          <div className="mb-4 flex flex-wrap items-center gap-1.5">
            {Array.from({ length: 7 }).map((_, index) => (
              <SkeletonBlock
                key={index}
                className={index % 3 === 0 ? 'h-8 w-28 rounded-full' : 'h-8 w-24 rounded-full'}
              />
            ))}
          </div>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <SkeletonBlock className="h-10 min-w-[180px] flex-1" />
            <SkeletonBlock className="h-10 w-24" />
            <SkeletonBlock className="h-10 w-10" />
          </div>
          <div className="mb-6 hidden flex-wrap items-center gap-3 border-t border-border/60 pt-4 sm:flex">
            <SkeletonBlock className="h-10 w-32" />
            <SkeletonBlock className="h-10 w-32" />
            <SkeletonBlock className="h-10 w-28" />
            <SkeletonBlock className="h-10 w-36" />
            <SkeletonBlock className="h-10 min-w-48 flex-1" />
          </div>
          <SkeletonBlock className="h-11 w-full sm:hidden" />
        </div>
      )}
    </section>
  );
}

function LibraryGridSkeleton({ state }: { state: HomeSectionState }) {
  if (!state.visible) return null;
  return (
    <section data-home-section-skeleton="library-grid">
      <div className="mb-2 flex items-center justify-end gap-1 opacity-60">
        <SkeletonBlock className="h-7 w-7" />
        <SkeletonBlock className="h-7 w-7" />
      </div>
      {!state.collapsed && (
        <div
          data-home-library-grid-skeleton
          className="grid gap-5"
          style={{
            gridTemplateColumns:
              'repeat(auto-fill, minmax(min(100%, var(--card-density-px, 220px)), 1fr))',
          }}
        >
          {Array.from({ length: 18 }).map((_, index) => (
            <SkeletonCard key={index} />
          ))}
        </div>
      )}
    </section>
  );
}
