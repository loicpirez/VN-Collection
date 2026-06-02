'use client';
import { useId, useRef } from 'react';
import type { useT } from '@/lib/i18n/client';
import { DialogPortal, useDialogA11y } from '../Dialog';

type TDict = ReturnType<typeof useT>;

/**
 * Confirmation dialog for the destructive "clear cache" action on the stock
 * panel. Rendered only while the operator has the confirm prompt open, so it is
 * lazy-loaded (`next/dynamic`) by `StockPanel` and never ships in the initial
 * panel chunk.
 */
export function ClearCacheModal({
  t,
  onCancel,
  onConfirm,
}: {
  t: TDict;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement | null>(null);
  useDialogA11y({ open: true, onClose: onCancel, panelRef });
  return (
    <DialogPortal>
      <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4">
        <button
          type="button"
          aria-label={t.common.close as string}
          tabIndex={-1}
          className="absolute inset-0 cursor-default bg-black/60"
          onClick={onCancel}
        />
        <div
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          tabIndex={-1}
          className="relative w-full max-w-sm rounded-xl border border-border bg-bg-card p-4 shadow-xl outline-none"
        >
        <h2 id={titleId} className="text-sm font-bold text-white">
          {t.stock.clearCache as string}
        </h2>
        <p className="mt-2 text-xs text-muted">{t.stock.clearCacheConfirm as string}</p>
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="min-h-[44px] rounded-md border border-border bg-bg px-3 py-1.5 text-xs font-semibold text-muted hover:border-accent hover:text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
          >
            {t.common.cancel as string}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="min-h-[44px] rounded-md border border-status-dropped/50 bg-status-dropped/15 px-3 py-1.5 text-xs font-bold text-status-dropped hover:bg-status-dropped/25 focus-visible:outline focus-visible:outline-2 focus-visible:outline-status-dropped"
          >
            {t.stock.clearCache as string}
          </button>
        </div>
        </div>
      </div>
    </DialogPortal>
  );
}
