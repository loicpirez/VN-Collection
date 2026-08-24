'use client';

import dynamic from 'next/dynamic';
import { useEffect, useState } from 'react';
import type { BannerSourcePickerProps } from './BannerSourcePicker';
import type { CoverSourcePickerProps } from './CoverSourcePicker';

const LazyCoverSourcePicker = dynamic<CoverSourcePickerProps>(
  () => import('./CoverSourcePicker').then((module) => module.CoverSourcePicker),
  { ssr: false },
);

const LazyBannerSourcePicker = dynamic<BannerSourcePickerProps>(
  () => import('./BannerSourcePicker').then((module) => module.BannerSourcePicker),
  { ssr: false },
);

interface LazyArtworkPickersProps {
  /** Props retained for the cover picker until its first explicit open request. */
  cover: Omit<CoverSourcePickerProps, 'initialOpen' | 'showTrigger'>;
  /** Props retained for the banner picker until its first explicit open request. */
  banner: Omit<BannerSourcePickerProps, 'initialOpen' | 'showTrigger'>;
}

type ActivePicker = 'cover' | 'banner' | null;

/**
 * Keep rich artwork dialogs out of the initial VN-detail client graph.
 *
 * The lightweight triggers dispatch scoped events. This owner catches the first
 * event before the dynamic chunk exists, mounts only the requested picker, and
 * asks it to open immediately. Later requests are handled by the mounted picker.
 */
export function LazyArtworkPickers({ cover, banner }: LazyArtworkPickersProps) {
  const vnId = cover.vnId;
  const [active, setActive] = useState<ActivePicker>(null);

  useEffect(() => {
    setActive(null);
    const belongsToCurrentVn = (event: Event): boolean => {
      const eventVnId = (event as CustomEvent<{ vnId?: string }>).detail?.vnId;
      return !eventVnId || eventVnId === vnId;
    };
    const openCover = (event: Event) => {
      if (belongsToCurrentVn(event)) setActive('cover');
    };
    const openBanner = (event: Event) => {
      if (belongsToCurrentVn(event)) setActive('banner');
    };
    window.addEventListener('vn:open-cover-picker', openCover);
    window.addEventListener('vn:open-banner-picker', openBanner);
    return () => {
      window.removeEventListener('vn:open-cover-picker', openCover);
      window.removeEventListener('vn:open-banner-picker', openBanner);
    };
  }, [vnId]);

  return (
    <>
      {active === 'cover' ? (
        <LazyCoverSourcePicker {...cover} showTrigger={false} initialOpen />
      ) : null}
      {active === 'banner' ? (
        <LazyBannerSourcePicker {...banner} showTrigger={false} initialOpen />
      ) : null}
    </>
  );
}
