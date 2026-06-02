'use client';
import { ImagePlus } from 'lucide-react';
import { useT } from '@/lib/i18n/client';

interface Props {
  /** VN identity carried by the shared picker-open event. */
  vnId: string;
  /** Button classes supplied by the surrounding action surface. */
  className: string;
}

/**
 * Opens the resident VN cover picker from a secondary action surface.
 *
 * @param props - VN identity and surface-specific button classes.
 * @returns A menu-safe trigger that delegates dialog ownership to the resident picker.
 */
export function CoverPickerTrigger({ vnId, className }: Props) {
  const t = useT();
  return (
    <button
      type="button"
      onClick={() => {
        window.dispatchEvent(new CustomEvent('vn:open-cover-picker', { detail: { vnId } }));
      }}
      className={className}
      title={t.coverPicker.openTitle}
      data-menu-keep-open=""
    >
      <ImagePlus className="h-4 w-4" aria-hidden />
      {t.coverPicker.open}
    </button>
  );
}
