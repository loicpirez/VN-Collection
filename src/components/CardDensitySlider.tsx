'use client';
import { useId } from 'react';
import { useSearchParams } from 'next/navigation';
import { LayoutGrid, Maximize2, Minimize2, RotateCcw } from 'lucide-react';
import {
  CARD_DENSITY_DEFAULT,
  CARD_DENSITY_MAX,
  CARD_DENSITY_MIN,
  type DensityScope,
  clampCardDensity,
  resolveScopedDensity,
  useDisplaySettings,
} from '@/lib/settings/client';
import { useT } from '@/lib/i18n/client';

/**
 * Slider controlling the min cell width of the listing grid on a
 * SINGLE surface. The `scope` prop identifies which slot in
 * `settings.density` this slider reads / writes, so changing the
 * value here does NOT bleed into other pages.
 *
 * The value flows into a grid-template-columns rule via
 * `cardGridColumns(density)`. Smaller value -> more columns ->
 * denser display. The pref is persisted to localStorage + cookie via
 * `useDisplaySettings()` so it's instantly picked up by the server on
 * the next navigation (no flash-of-different-density on load).
 *
 * URL override: when a `?density=N` search param is present, the
 * slider reflects that value and (because the URL win-out is read
 * inside `resolveScopedDensity`) writes will simply update the
 * scoped setting — the URL param continues to override on subsequent
 * reads until the user removes it. Shareable views aren't disrupted.
 */
export function CardDensitySlider({
  scope,
  className = '',
  showHint = false,
}: {
  scope: DensityScope;
  className?: string;
  /** Render the scope-specific hint copy alongside the slider. */
  showHint?: boolean;
}) {
  const t = useT();
  const { settings, set } = useDisplaySettings();
  const search = useSearchParams();
  const id = useId();
  const urlDensity = search?.get('density') ?? null;
  const value = resolveScopedDensity(settings, scope, urlDensity);
  const scoped = settings.density?.[scope];
  // The Reset button clears the scoped override and lets the value
  // fall back to `cardDensityPx`. Disable when there's nothing to
  // reset (no scoped key) AND the active value already matches the
  // default so the user gets immediate visual feedback.
  const canReset = scoped != null;

  const writeScoped = (next: number) => {
    const clamped = clampCardDensity(next);
    set('density', { ...(settings.density ?? {}), [scope]: clamped });
  };

  const clearScoped = () => {
    const nextDensity = { ...(settings.density ?? {}) };
    delete nextDensity[scope];
    set('density', nextDensity);
  };

  // Surface the "custom vs fallback" state to the operator. When the
  // scope has its own override we render a small chip + tooltip the
  // wrapper with "Override actif"; when it inherits we tooltip "Suit
  // la valeur par défaut" so the user understands the slider edits a
  // per-page slot, not a global default.
  const followsDefaultTitle = t.cardDensity.followsDefault;
  const customTitle = t.cardDensity.customOverride;
  return (
    <div
      className={`inline-flex items-center gap-2 rounded-md border border-border bg-bg-elev/40 px-2 py-1 text-[11px] ${className}`}
      title={canReset ? customTitle : followsDefaultTitle}
    >
      <label htmlFor={id} className="inline-flex items-center gap-1 text-muted">
        <LayoutGrid className="h-3 w-3" aria-hidden />
        <span>{t.cardDensity.label}</span>
        {canReset && (
          <span
            className="ml-1 inline-flex items-center rounded-full border border-accent/40 bg-accent/10 px-1 py-0 text-[9px] font-semibold text-accent"
            title={customTitle}
          >
            {t.cardDensity.customOverrideChip}
          </span>
        )}
      </label>
      <button
        type="button"
        onClick={() => writeScoped(value - 20)}
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
        onChange={(e) => writeScoped(Number(e.target.value))}
        aria-valuemin={CARD_DENSITY_MIN}
        aria-valuemax={CARD_DENSITY_MAX}
        aria-valuenow={value}
        aria-label={t.cardDensity.label}
        className="h-1.5 w-28 cursor-pointer accent-accent"
      />
      <button
        type="button"
        onClick={() => writeScoped(value + 20)}
        aria-label={t.cardDensity.larger}
        title={t.cardDensity.larger}
        className="tap-target-tight rounded p-1 text-muted hover:text-accent"
      >
        <Maximize2 className="h-3 w-3" aria-hidden />
      </button>
      <span className="ml-0.5 w-9 text-right text-[10px] tabular-nums text-muted">
        {value}px
      </span>
      {/*
        Reset clears the scoped override so the value falls back to
        the global default. Disabled when there's no override stored
        for this scope.
      */}
      <button
        type="button"
        onClick={() => {
          if (canReset) clearScoped();
          else set('cardDensityPx', CARD_DENSITY_DEFAULT);
        }}
        disabled={!canReset && value === CARD_DENSITY_DEFAULT}
        aria-label={t.cardDensity.reset}
        title={t.cardDensity.reset}
        className="tap-target-tight rounded p-1 text-muted hover:text-accent disabled:opacity-30 disabled:hover:text-muted"
      >
        <RotateCcw className="h-3 w-3" aria-hidden />
      </button>
      {showHint && (
        <span className="ml-1 hidden text-[10px] text-muted/80 lg:inline">
          {t.cardDensity.scopeHint}
        </span>
      )}
    </div>
  );
}

/**
 * Slider that edits the legacy global default (`cardDensityPx`).
 * Used by the Settings → Display panel — every scope without an
 * explicit override falls back to this value, so dialing it gives
 * users a global baseline without forcing each surface's slider.
 *
 * The scoped slider (`<CardDensitySlider scope=…>`) is what every
 * listing page mounts.
 */
export function GlobalCardDensitySlider({ className = '' }: { className?: string }) {
  const t = useT();
  const { settings, set } = useDisplaySettings();
  const id = useId();
  const value = clampCardDensity(settings.cardDensityPx);
  return (
    <div
      className={`inline-flex items-center gap-2 rounded-md border border-border bg-bg-elev/40 px-2 py-1 text-[11px] ${className}`}
    >
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
      <button
        type="button"
        onClick={() => set('cardDensityPx', CARD_DENSITY_DEFAULT)}
        disabled={value === CARD_DENSITY_DEFAULT}
        aria-label={t.cardDensity.reset}
        title={t.cardDensity.reset}
        className="tap-target-tight rounded p-1 text-muted hover:text-accent disabled:opacity-30 disabled:hover:text-muted"
      >
        <RotateCcw className="h-3 w-3" aria-hidden />
      </button>
    </div>
  );
}

/**
 * Returns a CSS grid-template-columns string with the given density.
 * Use this in `style={{ gridTemplateColumns: ... }}` for grids on
 * client surfaces that already resolve the scoped value through
 * `resolveScopedDensity()` — pass the resolved px value, not the raw
 * `cardDensityPx` setting (that would leak the legacy global).
 */
export function cardGridColumns(densityPx: number, fill: 'auto-fill' | 'auto-fit' = 'auto-fill'): string {
  const safe = clampCardDensity(densityPx);
  // `min(100%, …)` ensures the cell never exceeds the container's
  // available width on narrow viewports — without it, a slider at
  // 480px would force a horizontal scroll on a 360px phone.
  return `repeat(${fill}, minmax(min(100%, ${safe}px), 1fr))`;
}
