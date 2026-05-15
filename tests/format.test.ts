import { describe, expect, it } from 'vitest';
import { formatMinutes, formatMinutesOrNull } from '@/lib/format';

/**
 * Six different callers (VnCard, EgsPanel, EgsSyncBlock,
 * EgsRichDetails, /vn/[id], /compare) used to have subtly different
 * empty-state handling: some returned `null`, others "—". One shared
 * helper keeps them honest — and this test stops the matrix from
 * drifting back.
 */

describe('formatMinutes', () => {
  it('returns empty string by default for missing values', () => {
    expect(formatMinutes(null)).toBe('');
    expect(formatMinutes(undefined)).toBe('');
  });

  it('honours the fallback option', () => {
    expect(formatMinutes(null, { fallback: '—' })).toBe('—');
    expect(formatMinutes(0, { fallback: '—' })).toBe('—');
  });

  it('treats 0 as missing under the default (strict_positive) policy', () => {
    expect(formatMinutes(0)).toBe('');
    expect(formatMinutes(-1)).toBe('');
  });

  it('lets 0 through when `emptyValue: "allow_zero"`', () => {
    expect(formatMinutes(0, { emptyValue: 'allow_zero' })).toBe('0m');
  });

  it('formats hours-and-minutes', () => {
    expect(formatMinutes(125)).toBe('2h 5m');
  });

  it('formats round hours', () => {
    expect(formatMinutes(120)).toBe('2h');
    expect(formatMinutes(60)).toBe('1h');
  });

  it('formats sub-hour values', () => {
    expect(formatMinutes(45)).toBe('45m');
    expect(formatMinutes(1)).toBe('1m');
  });

  it('rounds fractional minutes', () => {
    expect(formatMinutes(45.4)).toBe('45m');
    expect(formatMinutes(45.6)).toBe('46m');
  });
});

describe('formatMinutesOrNull', () => {
  it('returns null for missing/zero/negative inputs', () => {
    expect(formatMinutesOrNull(null)).toBeNull();
    expect(formatMinutesOrNull(undefined)).toBeNull();
    expect(formatMinutesOrNull(0)).toBeNull();
    expect(formatMinutesOrNull(-1)).toBeNull();
  });

  it('returns the formatted string for positive values', () => {
    expect(formatMinutesOrNull(90)).toBe('1h 30m');
  });
});
