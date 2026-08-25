'use client';

import { DialogPortal } from '../Dialog';
import { SkeletonBlock } from '../Skeleton';
import { useT } from '@/lib/i18n/client';

/**
 * Loading surface shown while the destructive stock-cache dialog chunk loads.
 *
 * @returns A modal-shaped, non-interactive placeholder in the modal layer.
 */
export function ClearCacheModalSkeleton() {
  const t = useT();

  return (
    <DialogPortal>
      <div
        className="fixed inset-0 z-layer-modal flex items-center justify-center p-4"
        role="status"
        aria-live="polite"
        aria-busy="true"
        data-clear-cache-modal-skeleton
      >
        <span className="absolute inset-0 bg-black/60" aria-hidden="true" />
        <span className="sr-only">{t.app.loading}</span>
        <div className="relative w-full max-w-sm rounded-xl border border-border bg-bg-card p-4 shadow-xl">
          <SkeletonBlock className="h-4 w-28" />
          <div className="mt-2 space-y-2">
            <SkeletonBlock className="h-3 w-full" />
            <SkeletonBlock className="h-3 w-4/5" />
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <SkeletonBlock className="h-11 w-20 rounded-md" />
            <SkeletonBlock className="h-11 w-28 rounded-md" />
          </div>
        </div>
      </div>
    </DialogPortal>
  );
}
