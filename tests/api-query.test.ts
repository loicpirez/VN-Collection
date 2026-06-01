import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseBoundedQueryInteger, parseOptionalQueryInteger } from '@/lib/api-query';

describe('API numeric query parsers', () => {
  it('returns the bounded-parser fallback for omitted or malformed values', () => {
    const options = { fallback: 25, min: 1, max: 100 };
    expect(parseBoundedQueryInteger(undefined, options)).toBe(25);
    expect(parseBoundedQueryInteger(null, options)).toBe(25);
    expect(parseBoundedQueryInteger('12junk', options)).toBe(25);
    expect(parseBoundedQueryInteger('12.5', options)).toBe(25);
    expect(parseBoundedQueryInteger('9007199254740992', options)).toBe(25);
  });

  it('clamps valid bounded-parser integers to the configured range', () => {
    const options = { fallback: 25, min: 1, max: 100 };
    expect(parseBoundedQueryInteger('-5', options)).toBe(1);
    expect(parseBoundedQueryInteger('42', options)).toBe(42);
    expect(parseBoundedQueryInteger('999', options)).toBe(100);
  });

  it('returns null from the optional parser for omitted or malformed values', () => {
    expect(parseOptionalQueryInteger(undefined)).toBeNull();
    expect(parseOptionalQueryInteger(null)).toBeNull();
    expect(parseOptionalQueryInteger('12junk')).toBeNull();
    expect(parseOptionalQueryInteger('12.5')).toBeNull();
    expect(parseOptionalQueryInteger('9007199254740992')).toBeNull();
  });

  it('keeps exact optional-parser integers', () => {
    expect(parseOptionalQueryInteger('-5')).toBe(-5);
    expect(parseOptionalQueryInteger('42')).toBe(42);
  });

  it('pins strict query parsing to every audited route', () => {
    const boundedRoutes = [
      'src/app/api/activity/route.ts',
      'src/app/api/stock/recent/route.ts',
      'src/app/api/collection/characters/route.ts',
      'src/app/api/egs/search/route.ts',
      'src/app/api/tags/route.ts',
      'src/app/api/traits/route.ts',
    ];
    for (const route of boundedRoutes) {
      expect(readFileSync(route, 'utf8')).toContain('parseBoundedQueryInteger(');
    }
    expect(readFileSync('src/app/api/activity/route.ts', 'utf8')).toContain('parseOptionalQueryInteger(');
  });
});
