/**
 * Pure URL-param parsing tests for /top-ranked. Asserts the snapping +
 * clamping rules so the cache key never explodes into infinite
 * variants for arbitrary user-typed values.
 */
import { describe, expect, it } from 'vitest';
import {
  MIN_VOTES_PRESETS,
  parseMinVotes,
  parsePage,
  parseTab,
} from '@/lib/top-ranked-query';

describe('parseTab', () => {
  it('returns vndb on missing / garbage / unknown', () => {
    expect(parseTab(undefined)).toBe('vndb');
    expect(parseTab('')).toBe('vndb');
    expect(parseTab('foo')).toBe('vndb');
  });
  it('returns egs only when value is exactly "egs"', () => {
    expect(parseTab('egs')).toBe('egs');
    expect(parseTab('EGS')).toBe('vndb');
  });
});

describe('parsePage', () => {
  it('defaults to 1 on missing / garbage', () => {
    expect(parsePage(undefined)).toBe(1);
    expect(parsePage('')).toBe(1);
    expect(parsePage('abc')).toBe(1);
    expect(parsePage('0')).toBe(1);
    expect(parsePage('-5')).toBe(1);
  });
  it('returns the numeric value when valid', () => {
    expect(parsePage('1')).toBe(1);
    expect(parsePage('5')).toBe(5);
    expect(parsePage('20')).toBe(20);
  });
  it('clamps to MAX_PAGE = 20', () => {
    expect(parsePage('21')).toBe(20);
    expect(parsePage('100')).toBe(20);
  });
  it('floors fractional values', () => {
    expect(parsePage('3.9')).toBe(3);
  });
});

describe('parseMinVotes snapping', () => {
  it('returns fallback on missing / garbage', () => {
    expect(parseMinVotes(undefined, 50)).toBe(50);
    expect(parseMinVotes('', 50)).toBe(50);
    expect(parseMinVotes('xyz', 50)).toBe(50);
    expect(parseMinVotes('0', 50)).toBe(50);
    expect(parseMinVotes('-100', 50)).toBe(50);
  });
  it('returns exact preset values unchanged', () => {
    for (const preset of MIN_VOTES_PRESETS) {
      expect(parseMinVotes(String(preset), 999)).toBe(preset);
    }
  });
  it('snaps arbitrary values to the closest preset', () => {
    // 137 → between 100 and 250; closer to 100.
    expect(parseMinVotes('137', 50)).toBe(100);
    // 200 → |200-100|=100 vs |200-250|=50, so 250 wins.
    expect(parseMinVotes('200', 50)).toBe(250);
    // 400 → closer to 500 than to 250 (|400-500|=100 vs |400-250|=150).
    expect(parseMinVotes('400', 50)).toBe(500);
    // 750 → exact midpoint between 500 and 1000. Loop picks the first
    // *strictly closer* candidate, so 500 (visited first with d=250)
    // is kept when 1000 ties at d=250.
    expect(parseMinVotes('750', 50)).toBe(500);
    // 9999 → 1000.
    expect(parseMinVotes('9999', 50)).toBe(1000);
    // 1 is below the lowest preset → still snaps to 50.
    expect(parseMinVotes('1', 50)).toBe(50);
    // 49 → 50.
    expect(parseMinVotes('49', 50)).toBe(50);
    // 51 → 50.
    expect(parseMinVotes('51', 50)).toBe(50);
  });
});
