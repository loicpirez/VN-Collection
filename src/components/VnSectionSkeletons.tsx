import type { ReactElement } from 'react';
import { SkeletonBlock } from './Skeleton';

function LoadingLabel({ label }: { label?: string }): ReactElement | null {
  return label ? <li className="sr-only">{label}</li> : null;
}

/**
 * Character-card grid shared by the VN section's code and data fallbacks.
 *
 * @returns Six placeholders with the final 80 by 112 portrait geometry.
 */
export function CharacterCardsSkeleton(): ReactElement {
  return (
    <div
      role="status"
      aria-busy
      aria-live="polite"
      className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
      data-character-cards-skeleton
    >
      {Array.from({ length: 6 }).map((_, index) => (
        <div key={index} className="flex gap-3 rounded-lg border border-border bg-bg-elev/50 p-3">
          <SkeletonBlock className="h-28 w-20 shrink-0 rounded-md" />
          <div className="flex-1 space-y-2 pt-1">
            <SkeletonBlock className="h-3 w-2/3" />
            <SkeletonBlock className="h-2.5 w-1/3" />
            <SkeletonBlock className="h-2.5 w-1/2" />
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * Quote cards shared by the VN section's code and data fallbacks.
 *
 * @returns Three citation-shaped placeholders, including optional avatars.
 */
export function QuoteRowsSkeleton(): ReactElement {
  return (
    <ul role="status" aria-busy aria-live="polite" className="space-y-3" data-quote-rows-skeleton>
      {Array.from({ length: 3 }).map((_, index) => (
        <li key={index} className="space-y-2 rounded-lg border-l-2 border-accent bg-bg-elev/50 px-4 py-3">
          <SkeletonBlock className="h-3 w-full" />
          <SkeletonBlock className="h-3 w-5/6" />
          {index < 2 && (
            <div className="flex items-center justify-end gap-2 pt-1">
              <SkeletonBlock className="h-7 w-7 shrink-0 rounded-full" />
              <SkeletonBlock className="h-2.5 w-1/4" />
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}

/**
 * Release rows shared by the VN section's code and data fallbacks.
 *
 * @param label Optional localized loading announcement.
 * @returns Four metadata-rich release placeholders.
 */
export function ReleaseRowsSkeleton({ label }: { label?: string }): ReactElement {
  return (
    <ul
      role="status"
      aria-busy
      aria-live="polite"
      className="space-y-3"
      data-release-rows-skeleton
    >
      <LoadingLabel label={label} />
      {Array.from({ length: 4 }).map((_, index) => (
        <li key={index} className="rounded-lg border border-border bg-bg-elev/50 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex min-w-0 flex-1 items-center gap-2">
              <SkeletonBlock className={index % 2 === 0 ? 'h-3.5 w-48 max-w-full' : 'h-3.5 w-64 max-w-full'} />
              <SkeletonBlock className="h-5 w-16" />
              <SkeletonBlock className="h-5 w-20" />
            </div>
            <SkeletonBlock className="h-3 w-20 shrink-0" />
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <SkeletonBlock className="h-5 w-24" />
            <SkeletonBlock className="h-5 w-20" />
            <SkeletonBlock className="h-3 w-28" />
            <SkeletonBlock className="h-3 w-20" />
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            <SkeletonBlock className="h-3 w-36" />
            <SkeletonBlock className="h-3 w-24" />
          </div>
        </li>
      ))}
    </ul>
  );
}

/**
 * Tracking-route rows shared by the VN section's code and data fallbacks.
 *
 * @param label Optional localized loading announcement.
 * @returns Three placeholders matching checkbox, title, date, and actions.
 */
export function RouteRowsSkeleton({ label }: { label?: string }): ReactElement {
  return (
    <ul
      role="status"
      aria-busy
      aria-live="polite"
      className="space-y-2"
      data-route-rows-skeleton
    >
      <LoadingLabel label={label} />
      {Array.from({ length: 3 }).map((_, index) => (
        <li key={index} data-route-row-skeleton className="rounded-lg border border-border bg-bg-elev/30">
          <div data-route-row-skeleton-shell className="flex min-h-[44px] items-center gap-2 px-3 py-2">
            <SkeletonBlock className="h-6 w-6 shrink-0" />
            <SkeletonBlock className={index % 2 === 0 ? 'h-3 flex-1 max-w-72' : 'h-3 flex-1 max-w-52'} />
            <SkeletonBlock className="hidden h-2.5 w-16 shrink-0 sm:block" />
            <div className="flex shrink-0 items-center gap-1.5">
              {Array.from({ length: 5 }).map((_, actionIndex) => (
                <SkeletonBlock key={actionIndex} className="h-6 w-6" />
              ))}
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}
