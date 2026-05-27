/**
 * Pins the `formatMinutesWithDash` variant. The empty-state contract
 * is the small lever that lets the table cells on `/vn/[id]` and
 * `/compare` render unconditionally — the dash literal `'—'` is
 * the visual placeholder both pages use.
 *
 * The wrapper does only three things:
 *   1. Passes `t.year` (the dictionary's hour/minute unit pair) into
 *      `formatMinutes`, tolerating `undefined`.
 *   2. Pins `fallback: '—'` so empty rows render the dash, not the
 *      empty string.
 *   3. Pins `emptyValue: 'strict_positive'` so 0-minute playtimes
 *      render as the dash (the rendering surface treats "started but
 *      not yet recorded" as no value).
 */
import { describe, expect, it } from 'vitest';
import { formatMinutesWithDash } from '@/lib/format';
import { dictionaries } from '@/lib/i18n/dictionaries';

describe('formatMinutesWithDash', () => {
  it('renders the dash for null / undefined / 0 / negative', () => {
    expect(formatMinutesWithDash(null, 'en', dictionaries.en)).toBe('—');
    expect(formatMinutesWithDash(undefined, 'en', dictionaries.en)).toBe('—');
    expect(formatMinutesWithDash(0, 'en', dictionaries.en)).toBe('—');
    expect(formatMinutesWithDash(-15, 'en', dictionaries.en)).toBe('—');
  });

  it('renders the localised h/m suffixes per locale', () => {
    expect(formatMinutesWithDash(125, 'en', dictionaries.en)).toBe('2h 5min');
    expect(formatMinutesWithDash(125, 'fr', dictionaries.fr)).toBe('2h 5min');
    expect(formatMinutesWithDash(125, 'ja', dictionaries.ja)).toBe('2時間 5分');
  });

  it('renders just hours when the minute remainder is zero', () => {
    expect(formatMinutesWithDash(60, 'en', dictionaries.en)).toBe('1h');
    expect(formatMinutesWithDash(180, 'ja', dictionaries.ja)).toBe('3時間');
  });

  it('renders just minutes when below one hour', () => {
    expect(formatMinutesWithDash(45, 'en', dictionaries.en)).toBe('45min');
    expect(formatMinutesWithDash(1, 'fr', dictionaries.fr)).toBe('1min');
  });

  it('tolerates a missing `t` argument and falls back to English h/m', () => {
    // The wrapper accepts `t: { year?: {...} } | undefined` so callers
    // in fringe code paths (server stub with no dict) don't crash.
    // The fallback labels are bare `h` / `m` from the base helper.
    expect(formatMinutesWithDash(125, 'en', undefined)).toBe('2h 5m');
  });

  it('tolerates a `t` object without a `year` key', () => {
    // Some callers pass a partial dict (e.g. just the section they need).
    // The wrapper handles the optional chain so a missing `year` cell
    // still renders the value, just with the English fallback labels.
    expect(formatMinutesWithDash(60, 'en', {})).toBe('1h');
  });

  it('rounds fractional minutes to the nearest integer', () => {
    expect(formatMinutesWithDash(45.4, 'en', dictionaries.en)).toBe('45min');
    expect(formatMinutesWithDash(45.6, 'en', dictionaries.en)).toBe('46min');
  });
});
