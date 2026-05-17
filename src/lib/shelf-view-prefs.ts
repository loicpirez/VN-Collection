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
 * Pin range justification (numeric clamps, all enforced by the
 * validator so a malicious PATCH cannot write out-of-range values):
 *   - cellWidthPx / cellHeightPx 60..280: 60 keeps a label readable
 *     on a 2:3 cover at scale=1; 280 keeps eight columns on a 1920px
 *     viewport. Width and height split out so 4:3 / 3:4 / 16:9
 *     overrides can tune each axis independently.
 *   - rowGapPx 0..24: 0 = "tight catalog grid"; 24 = "breathing room".
 *   - sectionGapPx 0..64: spacing between Top Display / shelf rows /
 *     Bottom Display sections (the outer `space-y-*` band).
 *   - coverScale 0.5..1.5: linear scale of the cover within the cell.
 *   - frontDisplaySizePx 60..280: width of a face-out (front display)
 *     tile in `shelf_display_slot`.
 *   - textDensity sm | md | lg: label font size / line-height tier.
 *   - showLabels: hides cover overlays / under-cover labels entirely.
 *   - compact: tighter inter-cell padding for catalog-style browsing.
 *   - fitMode: contain (no crop, letterbox if needed) vs cover
 *     (crop to fill). Kept from v0; no longer the only sizing lever.
 *
 * V0 backwards compatibility: a payload that carries `cellSizePx` /
 * `gapPx` but no `cellWidthPx` (the v0 shape) is migrated by copying
 * `cellSizePx` → both `cellWidthPx` and `cellHeightPx` and `gapPx` →
 * `rowGapPx`. No schema version bump — the validator handles both
 * shapes transparently so existing stored values keep working.
 */

export type ShelfTextDensity = 'sm' | 'md' | 'lg';

export interface ShelfViewPrefsV1 {
  // V0 keys kept for back-compat — read+written by the validator so
  // existing stored payloads round-trip unchanged.
  cellSizePx: number;
  coverScale: number;
  gapPx: number;
  fitMode: 'contain' | 'cover';
  // V1 extensions — all numeric clamped, defaults documented.
  cellWidthPx: number;
  cellHeightPx: number;
  rowGapPx: number;
  sectionGapPx: number;
  frontDisplaySizePx: number;
  textDensity: ShelfTextDensity;
  showLabels: boolean;
  compact: boolean;
}

export const SHELF_VIEW_PREFS_BOUNDS = {
  cellSizePx: { min: 60, max: 280 },
  coverScale: { min: 0.5, max: 1.5 },
  gapPx: { min: 0, max: 24 },
  cellWidthPx: { min: 60, max: 280 },
  cellHeightPx: { min: 60, max: 280 },
  rowGapPx: { min: 0, max: 24 },
  sectionGapPx: { min: 0, max: 64 },
  frontDisplaySizePx: { min: 60, max: 280 },
} as const;

export const SHELF_TEXT_DENSITIES: readonly ShelfTextDensity[] = ['sm', 'md', 'lg'];

export function defaultShelfViewPrefsV1(): ShelfViewPrefsV1 {
  return {
    cellSizePx: 140,
    coverScale: 1,
    gapPx: 8,
    fitMode: 'contain',
    cellWidthPx: 120,
    cellHeightPx: 180,
    rowGapPx: 6,
    sectionGapPx: 16,
    frontDisplaySizePx: 140,
    textDensity: 'md',
    showLabels: true,
    compact: false,
  };
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

function pickNumber(
  obj: Record<string, unknown>,
  key: string,
  bounds: { min: number; max: number },
  fallback: number,
): number {
  const raw = obj[key];
  if (typeof raw !== 'number') return fallback;
  return clamp(raw, bounds.min, bounds.max);
}

function pickBool(obj: Record<string, unknown>, key: string, fallback: boolean): boolean {
  const raw = obj[key];
  return typeof raw === 'boolean' ? raw : fallback;
}

function pickTextDensity(obj: Record<string, unknown>, fallback: ShelfTextDensity): ShelfTextDensity {
  const raw = obj.textDensity;
  return raw === 'sm' || raw === 'md' || raw === 'lg' ? raw : fallback;
}

export function validateShelfViewPrefsV1(input: unknown): ShelfViewPrefsV1 {
  const fallback = defaultShelfViewPrefsV1();
  if (!input || typeof input !== 'object' || Array.isArray(input)) return fallback;
  const obj = input as Record<string, unknown>;

  // V0 migration shim — accept a payload that only carries cellSizePx /
  // gapPx (no cellWidthPx / cellHeightPx) and copy those values onto
  // the new axis fields so existing stored prefs render unchanged.
  const hasV1Width = typeof obj.cellWidthPx === 'number';
  const hasV0Cell = typeof obj.cellSizePx === 'number';
  const v0CellMigrated = !hasV1Width && hasV0Cell
    ? clamp(
        obj.cellSizePx as number,
        SHELF_VIEW_PREFS_BOUNDS.cellSizePx.min,
        SHELF_VIEW_PREFS_BOUNDS.cellSizePx.max,
      )
    : null;
  const hasV1RowGap = typeof obj.rowGapPx === 'number';
  const hasV0Gap = typeof obj.gapPx === 'number';
  const v0GapMigrated = !hasV1RowGap && hasV0Gap
    ? clamp(
        obj.gapPx as number,
        SHELF_VIEW_PREFS_BOUNDS.gapPx.min,
        SHELF_VIEW_PREFS_BOUNDS.gapPx.max,
      )
    : null;

  const cell = pickNumber(obj, 'cellSizePx', SHELF_VIEW_PREFS_BOUNDS.cellSizePx, fallback.cellSizePx);
  const scale = pickNumber(obj, 'coverScale', SHELF_VIEW_PREFS_BOUNDS.coverScale, fallback.coverScale);
  const gap = pickNumber(obj, 'gapPx', SHELF_VIEW_PREFS_BOUNDS.gapPx, fallback.gapPx);
  const fitMode = obj.fitMode === 'cover' ? 'cover' : 'contain';

  const cellWidth = v0CellMigrated ?? pickNumber(
    obj,
    'cellWidthPx',
    SHELF_VIEW_PREFS_BOUNDS.cellWidthPx,
    fallback.cellWidthPx,
  );
  const cellHeight = v0CellMigrated ?? pickNumber(
    obj,
    'cellHeightPx',
    SHELF_VIEW_PREFS_BOUNDS.cellHeightPx,
    fallback.cellHeightPx,
  );
  const rowGap = v0GapMigrated ?? pickNumber(
    obj,
    'rowGapPx',
    SHELF_VIEW_PREFS_BOUNDS.rowGapPx,
    fallback.rowGapPx,
  );
  const sectionGap = pickNumber(
    obj,
    'sectionGapPx',
    SHELF_VIEW_PREFS_BOUNDS.sectionGapPx,
    fallback.sectionGapPx,
  );
  const frontDisplaySize = pickNumber(
    obj,
    'frontDisplaySizePx',
    SHELF_VIEW_PREFS_BOUNDS.frontDisplaySizePx,
    fallback.frontDisplaySizePx,
  );
  const textDensity = pickTextDensity(obj, fallback.textDensity);
  const showLabels = pickBool(obj, 'showLabels', fallback.showLabels);
  const compact = pickBool(obj, 'compact', fallback.compact);

  return {
    cellSizePx: cell,
    coverScale: scale,
    gapPx: gap,
    fitMode,
    cellWidthPx: cellWidth,
    cellHeightPx: cellHeight,
    rowGapPx: rowGap,
    sectionGapPx: sectionGap,
    frontDisplaySizePx: frontDisplaySize,
    textDensity,
    showLabels,
    compact,
  };
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
 * Convert the prefs to the CSS variable set consumed by the shelf-view
 * wrappers. Kept here so the component layer doesn't need to re-derive
 * the keys. Returns both the v0 vars (kept so any legacy consumer in
 * the tree still reads them) and the v1 axis-specific vars.
 */
export function shelfViewPrefsCssVars(prefs: ShelfViewPrefsV1): Record<string, string> {
  return {
    '--shelf-cell-px': `${prefs.cellSizePx}px`,
    '--shelf-cover-scale': String(prefs.coverScale),
    '--shelf-gap-px': `${prefs.gapPx}px`,
    '--shelf-cell-w-px': `${prefs.cellWidthPx}px`,
    '--shelf-cell-h-px': `${prefs.cellHeightPx}px`,
    '--shelf-row-gap-px': `${prefs.rowGapPx}px`,
    '--shelf-section-gap-px': `${prefs.sectionGapPx}px`,
    '--shelf-front-size-px': `${prefs.frontDisplaySizePx}px`,
    '--shelf-fit-mode': prefs.fitMode,
    '--shelf-card-pad': prefs.compact ? '1px' : '3px',
    '--shelf-label-font-px': prefs.textDensity === 'sm' ? '9px' : prefs.textDensity === 'lg' ? '12px' : '10px',
  };
}

/**
 * Companion to `shelfViewPrefsCssVars` — the data-* attributes that
 * Tailwind selectors gate label visibility / compact mode / font
 * tier on. Returned as a plain object so callers can spread into
 * `dataset` or render directly on the JSX.
 */
export function shelfViewPrefsDataAttrs(prefs: ShelfViewPrefsV1): Record<string, string> {
  return {
    'data-shelf-labels': prefs.showLabels ? 'on' : 'off',
    'data-shelf-compact': prefs.compact ? 'on' : 'off',
    'data-shelf-text-density': prefs.textDensity,
    'data-shelf-fit': prefs.fitMode,
  };
}

/** Event broadcast after a successful PATCH so siblings re-sync. */
export const SHELF_VIEW_PREFS_EVENT = 'shelf:view-prefs-changed';
