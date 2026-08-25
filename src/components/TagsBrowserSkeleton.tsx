import { SkeletonBlock } from './Skeleton';

/**
 * Preserve the flat tag-result anatomy while a local or filtered VNDB query is pending.
 *
 * @param label Optional loading announcement for assistive technology.
 * @returns A density-aware category heading and tag-card placeholder grid.
 */
export function TagFlatResultsSkeleton({ label }: { label?: string }) {
  return (
    <div aria-busy="true" aria-live="polite" role="status" data-tag-flat-results-skeleton>
      {label && <span className="sr-only">{label}</span>}
      <div className="mb-2 flex items-center gap-2">
        <SkeletonBlock className="h-6 w-24" />
        <SkeletonBlock className="h-3 w-8" />
      </div>
      <div
        className="grid gap-3"
        style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, var(--card-density-px, 220px)), 1fr))' }}
      >
        {Array.from({ length: 12 }).map((_, index) => (
          <article key={index} className="relative min-h-[112px] rounded-xl border border-border bg-bg-card p-4">
            <SkeletonBlock className="h-4 w-2/3" />
            <SkeletonBlock className="mt-2 h-3 w-4/5" />
            <SkeletonBlock className="mt-1.5 h-3 w-3/5" />
            <div className="mt-2 flex items-center gap-2">
              <SkeletonBlock className="h-3 w-20" />
              <SkeletonBlock className="ml-auto h-3 w-3" />
            </div>
            <SkeletonBlock className="absolute right-3 top-3 h-11 w-11 rounded-md can-hover:sm:h-6 can-hover:sm:w-16" />
          </article>
        ))}
      </div>
    </div>
  );
}
