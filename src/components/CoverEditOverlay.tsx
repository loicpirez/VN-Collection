'use client';
import { ImageUp } from 'lucide-react';
import { useT } from '@/lib/i18n/client';

/**
 * Small always-tappable "Change cover" button rendered on top of the
 * cover image itself. Dispatches the `vn:open-cover-picker` custom
 * event so the CoverSourcePicker modal (which lives further down the
 * page) opens straight to the **Custom** tab — the upload entry-point.
 *
 * Visible on desktop only on hover; fully tap-target on touch devices
 * (per mobile/tablet parity rule — no `hidden sm:inline` traps).
 */
export function CoverEditOverlay({ vnId }: { vnId: string }) {
  const t = useT();
  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        window.dispatchEvent(new CustomEvent('vn:open-cover-picker', { detail: { vnId } }));
      }}
      title={t.coverPicker.openTitle}
      aria-label={t.coverPicker.open}
      className="absolute right-2 top-2 z-30 inline-flex items-center gap-1 rounded-md bg-black/70 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-white shadow-card backdrop-blur transition-opacity hover:bg-accent hover:text-bg sm:opacity-70 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100"
    >
      <ImageUp className="h-3.5 w-3.5" aria-hidden />
      {t.coverPicker.open}
    </button>
  );
}
