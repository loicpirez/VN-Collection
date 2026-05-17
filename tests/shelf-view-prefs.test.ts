/**
 * Persistence + clamp tests for the read-only shelf view preferences.
 * The PATCH path on `/api/settings` runs every input through this
 * validator before storing, so the test covers the produce/consume
 * round-trip plus every out-of-range / wrong-type edge case.
 */
import { describe, expect, it } from 'vitest';
import {
  SHELF_VIEW_PREFS_BOUNDS,
  defaultShelfViewPrefsV1,
  parseShelfViewPrefsV1,
  shelfViewPrefsDataAttrs,
  shelfViewPrefsCssVars,
  validateShelfViewPrefsV1,
} from '@/lib/shelf-view-prefs';

describe('validateShelfViewPrefsV1', () => {
  it('returns documented defaults for null / empty / invalid input', () => {
    const def = defaultShelfViewPrefsV1();
    expect(validateShelfViewPrefsV1(null)).toEqual(def);
    expect(validateShelfViewPrefsV1(undefined)).toEqual(def);
    expect(validateShelfViewPrefsV1('garbage' as unknown)).toEqual(def);
    expect(validateShelfViewPrefsV1([] as unknown)).toEqual(def);
    expect(validateShelfViewPrefsV1(42 as unknown)).toEqual(def);
  });

  it('clamps cellSizePx to the documented range', () => {
    expect(validateShelfViewPrefsV1({ cellSizePx: 0 }).cellSizePx).toBe(
      SHELF_VIEW_PREFS_BOUNDS.cellSizePx.min,
    );
    expect(validateShelfViewPrefsV1({ cellSizePx: 99_999 }).cellSizePx).toBe(
      SHELF_VIEW_PREFS_BOUNDS.cellSizePx.max,
    );
    expect(validateShelfViewPrefsV1({ cellSizePx: 120 }).cellSizePx).toBe(120);
  });

  it('clamps coverScale to the documented range', () => {
    expect(validateShelfViewPrefsV1({ coverScale: 0 }).coverScale).toBe(
      SHELF_VIEW_PREFS_BOUNDS.coverScale.min,
    );
    expect(validateShelfViewPrefsV1({ coverScale: 5 }).coverScale).toBe(
      SHELF_VIEW_PREFS_BOUNDS.coverScale.max,
    );
    expect(validateShelfViewPrefsV1({ coverScale: 1.2 }).coverScale).toBe(1.2);
  });

  it('clamps gapPx to the documented range', () => {
    expect(validateShelfViewPrefsV1({ gapPx: -5 }).gapPx).toBe(SHELF_VIEW_PREFS_BOUNDS.gapPx.min);
    expect(validateShelfViewPrefsV1({ gapPx: 100 }).gapPx).toBe(SHELF_VIEW_PREFS_BOUNDS.gapPx.max);
    expect(validateShelfViewPrefsV1({ gapPx: 12 }).gapPx).toBe(12);
  });

  it('falls back to contain when fitMode is anything other than "cover"', () => {
    expect(validateShelfViewPrefsV1({ fitMode: 'cover' }).fitMode).toBe('cover');
    expect(validateShelfViewPrefsV1({ fitMode: 'contain' }).fitMode).toBe('contain');
    expect(validateShelfViewPrefsV1({ fitMode: 'invalid' as unknown }).fitMode).toBe('contain');
    expect(validateShelfViewPrefsV1({}).fitMode).toBe('contain');
  });

  it('treats NaN / non-number values as the default', () => {
    const def = defaultShelfViewPrefsV1();
    expect(validateShelfViewPrefsV1({ cellSizePx: Number.NaN }).cellSizePx).toBe(
      SHELF_VIEW_PREFS_BOUNDS.cellSizePx.min,
    );
    expect(validateShelfViewPrefsV1({ coverScale: 'oops' as unknown }).coverScale).toBe(def.coverScale);
    expect(validateShelfViewPrefsV1({ gapPx: null as unknown }).gapPx).toBe(def.gapPx);
  });

  it('parseShelfViewPrefsV1 falls back to default on malformed JSON', () => {
    const def = defaultShelfViewPrefsV1();
    expect(parseShelfViewPrefsV1('not-json{')).toEqual(def);
    expect(parseShelfViewPrefsV1(null)).toEqual(def);
  });

  it('parseShelfViewPrefsV1 round-trips a normalized payload', () => {
    const prefs = validateShelfViewPrefsV1({
      cellSizePx: 180,
      coverScale: 1.1,
      gapPx: 16,
      fitMode: 'cover',
    });
    const back = parseShelfViewPrefsV1(JSON.stringify(prefs));
    expect(back).toEqual(prefs);
  });
});

describe('shelfViewPrefsCssVars', () => {
  it('produces the documented css variables and data attributes', () => {
    const css = shelfViewPrefsCssVars({
      cellSizePx: 200,
      coverScale: 1.25,
      gapPx: 4,
      fitMode: 'cover',
      cellWidthPx: 160,
      cellHeightPx: 220,
      rowGapPx: 8,
      sectionGapPx: 24,
      frontDisplaySizePx: 180,
      textDensity: 'lg',
      showLabels: false,
      compact: true,
    });
    expect(css).toEqual({
      '--shelf-cell-px': '200px',
      '--shelf-cover-scale': '1.25',
      '--shelf-gap-px': '4px',
      '--shelf-cell-w-px': '160px',
      '--shelf-cell-h-px': '220px',
      '--shelf-row-gap-px': '8px',
      '--shelf-section-gap-px': '24px',
      '--shelf-front-size-px': '180px',
      '--shelf-fit-mode': 'cover',
      '--shelf-card-pad': '1px',
      '--shelf-label-font-px': '12px',
    });
    expect(shelfViewPrefsDataAttrs({
      cellSizePx: 200,
      coverScale: 1.25,
      gapPx: 4,
      fitMode: 'cover',
      cellWidthPx: 160,
      cellHeightPx: 220,
      rowGapPx: 8,
      sectionGapPx: 24,
      frontDisplaySizePx: 180,
      textDensity: 'lg',
      showLabels: false,
      compact: true,
    })).toEqual({
      'data-shelf-labels': 'off',
      'data-shelf-compact': 'on',
      'data-shelf-text-density': 'lg',
      'data-shelf-fit': 'cover',
    });
  });
});

describe('reset semantics', () => {
  it('passing a fresh object to validate restores defaults', () => {
    // The "Reset to defaults" button PATCHes `null`. Internally the
    // PATCH route stores null which makes the next GET fall through
    // to defaultShelfViewPrefsV1(). Pinning the equivalence here so
    // future refactors don't drift.
    expect(parseShelfViewPrefsV1(null)).toEqual(defaultShelfViewPrefsV1());
  });
});
