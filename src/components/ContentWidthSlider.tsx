'use client';
import { useId } from 'react';
import { Columns2, Maximize2, Minimize2, RotateCcw } from 'lucide-react';
import {
  PAGE_WIDTH_MIN,
  PAGE_WIDTH_MAX,
  clampPageWidth,
  type DensityScope,
  useDisplaySettings,
} from '@/lib/settings/client';
import { useT } from '@/lib/i18n/client';

/**
 * Slider controlling the max content width (left/right margin) for a
 * single surface. Writes `settings.pageWidth[scope]`; the value is
 * consumed by `DensityScopeProvider` as an inline `maxWidth` style so
 * each page can have its own width without affecting others.
 *
 * When no custom value is set the Tailwind `max-w-*` class on the page
 * stays in effect — no override is applied at all, so the default CSS
 * class controls the width exactly as before.
 */
export function ContentWidthSlider({
  scope,
  className = '',
  defaultPx = 1152,
}: {
  scope: DensityScope;
  className?: string;
  defaultPx?: number;
}) {
  const t = useT();
  const { settings, set } = useDisplaySettings();
  const id = useId();
  const raw = settings.pageWidth?.[scope];
  const hasCustom = typeof raw === 'number' && Number.isFinite(raw);
  const value = hasCustom ? clampPageWidth(raw) : defaultPx;

  const writeScoped = (n: number) => {
    set('pageWidth', { ...(settings.pageWidth ?? {}), [scope]: clampPageWidth(n) });
  };

  const clearScoped = () => {
    const next = { ...(settings.pageWidth ?? {}) };
    delete next[scope];
    set('pageWidth', next);
  };

  const followsDefaultTitle = t.contentWidth.followsDefault;
  const customTitle = t.contentWidth.customOverride;

  return (
    <div
      className={`inline-flex items-center gap-2 rounded-md border border-border bg-bg-elev/40 px-2 py-1 text-[11px] ${className}`}
      title={hasCustom ? customTitle : followsDefaultTitle}
    >
      <label htmlFor={id} className="inline-flex items-center gap-1 text-muted">
        <Columns2 className="h-3 w-3" aria-hidden />
        <span>{t.contentWidth.label}</span>
        {hasCustom && (
          <span
            className="ml-1 inline-flex items-center rounded-full border border-accent/40 bg-accent/10 px-1 py-0 text-[9px] font-semibold text-accent"
            title={customTitle}
          >
            {t.contentWidth.customOverrideChip}
          </span>
        )}
      </label>
      <button
        type="button"
        onClick={() => writeScoped(value - 80)}
        aria-label={t.contentWidth.narrower}
        title={t.contentWidth.narrower}
        className="tap-target-tight rounded p-1 text-muted hover:text-accent"
      >
        <Minimize2 className="h-3 w-3" aria-hidden />
      </button>
      <input
        id={id}
        type="range"
        min={PAGE_WIDTH_MIN}
        max={PAGE_WIDTH_MAX}
        step={40}
        value={value}
        onChange={(e) => writeScoped(Number(e.target.value))}
        aria-valuemin={PAGE_WIDTH_MIN}
        aria-valuemax={PAGE_WIDTH_MAX}
        aria-valuenow={value}
        aria-label={t.contentWidth.label}
        className="h-1.5 w-28 cursor-pointer accent-accent"
      />
      <button
        type="button"
        onClick={() => writeScoped(value + 80)}
        aria-label={t.contentWidth.wider}
        title={t.contentWidth.wider}
        className="tap-target-tight rounded p-1 text-muted hover:text-accent"
      >
        <Maximize2 className="h-3 w-3" aria-hidden />
      </button>
      <span className="ml-0.5 w-12 text-right text-[10px] tabular-nums text-muted">
        {hasCustom ? `${value}px` : t.contentWidth.auto}
      </span>
      <button
        type="button"
        onClick={clearScoped}
        disabled={!hasCustom}
        aria-label={t.contentWidth.reset}
        title={t.contentWidth.reset}
        className="tap-target-tight rounded p-1 text-muted hover:text-accent disabled:opacity-30 disabled:hover:text-muted"
      >
        <RotateCcw className="h-3 w-3" aria-hidden />
      </button>
    </div>
  );
}
