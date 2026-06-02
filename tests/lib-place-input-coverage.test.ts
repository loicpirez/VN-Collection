/**
 * Coverage for `src/lib/place-input.ts` — the optional place-registry
 * field validators. Pure functions over `validateText` + `safeHref`; no
 * mocks. Each branch (omitted / null-clear / empty-clear / valid / bound
 * violation / scheme rejection) is exercised.
 */
import { describe, expect, it } from 'vitest';
import {
  PLACE_KINDS,
  parseOptionalPlaceKind,
  parseOptionalPlaceText,
  parseOptionalPlaceUrl,
} from '@/lib/place-input';

describe('parseOptionalPlaceKind', () => {
  it('treats undefined as omitted', () => {
    expect(parseOptionalPlaceKind(undefined)).toEqual({ ok: true, value: undefined });
  });

  it('accepts each canonical kind', () => {
    for (const kind of PLACE_KINDS) {
      expect(parseOptionalPlaceKind(kind)).toEqual({ ok: true, value: kind });
    }
  });

  it('rejects a non-string or unknown kind', () => {
    expect(parseOptionalPlaceKind('warehouse')).toEqual({ ok: false, error: 'kind must be shop, chain, or storage' });
    expect(parseOptionalPlaceKind(42)).toEqual({ ok: false, error: 'kind must be shop, chain, or storage' });
    expect(parseOptionalPlaceKind(null)).toEqual({ ok: false, error: 'kind must be shop, chain, or storage' });
  });
});

describe('parseOptionalPlaceText', () => {
  it('treats undefined as omitted and null as an explicit clear', () => {
    expect(parseOptionalPlaceText(undefined, 'name', 100)).toEqual({ ok: true, value: undefined });
    expect(parseOptionalPlaceText(null, 'name', 100)).toEqual({ ok: true, value: null });
  });

  it('trims a valid value', () => {
    expect(parseOptionalPlaceText('  Shibuya store ', 'name', 100)).toEqual({ ok: true, value: 'Shibuya store' });
  });

  it('coerces an empty / whitespace-only string to null (clears the field)', () => {
    expect(parseOptionalPlaceText('   ', 'name', 100)).toEqual({ ok: true, value: null });
  });

  it('rejects a non-string value', () => {
    expect(parseOptionalPlaceText(123, 'name', 100)).toEqual({ ok: false, error: 'name must be a string' });
  });

  it('rejects a value past the max length', () => {
    expect(parseOptionalPlaceText('x'.repeat(101), 'name', 100)).toEqual({ ok: false, error: 'name too long (max 100)' });
  });
});

describe('parseOptionalPlaceUrl', () => {
  it('treats undefined as omitted and null as a clear', () => {
    expect(parseOptionalPlaceUrl(undefined)).toEqual({ ok: true, value: undefined });
    expect(parseOptionalPlaceUrl(null)).toEqual({ ok: true, value: null });
  });

  it('clears the field for an empty string', () => {
    expect(parseOptionalPlaceUrl('   ')).toEqual({ ok: true, value: null });
  });

  it('canonicalizes a valid HTTP(S) URL', () => {
    expect(parseOptionalPlaceUrl('https://shop.example.co.jp/branch')).toEqual({
      ok: true,
      value: 'https://shop.example.co.jp/branch',
    });
  });

  it('rejects a non-HTTP scheme', () => {
    expect(parseOptionalPlaceUrl('javascript:alert(1)')).toEqual({ ok: false, error: 'url must be an HTTP(S) URL' });
    expect(parseOptionalPlaceUrl('ftp://files.example.com/x')).toEqual({ ok: false, error: 'url must be an HTTP(S) URL' });
  });

  it('propagates a length-bound failure from the underlying text validator', () => {
    const result = parseOptionalPlaceUrl('https://example.com/' + 'x'.repeat(2001));
    expect(result.ok).toBe(false);
  });

  it('rejects a non-string value', () => {
    expect(parseOptionalPlaceUrl(42)).toEqual({ ok: false, error: 'url must be a string' });
  });
});
