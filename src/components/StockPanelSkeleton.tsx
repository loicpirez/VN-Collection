import type { ReactElement } from 'react';
import { SkeletonBlock } from './Skeleton';

interface StockOfferRowsSkeletonProps {
  label?: string;
  className?: string;
}

/**
 * Render the loading geometry used by the stock offer groups.
 *
 * @param props Optional announcement and wrapper classes.
 * @returns Four placeholders matching the final two-column offer cards.
 */
export function StockOfferRowsSkeleton({ label, className = 'mt-4' }: StockOfferRowsSkeletonProps): ReactElement {
  return (
    <div
      role="status"
      aria-busy
      aria-live="polite"
      className={className}
      data-stock-offer-rows-skeleton
    >
      {label ? <span className="sr-only">{label}</span> : null}
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <SkeletonBlock className="h-3 w-32" />
        <SkeletonBlock className="h-3 w-24" />
      </div>
      <div className="mb-2 mt-4 flex flex-wrap items-center gap-2">
        <SkeletonBlock className="h-3 w-24" />
        <SkeletonBlock className="h-5 w-8" />
        <SkeletonBlock className="h-7 w-16" />
      </div>
      <ul className="grid gap-3 lg:grid-cols-2">
        {Array.from({ length: 4 }).map((_, index) => (
          <li
            key={index}
            data-stock-offer-card-skeleton
            className="rounded-lg border border-border bg-bg-elev/40 p-3"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1 space-y-2">
                <div className="flex flex-wrap items-center gap-1.5">
                  <SkeletonBlock className="h-5 w-20" />
                  <SkeletonBlock className="h-5 w-16" />
                  {index % 2 === 0 ? <SkeletonBlock className="h-5 w-24" /> : null}
                </div>
                <SkeletonBlock className={index % 2 === 0 ? 'h-4 w-5/6' : 'h-4 w-2/3'} />
              </div>
              <SkeletonBlock className="h-6 w-20 shrink-0" />
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <SkeletonBlock className="h-5 w-24" />
              <SkeletonBlock className="h-5 w-20" />
              <SkeletonBlock className="h-5 w-28" />
            </div>
            <div className="mt-3 flex items-center justify-between gap-2">
              <SkeletonBlock className="h-3 w-32" />
              <SkeletonBlock className="h-11 w-24 shrink-0 sm:h-9" />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

interface StockPanelSkeletonProps {
  bare?: boolean;
  label?: string;
}

/**
 * Render the stock module's code-loading state with its final panel geometry.
 *
 * @param props Whether the host already supplies a section frame and an optional announcement.
 * @returns A stable stock header, setup controls, and offer-card skeleton.
 */
export function StockPanelSkeleton({ bare = false, label }: StockPanelSkeletonProps): ReactElement {
  return (
    <section
      aria-busy
      className={`${bare ? '' : 'overflow-hidden rounded-xl border border-border bg-bg-card'} p-4 sm:p-5`}
      data-stock-panel-skeleton
    >
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 max-w-full flex-1 space-y-2">
          {!bare ? <SkeletonBlock className="h-3 w-28" /> : null}
          <SkeletonBlock className="h-4 w-56 max-w-full" />
          <div className="flex flex-wrap items-center gap-2">
            <SkeletonBlock className="h-7 w-32" />
            <SkeletonBlock className="h-7 w-28" />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <SkeletonBlock className="h-11 w-24" />
          <SkeletonBlock className="h-11 w-24" />
          <SkeletonBlock className="h-11 w-28" />
        </div>
      </header>
      <SkeletonBlock className="mt-4 h-11 w-full rounded-lg" />
      <SkeletonBlock className="mt-4 h-11 w-full rounded-lg" />
      <StockOfferRowsSkeleton label={label} />
    </section>
  );
}
