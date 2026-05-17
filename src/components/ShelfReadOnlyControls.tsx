'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { RotateCcw, Sliders, X } from 'lucide-react';
import { useT } from '@/lib/i18n/client';
import {
  SHELF_DISPLAY_OVERRIDES_EVENT,
  SHELF_VIEW_PREFS_BOUNDS,
  SHELF_TEXT_DENSITIES,
  SHELF_VIEW_PREFS_EVENT,
  defaultShelfDisplayOverridesV1,
  defaultShelfViewPrefsV1,
  resolveShelfPrefs,
  shelfHasOverride,
  shelfViewPrefsDataAttrs,
  shelfViewPrefsCssVars,
  type ShelfDisplayOverridesV1,
  type ShelfViewPrefsV1,
  type ShelfTextDensity,
  validateShelfViewPrefsV1,
} from '@/lib/shelf-view-prefs';

interface Props {
  initialPrefs: ShelfViewPrefsV1;
  /** Optional override id used when several shelves render on one page. */
  id?: string;
  /**
   * When the host is showing a specific shelf (the spatial view's
   * "current shelf"), pass the shelf id + name so the controls
   * can offer a "Per-shelf override" mode. When omitted, the
   * controls operate in global mode only — back-compat with the
   * release/item views that don't have a single active shelf.
   */
  activeShelfId?: string;
  activeShelfName?: string;
  /**
   * The server-rendered hierarchy payload (global + per-shelf
   * partials). The controls read this once on mount and persist
   * back to the same key.
   */
  initialOverrides?: ShelfDisplayOverridesV1;
}

type Scope = 'global' | 'shelf';

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
export function ShelfReadOnlyControls({
  initialPrefs,
  id = 'default',
  activeShelfId,
  activeShelfName,
  initialOverrides,
}: Props) {
  const t = useT();
  const dict = t.shelfDisplay;
  // Hierarchy state. `overrides.global` is the live global; the
  // per-shelf row (if any) layers over it. `scope` decides which
  // path a slider write hits. When `activeShelfId` is omitted, only
  // the global scope is reachable and the selector is hidden.
  const [overrides, setOverrides] = useState<ShelfDisplayOverridesV1>(
    initialOverrides ?? { global: initialPrefs, shelves: {} },
  );
  const [scope, setScope] = useState<Scope>('global');
  // `prefs` is the EFFECTIVE prefs visible in the sliders. Derived
  // from overrides + scope so a single source of truth.
  const prefs = useMemo<ShelfViewPrefsV1>(() => {
    if (scope === 'shelf' && activeShelfId) {
      return resolveShelfPrefs(overrides, activeShelfId);
    }
    return overrides.global;
  }, [scope, overrides, activeShelfId]);
  const hasOverride = activeShelfId ? shelfHasOverride(overrides, activeShelfId) : false;
  const [open, setOpen] = useState(false);
  const popRef = useRef<HTMLDivElement>(null);

  // Apply the EFFECTIVE prefs to `.shelf-view-root`. The per-shelf
  // override is captured by `prefs` so when the user is editing a
  // shelf, the sliders affect THAT shelf only — other shelves remain
  // on global defaults (when the operator navigates between shelves
  // via the prev/next links, the next page render mounts this
  // component with a different activeShelfId).
  useEffect(() => {
    const css = shelfViewPrefsCssVars(prefs);
    const attrs = shelfViewPrefsDataAttrs(prefs);
    const targets = document.querySelectorAll<HTMLElement>('.shelf-view-root');
    for (const el of targets) {
      for (const [k, v] of Object.entries(css)) el.style.setProperty(k, v);
      for (const [k, v] of Object.entries(attrs)) {
        el.setAttribute(k, v);
      }
    }
    return () => {
      for (const el of targets) {
        for (const k of Object.keys(css)) el.style.removeProperty(k);
        for (const k of Object.keys(attrs)) el.removeAttribute(k);
      }
    };
  }, [prefs]);

  // Sync with cross-tab / Settings-modal changes. Two events:
  //   - SHELF_VIEW_PREFS_EVENT — legacy global-only path; still
  //     fired by the Settings modal so we update the `global` slot.
  //   - SHELF_DISPLAY_OVERRIDES_EVENT — the new hierarchy event
  //     fired by this very component when it PATCHes the wrapped
  //     payload. Listeners on other tabs / mounted instances of
  //     this same component (e.g. inside Settings) keep in sync.
  useEffect(() => {
    function onGlobal(e: Event) {
      const detail = (e as CustomEvent<{ prefs?: ShelfViewPrefsV1 }>).detail;
      if (detail?.prefs) {
        setOverrides((prev) => ({ ...prev, global: detail.prefs! }));
      }
    }
    function onHierarchy(e: Event) {
      const detail = (e as CustomEvent<{ overrides?: ShelfDisplayOverridesV1 }>).detail;
      if (detail?.overrides) setOverrides(detail.overrides);
    }
    window.addEventListener(SHELF_VIEW_PREFS_EVENT, onGlobal);
    window.addEventListener(SHELF_DISPLAY_OVERRIDES_EVENT, onHierarchy);
    return () => {
      window.removeEventListener(SHELF_VIEW_PREFS_EVENT, onGlobal);
      window.removeEventListener(SHELF_DISPLAY_OVERRIDES_EVENT, onHierarchy);
    };
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

  /**
   * Persist a prefs payload. Routes through the right key based on
   * the active scope: global writes update `shelf_view_prefs_v1`
   * (legacy compat) AND the wrapped `shelf_display_overrides_v1.global`
   * so both surfaces stay in sync. Per-shelf writes only touch the
   * wrapped key — they cannot regress the global.
   */
  const persist = useCallback(
    async (next: ShelfViewPrefsV1) => {
      const normalized = validateShelfViewPrefsV1(next);
      if (scope === 'shelf' && activeShelfId) {
        // Compute the new per-shelf partial: only the keys whose value
        // diverges from the global are persisted, so a reset (=
        // matching global) naturally produces `{}` which the API
        // route drops from `shelves`.
        const partial: Partial<ShelfViewPrefsV1> = {};
        for (const k of Object.keys(normalized) as Array<keyof ShelfViewPrefsV1>) {
          if (normalized[k] !== overrides.global[k]) {
            // Cast through unknown to satisfy the indexed write — the
            // key-by-key copy is sound because k is constrained to
            // ShelfViewPrefsV1's own keys.
            (partial as Record<string, unknown>)[k as string] = normalized[k];
          }
        }
        const nextOverrides: ShelfDisplayOverridesV1 = {
          global: overrides.global,
          shelves: { ...overrides.shelves, [activeShelfId]: partial },
        };
        if (Object.keys(partial).length === 0) {
          delete nextOverrides.shelves[activeShelfId];
        }
        setOverrides(nextOverrides);
        window.dispatchEvent(
          new CustomEvent(SHELF_DISPLAY_OVERRIDES_EVENT, {
            detail: { overrides: nextOverrides },
          }),
        );
        try {
          await fetch('/api/settings', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              shelf_display_overrides_v1: {
                shelves: { [activeShelfId]: partial },
              },
            }),
          });
        } catch {
          // Silent — CSS vars already applied.
        }
        return;
      }
      // Global scope (default). Patch both keys so legacy consumers
      // that only read `shelf_view_prefs_v1` see the change too.
      const nextOverrides: ShelfDisplayOverridesV1 = {
        global: normalized,
        shelves: overrides.shelves,
      };
      setOverrides(nextOverrides);
      window.dispatchEvent(
        new CustomEvent(SHELF_VIEW_PREFS_EVENT, { detail: { prefs: normalized } }),
      );
      window.dispatchEvent(
        new CustomEvent(SHELF_DISPLAY_OVERRIDES_EVENT, {
          detail: { overrides: nextOverrides },
        }),
      );
      try {
        await fetch('/api/settings', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            shelf_view_prefs_v1: normalized,
            shelf_display_overrides_v1: { global: normalized },
          }),
        });
      } catch {
        // Silent — CSS vars already applied.
      }
    },
    [scope, activeShelfId, overrides],
  );

  /**
   * Reset semantics:
   *   - Global scope → restore the canonical defaults.
   *   - Shelf scope  → drop the per-shelf partial so the shelf
   *     falls back to the global.
   */
  const reset = useCallback(() => {
    if (scope === 'shelf' && activeShelfId) {
      const { [activeShelfId]: _drop, ...rest } = overrides.shelves;
      void _drop;
      const nextOverrides: ShelfDisplayOverridesV1 = { global: overrides.global, shelves: rest };
      setOverrides(nextOverrides);
      window.dispatchEvent(
        new CustomEvent(SHELF_DISPLAY_OVERRIDES_EVENT, {
          detail: { overrides: nextOverrides },
        }),
      );
      // Send an empty partial; the API route's shallow-merge keeps
      // the global intact and drops the empty entry.
      void fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          shelf_display_overrides_v1: {
            shelves: { [activeShelfId]: {} },
          },
        }),
      }).catch(() => undefined);
      return;
    }
    void persist(defaultShelfViewPrefsV1());
  }, [scope, activeShelfId, overrides, persist]);

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
          {/*
            Scope selector — only mounted when the host page knows
            which shelf is currently active. The release / item views
            don't have a "current shelf" so they only ever edit the
            global; in that case the scope selector is omitted.
          */}
          {activeShelfId && (
            <div className="mb-3 flex flex-col gap-1 rounded-md border border-border bg-bg-elev/40 p-2 text-[11px]">
              <div className="flex items-center gap-1 text-muted">
                <span className="font-bold uppercase tracking-widest text-[10px]">
                  {dict.scopeLabel}
                </span>
                {hasOverride && scope === 'shelf' && (
                  <span className="rounded bg-accent/15 px-1 text-[9px] font-semibold uppercase tracking-wider text-accent">
                    {dict.overrideBadge}
                  </span>
                )}
              </div>
              <div className="inline-flex overflow-hidden rounded-md border border-border">
                <button
                  type="button"
                  onClick={() => setScope('global')}
                  aria-pressed={scope === 'global'}
                  className={`flex-1 px-2 py-1 text-xs ${
                    scope === 'global'
                      ? 'bg-accent text-bg font-semibold'
                      : 'bg-bg-elev/40 text-muted hover:text-white'
                  }`}
                >
                  {dict.scopeGlobal}
                </button>
                <button
                  type="button"
                  onClick={() => setScope('shelf')}
                  aria-pressed={scope === 'shelf'}
                  className={`flex-1 px-2 py-1 text-xs ${
                    scope === 'shelf'
                      ? 'bg-accent text-bg font-semibold'
                      : 'bg-bg-elev/40 text-muted hover:text-white'
                  }`}
                  title={activeShelfName ?? undefined}
                >
                  {activeShelfName
                    ? dict.scopeThisShelfNamed.replace('{name}', activeShelfName)
                    : dict.scopeThisShelf}
                </button>
              </div>
            </div>
          )}

          <div className="grid gap-x-3 sm:grid-cols-2">
            <Slider
              label={dict.cellWidth}
              value={prefs.cellWidthPx}
              min={SHELF_VIEW_PREFS_BOUNDS.cellWidthPx.min}
              max={SHELF_VIEW_PREFS_BOUNDS.cellWidthPx.max}
              step={4}
              suffix="px"
              onChange={(n) => void persist({ ...prefs, cellWidthPx: n, cellSizePx: n })}
            />
            <Slider
              label={dict.cellHeight}
              value={prefs.cellHeightPx}
              min={SHELF_VIEW_PREFS_BOUNDS.cellHeightPx.min}
              max={SHELF_VIEW_PREFS_BOUNDS.cellHeightPx.max}
              step={4}
              suffix="px"
              onChange={(n) => void persist({ ...prefs, cellHeightPx: n })}
            />
          </div>
          <Slider
            label={dict.coverScale}
            value={prefs.coverScale}
            min={SHELF_VIEW_PREFS_BOUNDS.coverScale.min}
            max={SHELF_VIEW_PREFS_BOUNDS.coverScale.max}
            step={0.05}
            suffix="×"
            onChange={(n) => void persist({ ...prefs, coverScale: Number(n.toFixed(2)) })}
          />
          <div className="grid gap-x-3 sm:grid-cols-2">
            <Slider
              label={dict.rowGap}
              value={prefs.rowGapPx}
              min={SHELF_VIEW_PREFS_BOUNDS.rowGapPx.min}
              max={SHELF_VIEW_PREFS_BOUNDS.rowGapPx.max}
              step={1}
              suffix="px"
              onChange={(n) => void persist({ ...prefs, rowGapPx: n, gapPx: n })}
            />
            <Slider
              label={dict.sectionGap}
              value={prefs.sectionGapPx}
              min={SHELF_VIEW_PREFS_BOUNDS.sectionGapPx.min}
              max={SHELF_VIEW_PREFS_BOUNDS.sectionGapPx.max}
              step={2}
              suffix="px"
              onChange={(n) => void persist({ ...prefs, sectionGapPx: n })}
            />
          </div>
          <Slider
            label={dict.frontDisplaySize}
            value={prefs.frontDisplaySizePx}
            min={SHELF_VIEW_PREFS_BOUNDS.frontDisplaySizePx.min}
            max={SHELF_VIEW_PREFS_BOUNDS.frontDisplaySizePx.max}
            step={4}
            suffix="px"
            onChange={(n) => void persist({ ...prefs, frontDisplaySizePx: n })}
          />

          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <Toggle
              label={dict.showLabels}
              pressed={prefs.showLabels}
              onClick={() => void persist({ ...prefs, showLabels: !prefs.showLabels })}
            />
            <Toggle
              label={dict.compact}
              pressed={prefs.compact}
              onClick={() => void persist({ ...prefs, compact: !prefs.compact })}
            />
          </div>
          <div className="mt-3">
            <div className="mb-1 text-[10px] uppercase tracking-widest text-muted">{dict.textDensity}</div>
            <div className="inline-flex overflow-hidden rounded-md border border-border">
              {SHELF_TEXT_DENSITIES.map((density) => (
                <button
                  key={density}
                  type="button"
                  onClick={() => void persist({ ...prefs, textDensity: density as ShelfTextDensity })}
                  aria-pressed={prefs.textDensity === density}
                  className={`px-3 py-1 text-xs ${
                    prefs.textDensity === density
                      ? 'bg-accent text-bg'
                      : 'bg-bg-elev/40 text-muted hover:text-white'
                  }`}
                >
                  {dict.textDensityValues[density]}
                </button>
              ))}
            </div>
          </div>

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

function Toggle({
  label,
  pressed,
  onClick,
}: {
  label: string;
  pressed: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={`rounded-md border px-2 py-1 text-left text-[11px] ${
        pressed
          ? 'border-accent bg-accent/10 text-accent'
          : 'border-border bg-bg-elev/40 text-muted hover:text-white'
      }`}
    >
      {label}
    </button>
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
