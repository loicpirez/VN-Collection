/**
 * Pins the input-validator contract used by the API routes:
 *   - `validateText` — type guard, trim, length bounds, allowEmpty.
 *   - `validateIsoDate` — accepts UTC-ms integer OR ISO-8601 string and
 *     normalizes to UTC-ms; rejects junk and out-of-window values.
 *   - `validateSafeInt` — integer + range + safe-integer bounds.
 *   - `validateTokenShape` — documented Steam / vndb credential shapes.
 *
 * Every validator returns a `{ ok: true, value } | { ok: false, error }`
 * discriminated result; tests assert both branches.
 */
import { describe, expect, it } from 'vitest';
import {
  validateIsoDate,
  validateSafeInt,
  validateText,
  validateTokenShape,
} from '@/lib/input-validators';

describe('validateText', () => {
  it('accepts and trims a valid string', () => {
    const r = validateText('  hello  ', { field: 'note', max: 100 });
    expect(r).toEqual({ ok: true, value: 'hello' });
  });

  it('rejects a non-string', () => {
    const r = validateText(42, { field: 'note', max: 100 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('note');
  });

  it('rejects an empty string when allowEmpty is false', () => {
    const r = validateText('   ', { field: 'note', max: 100 });
    expect(r.ok).toBe(false);
  });

  it('accepts an empty string when allowEmpty is true', () => {
    expect(validateText('   ', { field: 'note', max: 100, allowEmpty: true })).toEqual({
      ok: true,
      value: '',
    });
  });

  it('rejects a string over max length', () => {
    const r = validateText('a'.repeat(101), { field: 'note', max: 100 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('max 100');
  });

  it('rejects a string under an explicit min length', () => {
    const r = validateText('ab', { field: 'code', max: 100, min: 3 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('min 3');
  });
});

describe('validateIsoDate', () => {
  it('accepts a UTC-ms integer', () => {
    expect(validateIsoDate(1_700_000_000_123)).toEqual({ ok: true, value: 1_700_000_000_123 });
  });

  it('accepts an ISO-8601 string and normalizes to UTC-ms', () => {
    const r = validateIsoDate('2023-01-02T03:04:05.000Z');
    expect(r).toEqual({ ok: true, value: Date.parse('2023-01-02T03:04:05.000Z') });
  });

  it('accepts a date-only ISO string', () => {
    const r = validateIsoDate('2023-01-02');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toBe(Date.parse('2023-01-02'));
  });

  it('rejects a non-date string', () => {
    expect(validateIsoDate('not-a-date').ok).toBe(false);
  });

  it('rejects a boolean', () => {
    expect(validateIsoDate(true).ok).toBe(false);
  });

  it('rejects a timestamp at or before the epoch', () => {
    expect(validateIsoDate(0).ok).toBe(false);
    expect(validateIsoDate(-1).ok).toBe(false);
  });

  it('rejects a timestamp far in the future', () => {
    expect(validateIsoDate(Date.now() + 400 * 86_400_000).ok).toBe(false);
  });

  it('rejects a non-finite number', () => {
    expect(validateIsoDate(Number.POSITIVE_INFINITY).ok).toBe(false);
  });

  it('rejects a fractional numeric timestamp instead of flooring it', () => {
    expect(validateIsoDate(1_700_000_000_123.5).ok).toBe(false);
  });
});

describe('validateSafeInt', () => {
  it('accepts an in-range integer', () => {
    expect(validateSafeInt(5, { field: 'minutes', min: 0, max: 10 })).toEqual({
      ok: true,
      value: 5,
    });
  });

  it('rejects a non-integer number', () => {
    expect(validateSafeInt(2.5, { field: 'minutes', min: 0, max: 10 }).ok).toBe(false);
  });

  it('rejects a non-number', () => {
    expect(validateSafeInt('5', { field: 'minutes', min: 0, max: 10 }).ok).toBe(false);
  });

  it('rejects a value below min', () => {
    expect(validateSafeInt(-1, { field: 'minutes', min: 0, max: 10 }).ok).toBe(false);
  });

  it('rejects a value above max', () => {
    expect(validateSafeInt(11, { field: 'minutes', min: 0, max: 10 }).ok).toBe(false);
  });

  it('rejects an unsafe integer', () => {
    const r = validateSafeInt(Number.MAX_SAFE_INTEGER + 1, {
      field: 'n',
      min: 0,
      max: Number.MAX_SAFE_INTEGER + 10,
    });
    expect(r.ok).toBe(false);
  });
});

describe('validateTokenShape', () => {
  it('accepts a 32-hex steam_api_key and trims it', () => {
    expect(validateTokenShape('  ABCDEF0123456789abcdef0123456789  ', 'steam_api_key')).toEqual({
      ok: true,
      value: 'ABCDEF0123456789abcdef0123456789',
    });
  });

  it('rejects a steam_api_key of the wrong length', () => {
    expect(validateTokenShape('ABCDEF0123', 'steam_api_key').ok).toBe(false);
  });

  it('rejects a steam_api_key with a non-hex character', () => {
    expect(validateTokenShape('Z'.repeat(32), 'steam_api_key').ok).toBe(false);
  });

  it('accepts a 17-digit steam_id', () => {
    expect(validateTokenShape('76561197960287930', 'steam_id')).toEqual({
      ok: true,
      value: '76561197960287930',
    });
  });

  it('rejects a steam_id that is not 17 digits', () => {
    expect(validateTokenShape('123', 'steam_id').ok).toBe(false);
    expect(validateTokenShape('1234567890123456789', 'steam_id').ok).toBe(false);
  });

  it('accepts a plain vndb_token', () => {
    expect(validateTokenShape('  tok-abc.def  ', 'vndb_token')).toEqual({
      ok: true,
      value: 'tok-abc.def',
    });
  });

  it('rejects a vndb_token with embedded whitespace', () => {
    expect(validateTokenShape('a b', 'vndb_token').ok).toBe(false);
  });

  it('rejects a vndb_token with a double-quote', () => {
    expect(validateTokenShape('a"b', 'vndb_token').ok).toBe(false);
  });

  it('rejects a vndb_token over 200 chars', () => {
    expect(validateTokenShape('a'.repeat(201), 'vndb_token').ok).toBe(false);
  });

  it('rejects a non-string token', () => {
    expect(validateTokenShape(123, 'steam_id').ok).toBe(false);
  });

  it('rejects an empty token', () => {
    expect(validateTokenShape('   ', 'vndb_token').ok).toBe(false);
  });
});
