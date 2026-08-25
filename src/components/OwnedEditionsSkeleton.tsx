import type { ReactElement } from 'react';
import { SkeletonBlock } from './Skeleton';

interface OwnedEditionsSkeletonProps {
  label: string;
}

/**
 * Render owned-edition cards while ownership and release metadata resolve.
 *
 * @param props Localized loading announcement.
 * @returns The add action and two edition rows with cover, metadata, and tools.
 */
export function OwnedEditionsSkeleton({ label }: OwnedEditionsSkeletonProps): ReactElement {
  return (
    <div role="status" aria-busy aria-live="polite" data-owned-editions-skeleton>
      <span className="sr-only">{label}</span>
      <header className="flex items-center justify-end px-4 py-4 sm:px-6">
        <SkeletonBlock className="h-11 w-32" />
      </header>
      <ul className="divide-y divide-border">
        {Array.from({ length: 2 }).map((_, index) => (
          <li key={index} className="px-4 py-4 sm:px-6" data-owned-edition-row-skeleton>
            <div className="flex gap-4">
              <div className="w-24 shrink-0">
                <SkeletonBlock className="aspect-[2/3] w-full rounded-md" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0 flex-1 space-y-2">
                    <SkeletonBlock className={index === 0 ? 'h-4 w-3/4' : 'h-4 w-1/2'} />
                    <div className="flex flex-wrap items-center gap-2">
                      <SkeletonBlock className="h-3 w-20" />
                      <SkeletonBlock className="h-5 w-8" />
                      <SkeletonBlock className="h-3 w-16" />
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    {Array.from({ length: 3 }).map((_, actionIndex) => (
                      <SkeletonBlock key={actionIndex} className="h-7 w-7" />
                    ))}
                  </div>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3">
                  {Array.from({ length: 5 }).map((_, fieldIndex) => (
                    <div key={fieldIndex} className="space-y-1">
                      <SkeletonBlock className="h-2.5 w-16" />
                      <SkeletonBlock className={fieldIndex % 2 === 0 ? 'h-3 w-20' : 'h-3 w-14'} />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
