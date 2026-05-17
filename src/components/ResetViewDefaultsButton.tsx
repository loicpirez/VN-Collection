'use client';
import { RotateCcw } from 'lucide-react';
import { type DensityScope, useDisplaySettings } from '@/lib/settings/client';
import { useT } from '@/lib/i18n/client';

/**
 * "Reset view" button — clears the per-page density override AND
 * invokes a caller-supplied callback that wipes the page's filters,
 * sort, group, etc. The caller owns the URL-state clear because
 * every listing page builds its own search-param vocabulary.
 *
 * Mount next to the scoped `<CardDensitySlider scope="…">`.
 */
export function ResetViewDefaultsButton({
  scope,
  onClearUrlState,
  className = '',
}: {
  scope: DensityScope;
  /**
   * Page-supplied callback that clears every URL param it cares
   * about. Implementations typically call `router.replace(pathname,
   * { scroll: false })`.
   */
  onClearUrlState?: () => void;
  className?: string;
}) {
  const t = useT();
  const { settings, set } = useDisplaySettings();

  const handleClick = () => {
    if (settings.density?.[scope] != null) {
      const next = { ...(settings.density ?? {}) };
      delete next[scope];
      set('density', next);
    }
    onClearUrlState?.();
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      title={t.cardDensity.resetViewTitle}
      aria-label={t.cardDensity.resetView}
      className={`inline-flex items-center gap-1 rounded-md border border-border bg-bg-elev/40 px-2 py-1 text-[11px] text-muted hover:border-accent hover:text-accent ${className}`}
    >
      <RotateCcw className="h-3 w-3" aria-hidden />
      <span>{t.cardDensity.resetView}</span>
    </button>
  );
}
