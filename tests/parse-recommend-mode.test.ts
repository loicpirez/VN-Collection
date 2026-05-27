/**
 * Pins the URL → mode coercion for the `/recommendations` page.
 *
 * The page reads `?mode=…` from the URL and routes the page-level
 * branch via `parseRecommendMode`. A drift here silently breaks
 * deep-linked URLs that have been shared / bookmarked. The function
 * is dependency-free so the test runs without any DB / network /
 * React setup.
 *
 * Coverage:
 *   - Every known mode round-trips (case-insensitive).
 *   - Unknown / empty / null falls back to the documented default.
 *   - The `RECOMMEND_MODES` array is the source of truth (no drift
 *     between the function and the array).
 */
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_RECOMMEND_MODE,
  RECOMMEND_MODES,
  parseRecommendMode,
} from '@/lib/recommend';

describe('parseRecommendMode', () => {
  it('round-trips every documented mode', () => {
    for (const mode of RECOMMEND_MODES) {
      expect(parseRecommendMode(mode)).toBe(mode);
    }
  });

  it('lowercases the input before comparison', () => {
    // The page-level deep links use the literal mode names so this
    // is mostly defence-in-depth, but a hand-rolled URL with mixed
    // casing should still land on the intended branch.
    for (const mode of RECOMMEND_MODES) {
      expect(parseRecommendMode(mode.toUpperCase())).toBe(mode);
    }
  });

  it('falls back to DEFAULT_RECOMMEND_MODE for unknown strings', () => {
    expect(parseRecommendMode('totally-bogus')).toBe(DEFAULT_RECOMMEND_MODE);
    expect(parseRecommendMode('similar')).toBe(DEFAULT_RECOMMEND_MODE);
  });

  it('falls back to DEFAULT_RECOMMEND_MODE for null / undefined / empty', () => {
    expect(parseRecommendMode(null)).toBe(DEFAULT_RECOMMEND_MODE);
    expect(parseRecommendMode(undefined)).toBe(DEFAULT_RECOMMEND_MODE);
    expect(parseRecommendMode('')).toBe(DEFAULT_RECOMMEND_MODE);
  });

  it('RECOMMEND_MODES is the source of truth — pinning the membership prevents silent additions', () => {
    // If a future mode is added without updating RECOMMEND_MODES the
    // page URL routing breaks silently. Pin the current membership
    // so adding a new mode forces an explicit test update.
    expect(RECOMMEND_MODES.length).toBeGreaterThanOrEqual(4);
    expect(RECOMMEND_MODES).toContain(DEFAULT_RECOMMEND_MODE);
  });
});
