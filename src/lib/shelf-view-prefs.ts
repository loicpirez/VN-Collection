/**
 * Versioned persistence shape for the read-only shelf views (spatial,
 * release, item, fullscreen). These are display-only knobs separate
 * from the physical placement data — they live in
 * `app_setting.shelf_view_prefs_v1`. Resizing the slider must NOT
 * mutate `shelf_slot` / `shelf_display_slot`.
 *
 * Pure data / validator. The component in
 * `src/components/ShelfReadOnlyControls.tsx` consumes this directly.
 *
 * Pin range justification:
 *   - cellSizePx 60..280: 60 keeps a label readable on a 2:3 cover at
 *     scale=1; 280 keeps eight columns on a 1920px viewport.
 *   - coverScale 0.5..1.5: linear scale of the cover within the cell.
 *     Above 1.5 the cover clips the cell border; below 0.5 the label
 *     dominates.
 *   - gapPx 0..24: 0 = "tight catalog grid"; 24 = "breathing room".
 *   - fitMode: contain (no crop, letterbox if needed) vs cover
 *     (crop to fill).
 */

export interface ShelfViewPrefsV1 {
  cellSizePx: number;
  coverScale: number;
  gapPx: number;
  fitMode: 'contain' | 'cover';
}

export const SHELF_VIEW_PREFS_BOUNDS = {
  cellSizePx: { min: 60, max: 280 },
  coverScale: { min: 0.5, max: 1.5 },
  gapPx: { min: 0, max: 24 },
} as const;

export function defaultShelfViewPrefsV1(): ShelfViewPrefsV1 {
  return { cellSizePx: 140, coverScale: 1, gapPx: 8, fitMode: 'contain' };
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

export function validateShelfViewPrefsV1(input: unknown): ShelfViewPrefsV1 {
  const fallback = defaultShelfViewPrefsV1();
  if (!input || typeof input !== 'object' || Array.isArray(input)) return fallback;
  const obj = input as Record<string, unknown>;
  const cell = typeof obj.cellSizePx === 'number'
    ? clamp(obj.cellSizePx, SHELF_VIEW_PREFS_BOUNDS.cellSizePx.min, SHELF_VIEW_PREFS_BOUNDS.cellSizePx.max)
    : fallback.cellSizePx;
  const scale = typeof obj.coverScale === 'number'
    ? clamp(obj.coverScale, SHELF_VIEW_PREFS_BOUNDS.coverScale.min, SHELF_VIEW_PREFS_BOUNDS.coverScale.max)
    : fallback.coverScale;
  const gap = typeof obj.gapPx === 'number'
    ? clamp(obj.gapPx, SHELF_VIEW_PREFS_BOUNDS.gapPx.min, SHELF_VIEW_PREFS_BOUNDS.gapPx.max)
    : fallback.gapPx;
  const fitMode = obj.fitMode === 'cover' ? 'cover' : 'contain';
  return { cellSizePx: cell, coverScale: scale, gapPx: gap, fitMode };
}

export function parseShelfViewPrefsV1(raw: string | null): ShelfViewPrefsV1 {
  if (!raw) return defaultShelfViewPrefsV1();
  try {
    return validateShelfViewPrefsV1(JSON.parse(raw));
  } catch {
    return defaultShelfViewPrefsV1();
  }
}

/**
 * Convert the prefs to the CSS variable triplet consumed by the
 * shelf-view wrappers. Kept here so the component layer doesn't need
 * to re-derive the keys.
 */
export function shelfViewPrefsCssVars(prefs: ShelfViewPrefsV1): Record<string, string> {
  return {
    '--shelf-cell-px': `${prefs.cellSizePx}px`,
    '--shelf-cover-scale': String(prefs.coverScale),
    '--shelf-gap-px': `${prefs.gapPx}px`,
  };
}

/** Event broadcast after a successful PATCH so siblings re-sync. */
export const SHELF_VIEW_PREFS_EVENT = 'shelf:view-prefs-changed';
