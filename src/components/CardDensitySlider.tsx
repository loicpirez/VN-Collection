'use client';
import { useId } from 'react';
import { LayoutGrid, Maximize2, Minimize2 } from 'lucide-react';
import {
  CARD_DENSITY_MAX,
  CARD_DENSITY_MIN,
  clampCardDensity,
  useDisplaySettings,
} from '@/lib/settings/client';
import { useT } from '@/lib/i18n/client';

/**
 * Slider controlling the min cell width of every shared multi-VN grid.
 *
 * The value flows into a grid-template-columns rule via
 * `cardGridColumns(cardDensityPx)`. Smaller value -> more columns ->
 * denser display. The pref is persisted to localStorage + cookie via
 * `useDisplaySettings()` so it's instantly picked up by the server on
 * the next navigation (no flash-of-different-density on load).
 *
 * Used on /wishlist, /recommendations, /top-ranked, /upcoming, /dumped,
 * /egs, /similar (and any future card grid that uses the same wrapper).
 * The library has its own dedicated dense toggle; this slider doesn't
 * touch that one.
 */
export function CardDensitySlider({ className = '' }: { className?: string }) {
  const t = useT();
  const { settings, set } = useDisplaySettings();
  const id = useId();
  const value = clampCardDensity(settings.cardDensityPx);

  return (
    <div className={`inline-flex items-center gap-2 rounded-md border border-border bg-bg-elev/40 px-2 py-1 text-[11px] ${className}`}>
      <label htmlFor={id} className="inline-flex items-center gap-1 text-muted">
        <LayoutGrid className="h-3 w-3" aria-hidden />
        <span>{t.cardDensity.label}</span>
      </label>
      <button
        type="button"
        onClick={() => set('cardDensityPx', clampCardDensity(value - 20))}
        aria-label={t.cardDensity.denser}
        title={t.cardDensity.denser}
        className="tap-target-tight rounded p-1 text-muted hover:text-accent"
      >
        <Minimize2 className="h-3 w-3" aria-hidden />
      </button>
      <input
        id={id}
        type="range"
        min={CARD_DENSITY_MIN}
        max={CARD_DENSITY_MAX}
        step={10}
        value={value}
        onChange={(e) => set('cardDensityPx', clampCardDensity(Number(e.target.value)))}
        aria-valuemin={CARD_DENSITY_MIN}
        aria-valuemax={CARD_DENSITY_MAX}
        aria-valuenow={value}
        aria-label={t.cardDensity.label}
        className="h-1.5 w-28 cursor-pointer accent-accent"
      />
      <button
        type="button"
        onClick={() => set('cardDensityPx', clampCardDensity(value + 20))}
        aria-label={t.cardDensity.larger}
        title={t.cardDensity.larger}
        className="tap-target-tight rounded p-1 text-muted hover:text-accent"
      >
        <Maximize2 className="h-3 w-3" aria-hidden />
      </button>
      <span className="ml-0.5 w-9 text-right text-[10px] tabular-nums text-muted">
        {value}px
      </span>
    </div>
  );
}

/**
 * Returns a CSS grid-template-columns string with the user's card
 * density applied. Use this in `style={{ gridTemplateColumns: ... }}`
 * for any grid that consumes the shared density pref.
 */
export function cardGridColumns(densityPx: number, fill: 'auto-fill' | 'auto-fit' = 'auto-fill'): string {
  const safe = clampCardDensity(densityPx);
  // `min(100%, …)` ensures the cell never exceeds the container's
  // available width on narrow viewports — without it, a slider at
  // 480px would force a horizontal scroll on a 360px phone.
  return `repeat(${fill}, minmax(min(100%, ${safe}px), 1fr))`;
}
