import { SkeletonBlock } from './Skeleton';

/**
 * Preserve the trait-card anatomy while a local or filtered query is pending.
 *
 * @param label Optional loading announcement for assistive technology.
 * @returns A density-aware grid of trait-card placeholders.
 */
export function TraitResultsSkeleton({ label }: { label?: string }) {
  return (
    <div
      aria-busy="true"
      aria-live="polite"
      role="status"
      data-traits-results-skeleton
    >
      {label && <span className="sr-only">{label}</span>}
      <div
        className="grid gap-3"
        style={{
          gridTemplateColumns:
            'repeat(auto-fill, minmax(min(100%, var(--card-density-px, 220px)), 1fr))',
        }}
      >
        {Array.from({ length: 12 }).map((_, index) => (
          <article key={index} className="rounded-xl border border-border bg-bg-card p-4">
            <div className="flex items-start justify-between gap-3">
              <SkeletonBlock className="h-4 w-2/3" />
              {index % 4 === 0 && <SkeletonBlock className="h-5 w-10 shrink-0" />}
            </div>
            <SkeletonBlock className="mt-2 h-3 w-full" />
            <SkeletonBlock className="mt-1.5 h-3 w-4/5" />
            <SkeletonBlock className="mt-2 h-3 w-20" />
          </article>
        ))}
      </div>
    </div>
  );
}
