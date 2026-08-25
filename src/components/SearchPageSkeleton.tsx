import type { ReactElement } from 'react';
import { SkeletonBlock, SkeletonBoundary, SkeletonCardGrid } from './Skeleton';

interface SearchSkeletonProps {
  label?: string;
}

/**
 * Render the complete search workspace while the route or client shell resolves.
 *
 * @param props Optional localized loading announcement.
 * @returns Source tabs, query controls, density control, and the VN card grid.
 */
export function SearchPageSkeleton({ label }: SearchSkeletonProps): ReactElement {
  return (
    <SkeletonBoundary label={label} densityScope="search">
      <div data-search-page-skeleton="true">
        <div className="mb-2 flex h-[46px] w-fit items-center gap-1 rounded-md border border-border bg-bg-elev/30 p-1">
          <SkeletonBlock className="h-11 w-20" />
          <SkeletonBlock className="h-11 w-16" />
          <SkeletonBlock className="h-11 w-24" />
        </div>
        <SkeletonBlock className="mb-3 h-11 w-full" />
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <SkeletonBlock className="h-11 w-32" />
        </div>
        <SearchVndbResultsSkeleton label={label} />
      </div>
    </SkeletonBoundary>
  );
}

/**
 * Render the density toolbar and result cards used by a pending VNDB search.
 *
 * @param props Optional localized loading announcement.
 * @returns A stable toolbar followed by the density-aware VN card grid.
 */
export function SearchVndbResultsSkeleton({ label }: SearchSkeletonProps): ReactElement {
  return (
    <div data-search-vndb-results-skeleton>
      <div className="mb-3 flex justify-end">
        <SkeletonBlock className="h-11 w-44" />
      </div>
      <SkeletonCardGrid count={18} label={label} />
    </div>
  );
}

/**
 * Render result rows matching ErogameScape title metadata and add actions.
 *
 * @param props Optional localized loading announcement.
 * @returns Six compact search-result rows.
 */
export function SearchEgsRowsSkeleton({ label }: SearchSkeletonProps): ReactElement {
  return (
    <ul
      role="status"
      aria-busy
      aria-live="polite"
      className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-bg-card"
      data-search-egs-rows-skeleton
    >
      {label ? <li className="sr-only">{label}</li> : null}
      {Array.from({ length: 6 }).map((_, index) => (
        <li key={index} className="flex min-h-[68px] items-center justify-between gap-3 px-4 py-3">
          <div className="min-w-0 flex-1 space-y-2">
            <SkeletonBlock className={index % 2 === 0 ? 'h-3.5 w-3/4' : 'h-3.5 w-1/2'} />
            <div className="flex flex-wrap gap-2">
              <SkeletonBlock className="h-2.5 w-16" />
              <SkeletonBlock className="h-2.5 w-20" />
              <SkeletonBlock className="h-2.5 w-12" />
            </div>
          </div>
          <SkeletonBlock className="h-11 w-24 shrink-0" />
        </li>
      ))}
    </ul>
  );
}

/**
 * Render the standalone local-search panel while its client chunk resolves.
 *
 * @param props Optional localized loading announcement.
 * @returns A bordered hint and three compact local-result placeholders.
 */
export function SearchLocalPanelSkeleton({ label }: SearchSkeletonProps): ReactElement {
  return (
    <section
      role="status"
      aria-busy
      aria-live="polite"
      className="rounded-xl border border-border bg-bg-card/60 px-3 pb-3 pt-2"
      data-search-local-panel-skeleton
    >
      {label ? <span className="sr-only">{label}</span> : null}
      <SkeletonBlock className="mb-2 h-2.5 w-72 max-w-full" />
      <ul className="space-y-1.5">
        {Array.from({ length: 3 }).map((_, index) => (
          <li key={index} className="rounded-md border border-border bg-bg-elev/30 p-2">
            <div className="flex gap-2">
              <SkeletonBlock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <div className="min-w-0 flex-1 space-y-1.5">
                <SkeletonBlock className={index === 1 ? 'h-3 w-1/2' : 'h-3 w-2/3'} />
                <SkeletonBlock className="h-2.5 w-full" />
                <SkeletonBlock className="h-2.5 w-4/5" />
              </div>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
