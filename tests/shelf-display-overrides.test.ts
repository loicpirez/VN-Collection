/**
 * Pin the new `shelf_display_overrides_v1` hierarchy:
 *
 *   { global: ShelfViewPrefsV1,
 *     shelves: Record<shelfId, Partial<ShelfViewPrefsV1>> }
 *
 * Required behaviour per the operator's continuation prompt (item 13):
 *
 *   - Validator drops unknown keys + clamps numerics in both `global`
 *     and per-shelf partials.
 *   - Per-shelf override layers over the global (resolver returns the
 *     merged effective prefs).
 *   - Clearing a per-shelf override falls back to global.
 *   - Legacy `shelf_view_prefs_v1` payload (a flat ShelfViewPrefsV1)
 *     is accepted as the `global` so existing stored data keeps
 *     working without a manual migration.
 */
import { describe, expect, it } from 'vitest';
import {
  defaultShelfDisplayOverridesV1,
  defaultShelfViewPrefsV1,
  parseShelfDisplayOverridesV1,
  resolveShelfPrefs,
  shelfHasOverride,
  shelfViewPrefsCssVars,
  validateShelfDisplayOverridesV1,
} from '@/lib/shelf-view-prefs';

describe('validateShelfDisplayOverridesV1', () => {
  it('returns defaults for garbage input', () => {
    expect(validateShelfDisplayOverridesV1(null)).toEqual(defaultShelfDisplayOverridesV1());
    expect(validateShelfDisplayOverridesV1(undefined)).toEqual(defaultShelfDisplayOverridesV1());
    expect(validateShelfDisplayOverridesV1(42)).toEqual(defaultShelfDisplayOverridesV1());
    expect(validateShelfDisplayOverridesV1([])).toEqual(defaultShelfDisplayOverridesV1());
  });

  it('accepts a legacy flat ShelfViewPrefsV1 payload as the global', () => {
    const legacy = { cellWidthPx: 200, cellHeightPx: 300, rowGapPx: 12 };
    const out = validateShelfDisplayOverridesV1(legacy);
    expect(out.global.cellWidthPx).toBe(200);
    expect(out.global.cellHeightPx).toBe(280); // clamped to max
    expect(out.global.rowGapPx).toBe(12);
    expect(out.shelves).toEqual({});
  });

  it('drops empty per-shelf partials so a reset PATCH does not leave a dangling row', () => {
    const out = validateShelfDisplayOverridesV1({
      global: defaultShelfViewPrefsV1(),
      shelves: {
        '1': { cellWidthPx: 180 },
        '2': {}, // empty → dropped
        bogus: { irrelevant: 99 } as never, // no known keys → dropped
      },
    });
    expect(Object.keys(out.shelves).sort()).toEqual(['1']);
    expect(out.shelves['1']).toEqual({ cellWidthPx: 180 });
  });

  it('clamps per-shelf partials to documented ranges', () => {
    const out = validateShelfDisplayOverridesV1({
      shelves: { '1': { cellWidthPx: 99999, sectionGapPx: -50, textDensity: 'huge' } },
    });
    expect(out.shelves['1'].cellWidthPx).toBe(280);
    expect(out.shelves['1'].sectionGapPx).toBe(0);
    // Unknown enum dropped, not coerced.
    expect(out.shelves['1'].textDensity).toBeUndefined();
  });

  it('parses round-trip JSON safely', () => {
    const parsed = parseShelfDisplayOverridesV1(
      JSON.stringify({ global: { cellWidthPx: 200 }, shelves: { '7': { coverScale: 1.4 } } }),
    );
    expect(parsed.global.cellWidthPx).toBe(200);
    expect(parsed.shelves['7'].coverScale).toBe(1.4);
  });

  it('returns defaults when the JSON is malformed', () => {
    expect(parseShelfDisplayOverridesV1('not json')).toEqual(defaultShelfDisplayOverridesV1());
  });
});

describe('resolveShelfPrefs', () => {
  it('returns the global when no override exists for the shelf id', () => {
    const overrides = defaultShelfDisplayOverridesV1();
    expect(resolveShelfPrefs(overrides, '1')).toEqual(overrides.global);
    expect(resolveShelfPrefs(overrides, null)).toEqual(overrides.global);
  });

  it('layers per-shelf partial over the global', () => {
    const overrides = validateShelfDisplayOverridesV1({
      global: defaultShelfViewPrefsV1(),
      shelves: { '1': { cellWidthPx: 200, compact: true } },
    });
    const effective = resolveShelfPrefs(overrides, '1');
    expect(effective.cellWidthPx).toBe(200);
    expect(effective.compact).toBe(true);
    // Untouched field falls through to global.
    expect(effective.cellHeightPx).toBe(overrides.global.cellHeightPx);
  });

  it('falls back to global when the per-shelf row is empty', () => {
    const overrides = { ...defaultShelfDisplayOverridesV1(), shelves: {} };
    expect(resolveShelfPrefs(overrides, '1')).toEqual(overrides.global);
  });
});

describe('shelfHasOverride', () => {
  it('returns true only when a non-empty partial exists', () => {
    const overrides = validateShelfDisplayOverridesV1({
      shelves: { '1': { cellWidthPx: 180 } },
    });
    expect(shelfHasOverride(overrides, '1')).toBe(true);
    expect(shelfHasOverride(overrides, '2')).toBe(false);
  });
});

describe('CSS variables generated from effective prefs', () => {
  it('the effective prefs produce the same key set as a flat global', () => {
    const overrides = validateShelfDisplayOverridesV1({
      shelves: { '1': { cellWidthPx: 240, frontDisplaySizePx: 200 } },
    });
    const vars = shelfViewPrefsCssVars(resolveShelfPrefs(overrides, '1'));
    expect(vars['--shelf-cell-w-px']).toBe('240px');
    expect(vars['--shelf-front-size-px']).toBe('200px');
  });
});
