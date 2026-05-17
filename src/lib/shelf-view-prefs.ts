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

// ─────────────────────────────────────────────────────────────────
// Hierarchy (item 13 in the operator's continuation prompt).
//
// `shelf_display_overrides_v1` is a NEW persisted key that wraps
// the global `ShelfViewPrefsV1` plus an optional per-shelf override
// map keyed on `shelf_unit.id`. The hierarchy is intentionally
// shallow (global → per-shelf) — per-row overrides were called
// out as "do not implement until wired" in the operator's spec.
//
// Back-compat: the older `shelf_view_prefs_v1` key keeps working
// in isolation; `parseShelfDisplayOverridesV1` accepts either the
// new wrapping shape OR a legacy flat payload and migrates it
// into `{global, shelves}`. The renderer always asks for an
// *effective* prefs object via `resolveShelfPrefs(global, shelfId,
// overrides)`.
// ─────────────────────────────────────────────────────────────────

export interface ShelfDisplayOverridesV1 {
  global: ShelfViewPrefsV1;
  /**
   * Per-shelf override map. Each value is a *partial* prefs
   * payload; the resolver layers it over `global` so the operator
   * can override only the fields they care about. An empty object
   * is treated as "no override" (back to global).
   */
  shelves: Record<string, Partial<ShelfViewPrefsV1>>;
}

export function defaultShelfDisplayOverridesV1(): ShelfDisplayOverridesV1 {
  return { global: defaultShelfViewPrefsV1(), shelves: {} };
}

/**
 * Validate the wrapped overrides payload, tolerating both the new
 * `{global, shelves}` shape AND a flat legacy
 * `ShelfViewPrefsV1` payload (which becomes the `global`).
 */
export function validateShelfDisplayOverridesV1(input: unknown): ShelfDisplayOverridesV1 {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return defaultShelfDisplayOverridesV1();
  }
  const obj = input as Record<string, unknown>;
  // Legacy / flat shape — the whole object IS the global prefs.
  const looksWrapped =
    obj.global !== undefined || obj.shelves !== undefined;
  if (!looksWrapped) {
    return {
      global: validateShelfViewPrefsV1(input),
      shelves: {},
    };
  }
  const global = validateShelfViewPrefsV1(obj.global);
  const rawShelves =
    obj.shelves && typeof obj.shelves === 'object' && !Array.isArray(obj.shelves)
      ? (obj.shelves as Record<string, unknown>)
      : {};
  const shelves: Record<string, Partial<ShelfViewPrefsV1>> = {};
  for (const [shelfId, raw] of Object.entries(rawShelves)) {
    if (!shelfId || typeof shelfId !== 'string') continue;
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
    const partial = pickPartialShelfPrefs(raw as Record<string, unknown>);
    // Drop empty partials so a "reset to global" PATCH that sent
    // `{}` doesn't keep the entry around.
    if (Object.keys(partial).length === 0) continue;
    shelves[shelfId] = partial;
  }
  return { global, shelves };
}

/**
 * Project a raw record into a partial prefs payload, dropping
 * unknown keys and clamping numerics. Used by the per-shelf
 * override path so the persisted blob can never escape the
 * documented schema.
 */
function pickPartialShelfPrefs(raw: Record<string, unknown>): Partial<ShelfViewPrefsV1> {
  const out: Partial<ShelfViewPrefsV1> = {};
  const num = (key: keyof typeof SHELF_VIEW_PREFS_BOUNDS) => {
    const v = raw[key];
    if (typeof v !== 'number') return;
    out[key] = clamp(v, SHELF_VIEW_PREFS_BOUNDS[key].min, SHELF_VIEW_PREFS_BOUNDS[key].max);
  };
  num('cellSizePx');
  num('coverScale');
  num('gapPx');
  num('cellWidthPx');
  num('cellHeightPx');
  num('rowGapPx');
  num('sectionGapPx');
  num('frontDisplaySizePx');
  if (raw.fitMode === 'contain' || raw.fitMode === 'cover') out.fitMode = raw.fitMode;
  if (raw.textDensity === 'sm' || raw.textDensity === 'md' || raw.textDensity === 'lg') {
    out.textDensity = raw.textDensity;
  }
  if (typeof raw.showLabels === 'boolean') out.showLabels = raw.showLabels;
  if (typeof raw.compact === 'boolean') out.compact = raw.compact;
  return out;
}

export function parseShelfDisplayOverridesV1(raw: string | null): ShelfDisplayOverridesV1 {
  if (!raw) return defaultShelfDisplayOverridesV1();
  try {
    return validateShelfDisplayOverridesV1(JSON.parse(raw));
  } catch {
    return defaultShelfDisplayOverridesV1();
  }
}

/**
 * Compute the effective prefs for a given shelf — layer the
 * per-shelf partial over the global defaults. When `shelfId` is
 * `null`, returns the global as-is so consumers that don't know
 * which shelf they're rendering (e.g. the read-only release view)
 * can still get a sensible answer.
 */
export function resolveShelfPrefs(
  overrides: ShelfDisplayOverridesV1,
  shelfId: string | null,
): ShelfViewPrefsV1 {
  if (!shelfId) return overrides.global;
  const partial = overrides.shelves[shelfId];
  if (!partial) return overrides.global;
  return validateShelfViewPrefsV1({ ...overrides.global, ...partial });
}

/**
 * Returns `true` when at least one field of the per-shelf override
 * differs from the resolved global. Used by the UI chip to surface
 * the "this shelf is overridden" state.
 */
export function shelfHasOverride(
  overrides: ShelfDisplayOverridesV1,
  shelfId: string,
): boolean {
  const partial = overrides.shelves[shelfId];
  if (!partial) return false;
  return Object.keys(partial).length > 0;
}

/** Settings key for the wrapping overrides payload. */
export const SHELF_DISPLAY_OVERRIDES_KEY = 'shelf_display_overrides_v1';

/** Event broadcast after a successful PATCH of the overrides key. */
export const SHELF_DISPLAY_OVERRIDES_EVENT = 'shelf:display-overrides-changed';
