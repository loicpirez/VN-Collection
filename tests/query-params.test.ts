import { describe, expect, it } from 'vitest';
import {
  parseOptionalQueryBoolean,
  parseOptionalQueryInteger,
  parseOptionalQueryNumber,
  parseQueryEnum,
} from '@/lib/query-params';

describe('query parameter primitives', () => {
  it('distinguishes missing, invalid, bounded, clamped, and rejected integers', () => {
    expect(parseOptionalQueryInteger(null)).toBeUndefined();
    expect(parseOptionalQueryInteger('')).toBeUndefined();
    expect(parseOptionalQueryInteger('1.5')).toBeNull();
    expect(parseOptionalQueryInteger('-1')).toBeNull();
    expect(parseOptionalQueryInteger('9007199254740992')).toBeNull();
    expect(parseOptionalQueryInteger('0', { minimum: 1 })).toBeNull();
    expect(parseOptionalQueryInteger('12', { minimum: 1, maximum: 10 })).toBe(10);
    expect(parseOptionalQueryInteger('12', {
      minimum: 1,
      maximum: 10,
      clampMaximum: false,
    })).toBeNull();
    expect(parseOptionalQueryInteger('7', { minimum: 1, maximum: 10 })).toBe(7);
  });

  it('accepts only finite numbers inside optional bounds', () => {
    expect(parseOptionalQueryNumber(null)).toBeUndefined();
    expect(parseOptionalQueryNumber('')).toBeUndefined();
    expect(parseOptionalQueryNumber('Infinity')).toBeNull();
    expect(parseOptionalQueryNumber('-2', { minimum: -1 })).toBeNull();
    expect(parseOptionalQueryNumber('3', { maximum: 2 })).toBeNull();
    expect(parseOptionalQueryNumber('1.5', { minimum: 0, maximum: 2 })).toBe(1.5);
  });

  it('parses canonical optional booleans without truthy coercion', () => {
    expect(parseOptionalQueryBoolean(null)).toBeUndefined();
    expect(parseOptionalQueryBoolean('')).toBeUndefined();
    expect(parseOptionalQueryBoolean('1')).toBe(true);
    expect(parseOptionalQueryBoolean('0')).toBe(false);
    expect(parseOptionalQueryBoolean('true')).toBeNull();
  });

  it('returns only canonical enum values', () => {
    const values = ['one', 'two'] as const;
    expect(parseQueryEnum('two', values, 'one')).toBe('two');
    expect(parseQueryEnum('three', values, 'one')).toBe('one');
    expect(parseQueryEnum(null, values, 'one')).toBe('one');
  });
});
