'use client';
import { ImageUp } from 'lucide-react';
import { useT } from '@/lib/i18n/client';

/**
 * Small always-tappable "Change cover" button rendered on top of the
 * cover image itself. Dispatches the `vn:open-cover-picker` custom
 * event so the CoverSourcePicker modal (which lives further down the
 * page) opens straight to the **Custom** tab - the upload entry-point.
 *
 * Visible on desktop only. Compact viewports use the single artwork
 * action in the VN toolbar, keeping controls off the cover itself.
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
      className="card-action-overlay absolute right-2 top-2 z-10 hidden min-h-[44px] min-w-[44px] items-center justify-center gap-1 rounded-md bg-black/70 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-white shadow-card backdrop-blur hover:bg-accent hover:text-bg md:inline-flex can-hover:sm:min-h-[36px]"
    >
      <ImageUp className="h-3.5 w-3.5" aria-hidden />
      <span>{t.coverPicker.open}</span>
    </button>
  );
}
