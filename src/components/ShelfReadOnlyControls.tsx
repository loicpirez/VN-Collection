'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { RotateCcw, Sliders, X } from 'lucide-react';
import { useT } from '@/lib/i18n/client';
import {
  SHELF_VIEW_PREFS_BOUNDS,
  SHELF_VIEW_PREFS_EVENT,
  defaultShelfViewPrefsV1,
  shelfViewPrefsCssVars,
  type ShelfViewPrefsV1,
  validateShelfViewPrefsV1,
} from '@/lib/shelf-view-prefs';

interface Props {
  initialPrefs: ShelfViewPrefsV1;
  /** Optional override id used when several shelves render on one page. */
  id?: string;
}

/**
 * Discreet display-only knobs for the read-only shelf views
 * (`/shelf` spatial / release / item plus the fullscreen variant).
 *
 * Renders a slider trigger that opens a popover with four controls
 * (cell size, cover scale, gap, fit mode) plus a Reset button. The
 * values apply via CSS variables on a wrapper element so the grid
 * cells react instantly without a full re-render. Persistence is via
 * `PATCH /api/settings` against the `shelf_view_prefs_v1` key.
 *
 * Important: physical placement data (`shelf_slot`, `shelf_display_slot`)
 * never moves through this component. It only governs the rendering
 * dimensions. Resizing the slider on /shelf?view=item must not write
 * to either placement table.
 */
export function ShelfReadOnlyControls({ initialPrefs, id = 'default' }: Props) {
  const t = useT();
  const dict = t.shelfDisplay;
  const [prefs, setPrefs] = useState<ShelfViewPrefsV1>(initialPrefs);
  const [open, setOpen] = useState(false);
  const popRef = useRef<HTMLDivElement>(null);

  // Apply the CSS vars to the body so any wrapper below
  // `.shelf-view-root` reacts. Cleaning up on unmount keeps a leftover
  // var from leaking to other surfaces (the user navigates to /vn/[id]
  // where the variables aren't relevant).
  useEffect(() => {
    const css = shelfViewPrefsCssVars(prefs);
    const targets = document.querySelectorAll<HTMLElement>('.shelf-view-root');
    for (const el of targets) {
      for (const [k, v] of Object.entries(css)) el.style.setProperty(k, v);
      el.dataset.shelfFit = prefs.fitMode;
    }
    return () => {
      for (const el of targets) {
        for (const k of Object.keys(css)) el.style.removeProperty(k);
        delete el.dataset.shelfFit;
      }
    };
  }, [prefs]);

  // Sync with cross-tab / Settings-modal changes.
  useEffect(() => {
    function onChange(e: Event) {
      const detail = (e as CustomEvent<{ prefs?: ShelfViewPrefsV1 }>).detail;
      if (detail?.prefs) setPrefs(detail.prefs);
    }
    window.addEventListener(SHELF_VIEW_PREFS_EVENT, onChange);
    return () => window.removeEventListener(SHELF_VIEW_PREFS_EVENT, onChange);
  }, []);

  // Close on outside click / Escape.
  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (!popRef.current) return;
      if (!popRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const persist = useCallback(async (next: ShelfViewPrefsV1) => {
    const normalized = validateShelfViewPrefsV1(next);
    setPrefs(normalized);
    window.dispatchEvent(
      new CustomEvent(SHELF_VIEW_PREFS_EVENT, { detail: { prefs: normalized } }),
    );
    try {
      await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shelf_view_prefs_v1: normalized }),
      });
    } catch {
      // Silent — the live values already applied via CSS variables.
      // A failure here just means the next reload reverts.
    }
  }, []);

  const reset = useCallback(() => {
    void persist(defaultShelfViewPrefsV1());
  }, [persist]);

  return (
    <div className="relative inline-flex" data-shelf-controls-id={id}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        title={dict.title}
        className="tap-target-tight inline-flex items-center gap-1 rounded-md border border-border bg-bg-elev/40 px-2 py-1 text-[11px] text-muted hover:border-accent hover:text-accent"
      >
        <Sliders className="h-3.5 w-3.5" aria-hidden />
        <span className="hidden sm:inline">{dict.title}</span>
      </button>
      {open && (
        <div
          ref={popRef}
          role="dialog"
          aria-label={dict.title}
          className="absolute right-0 top-full z-30 mt-2 w-72 rounded-xl border border-border bg-bg-card p-3 shadow-card"
        >
          <header className="mb-2 flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-widest text-muted">{dict.title}</h3>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label={t.common.cancel}
              className="tap-target-tight inline-flex h-6 w-6 items-center justify-center rounded text-muted hover:text-white"
            >
              <X className="h-3.5 w-3.5" aria-hidden />
            </button>
          </header>

          <Slider
            label={dict.cellSize}
            value={prefs.cellSizePx}
            min={SHELF_VIEW_PREFS_BOUNDS.cellSizePx.min}
            max={SHELF_VIEW_PREFS_BOUNDS.cellSizePx.max}
            step={4}
            suffix="px"
            onChange={(n) => void persist({ ...prefs, cellSizePx: n })}
          />
          <Slider
            label={dict.coverScale}
            value={prefs.coverScale}
            min={SHELF_VIEW_PREFS_BOUNDS.coverScale.min}
            max={SHELF_VIEW_PREFS_BOUNDS.coverScale.max}
            step={0.05}
            suffix="×"
            onChange={(n) => void persist({ ...prefs, coverScale: Number(n.toFixed(2)) })}
          />
          <Slider
            label={dict.gap}
            value={prefs.gapPx}
            min={SHELF_VIEW_PREFS_BOUNDS.gapPx.min}
            max={SHELF_VIEW_PREFS_BOUNDS.gapPx.max}
            step={1}
            suffix="px"
            onChange={(n) => void persist({ ...prefs, gapPx: n })}
          />

          <div className="mt-3">
            <div className="mb-1 text-[10px] uppercase tracking-widest text-muted">
              {dict.fitModeContain} / {dict.fitModeCover}
            </div>
            <div className="inline-flex overflow-hidden rounded-md border border-border">
              <button
                type="button"
                onClick={() => void persist({ ...prefs, fitMode: 'contain' })}
                aria-pressed={prefs.fitMode === 'contain'}
                className={`px-3 py-1 text-xs ${
                  prefs.fitMode === 'contain'
                    ? 'bg-accent text-bg'
                    : 'bg-bg-elev/40 text-muted hover:text-white'
                }`}
              >
                {dict.fitModeContain}
              </button>
              <button
                type="button"
                onClick={() => void persist({ ...prefs, fitMode: 'cover' })}
                aria-pressed={prefs.fitMode === 'cover'}
                className={`px-3 py-1 text-xs ${
                  prefs.fitMode === 'cover'
                    ? 'bg-accent text-bg'
                    : 'bg-bg-elev/40 text-muted hover:text-white'
                }`}
              >
                {dict.fitModeCover}
              </button>
            </div>
          </div>

          <button
            type="button"
            onClick={reset}
            className="mt-3 inline-flex items-center gap-1 rounded-md border border-border bg-bg-elev/40 px-2 py-1 text-[11px] text-muted hover:border-status-on_hold hover:text-status-on_hold"
          >
            <RotateCcw className="h-3 w-3" aria-hidden /> {dict.reset}
          </button>
        </div>
      )}
    </div>
  );
}

function Slider({
  label,
  value,
  min,
  max,
  step,
  suffix,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  suffix: string;
  onChange: (n: number) => void;
}) {
  return (
    <label className="mt-2 block">
      <div className="mb-1 flex items-center justify-between text-[11px] text-muted">
        <span>{label}</span>
        <span className="tabular-nums text-white">
          {value}
          {suffix}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-accent"
      />
    </label>
  );
}
