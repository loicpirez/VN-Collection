'use client';

import { DialogPortal } from '../Dialog';
import { SkeletonBlock, SkeletonBoundary } from '../Skeleton';
import { useT } from '@/lib/i18n/client';

/**
 * Preserve the AliceNet remapping dialog while its client-only module loads.
 *
 * @returns A body-level, destination-shaped loading dialog.
 */
export function AliceNetLinkDialogSkeleton() {
  const t = useT();
  return (
    <DialogPortal>
      <div className="fixed inset-0 z-layer-modal flex items-center justify-center" data-alicenet-link-dialog-skeleton>
        <div className="absolute inset-0 bg-bg/80 backdrop-blur" aria-hidden />
        <div className="relative max-h-[85vh] w-[min(92vw,640px)] rounded-2xl border border-border bg-bg-card p-4 shadow-card sm:p-5">
          <SkeletonBoundary label={t.common.loading}>
            <header className="mb-3 flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1 space-y-2">
                <SkeletonBlock className="h-5 w-40" />
                <SkeletonBlock className="h-2.5 w-3/4" />
              </div>
              <SkeletonBlock className="h-11 w-11 shrink-0 rounded-md" />
            </header>
            <SkeletonBlock className="mb-3 h-11 w-full rounded-md" />
            <ul className="mb-3 space-y-1">
              {Array.from({ length: 3 }).map((_, index) => (
                <li key={index} className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-bg-elev/30 px-3 py-2">
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <SkeletonBlock className="h-3 w-2/3" />
                    <SkeletonBlock className="h-2.5 w-1/2" />
                  </div>
                  <SkeletonBlock className="h-11 w-11 shrink-0 rounded-md" />
                  <SkeletonBlock className="h-11 w-24 shrink-0 rounded-md" />
                </li>
              ))}
            </ul>
            <footer className="flex justify-end border-t border-border pt-3">
              <SkeletonBlock className="h-11 w-28 rounded-md" />
            </footer>
          </SkeletonBoundary>
        </div>
      </div>
    </DialogPortal>
  );
}
