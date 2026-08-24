'use client';
import { ImageIcon } from 'lucide-react';
import { useT } from '@/lib/i18n/client';

interface Props {
  /** VN identity carried by the shared picker-open event. */
  vnId: string;
  /** Button classes supplied by the surrounding artwork surface. */
  className: string;
  /** Optional surface-specific visible label. */
  label?: string;
}

/** Open the resident banner picker without owning its dialog lifecycle. */
export function BannerPickerTrigger({ vnId, className, label }: Props) {
  const t = useT();
  return (
    <button
      type="button"
      onPointerEnter={() => { void import('./BannerSourcePicker'); }}
      onFocus={() => { void import('./BannerSourcePicker'); }}
      onClick={() => {
        window.dispatchEvent(new CustomEvent('vn:open-banner-picker', { detail: { vnId } }));
      }}
      className={className}
      title={t.bannerPicker.openTitle}
    >
      <ImageIcon className="h-4 w-4" aria-hidden />
      {label ?? t.bannerPicker.open}
    </button>
  );
}
