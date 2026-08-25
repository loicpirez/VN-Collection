import type { ReactElement } from 'react';
import { SkeletonBlock, SkeletonBoundary } from './Skeleton';

interface SteamSkeletonProps {
  label: string;
}

/**
 * Render pending Steam playtime suggestions and their batch actions.
 *
 * @param props Localized loading announcement.
 * @returns Five selectable-row placeholders and the final action footer.
 */
export function SteamSuggestionsSkeleton({ label }: SteamSkeletonProps): ReactElement {
  return (
    <div role="status" aria-busy aria-live="polite" data-steam-suggestions-skeleton>
      <span className="sr-only">{label}</span>
      <ul className="space-y-1.5">
        {Array.from({ length: 5 }).map((_, index) => (
          <li key={index} className="flex items-center gap-3 rounded-lg border border-border bg-bg-elev/30 p-2">
            <SkeletonBlock className="h-5 w-5 shrink-0" />
            <div className="min-w-0 flex-1 space-y-2">
              <SkeletonBlock className={index % 2 === 0 ? 'h-4 w-2/3' : 'h-4 w-1/2'} />
              <SkeletonBlock className="h-3 w-1/2" />
            </div>
            <div className="shrink-0 space-y-1.5">
              <SkeletonBlock className="h-3 w-24" />
              <SkeletonBlock className="ml-auto h-2.5 w-12" />
            </div>
          </li>
        ))}
      </ul>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
        <SkeletonBlock className="h-3 w-32" />
        <div className="flex gap-2">
          <SkeletonBlock className="h-11 w-24" />
          <SkeletonBlock className="h-11 w-28" />
        </div>
      </div>
    </div>
  );
}

/**
 * Render the complete pending list of stored Steam-to-VN links.
 *
 * @param props Localized loading announcement.
 * @returns A framed two-column mapping grid matching the resolved section.
 */
export function SteamLinksSectionSkeleton({ label }: SteamSkeletonProps): ReactElement {
  return (
    <section
      role="status"
      aria-busy
      aria-live="polite"
      className="mb-8 rounded-xl border border-border bg-bg-card p-4 sm:p-5"
      data-steam-section-skeleton="links"
    >
      <span className="sr-only">{label}</span>
      <SkeletonBlock className="mb-3 h-3 w-32" />
      <ul className="grid gap-1.5 sm:grid-cols-2">
        {Array.from({ length: 6 }).map((_, index) => (
          <li key={index} className="flex min-h-[60px] items-center justify-between gap-2 rounded-md border border-border bg-bg-elev/30 p-2">
            <div className="min-w-0 flex-1 space-y-1.5">
              <SkeletonBlock className="h-3 w-20" />
              <SkeletonBlock className={index % 2 === 0 ? 'h-2.5 w-28' : 'h-2.5 w-20'} />
            </div>
            <SkeletonBlock className="h-5 w-14 shrink-0" />
            <SkeletonBlock className="h-11 w-11 shrink-0" />
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * Render pending unlinked Steam games with their manual-search controls.
 *
 * @param props Localized loading announcement.
 * @returns Five game rows preserving title metadata and the search field.
 */
export function SteamUnlinkedRowsSkeleton({ label }: SteamSkeletonProps): ReactElement {
  return (
    <ul role="status" aria-busy aria-live="polite" className="space-y-2" data-steam-unlinked-skeleton>
      <li className="sr-only">{label}</li>
      {Array.from({ length: 5 }).map((_, index) => (
        <li key={index} className="rounded-lg border border-border bg-bg-elev/30 p-3">
          <div className="flex items-center justify-between gap-3">
            <SkeletonBlock className={index % 2 === 0 ? 'h-4 w-1/2' : 'h-4 w-2/3'} />
            <SkeletonBlock className="h-3 w-20" />
          </div>
          <div className="mt-2 flex items-start gap-2">
            <SkeletonBlock className="h-11 flex-1" />
            <SkeletonBlock className="h-4 w-4 shrink-0" />
          </div>
        </li>
      ))}
    </ul>
  );
}

/**
 * Render the complete Steam route while its client page resolves.
 *
 * @param props Localized loading announcement.
 * @returns Header and all three destination-shaped Steam workflow sections.
 */
export function SteamPageSkeleton({ label }: SteamSkeletonProps): ReactElement {
  return (
    <SkeletonBoundary label={label} className="w-full">
      <SkeletonBlock className="mb-4 h-11 w-28 md:hidden" />
      <header className="mb-6 rounded-2xl border border-border bg-bg-card p-4 sm:p-6" data-steam-header-skeleton>
        <div className="flex items-center gap-2">
          <SkeletonBlock className="h-6 w-6 shrink-0" />
          <SkeletonBlock className="h-7 w-44" />
        </div>
        <SkeletonBlock className="mt-3 h-3 w-96 max-w-full" />
      </header>

      <section className="mb-8 rounded-xl border border-border bg-bg-card p-4 sm:p-5" data-steam-section-skeleton="suggestions">
        <SkeletonBlock className="mb-3 h-3 w-36" />
        <SteamSuggestionsSkeleton label={label} />
      </section>

      <SteamLinksSectionSkeleton label={label} />

      <section className="rounded-xl border border-border bg-bg-card p-4 sm:p-5" data-steam-section-skeleton="unlinked">
        <SkeletonBlock className="h-3 w-36" />
        <SkeletonBlock className="mb-3 mt-3 h-3 w-3/4 max-w-full" />
        <SteamUnlinkedRowsSkeleton label={label} />
      </section>
    </SkeletonBoundary>
  );
}
