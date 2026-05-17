import { describe, expect, it } from 'vitest';
import { normalizeVndbHref } from '@/lib/vndb-link-normalize';

/**
 * Pin the VNDB internal-link rewrite table. The function powers
 * the BBCode `[url=…]` resolution inside <VndbMarkup> and the bare
 * autolinker, so a regression here would re-introduce broken internal
 * routes (a `[url=c90046]` would link at `/c90046` instead of
 * `/character/c90046`).
 *
 * Route table mirrors `src/app/<route>/[id]`:
 *   v  → /vn          c → /character   r → /release
 *   p  → /producer    g → /tag         i → /trait    s → /staff
 * Other prefixes (`d`, `u`, `t`, `w`) keep the external URL.
 */
describe('normalizeVndbHref — absolute vndb.org URLs', () => {
  it('rewrites character pages to /character/cNNN', () => {
    expect(normalizeVndbHref('https://vndb.org/c90046')).toBe('/character/c90046');
  });
  it('rewrites VN pages to /vn/vNNN', () => {
    expect(normalizeVndbHref('https://vndb.org/v90017')).toBe('/vn/v90017');
  });
  it('rewrites release pages to /release/rNNN', () => {
    expect(normalizeVndbHref('https://vndb.org/r123')).toBe('/release/r123');
  });
  it('rewrites producer pages to /producer/pNNN', () => {
    expect(normalizeVndbHref('https://vndb.org/p90068')).toBe('/producer/p90068');
  });
  it('rewrites tag pages to /tag/gNNN', () => {
    expect(normalizeVndbHref('https://vndb.org/g99')).toBe('/tag/g99');
  });
  it('rewrites trait pages to /trait/iNNN', () => {
    expect(normalizeVndbHref('https://vndb.org/i735')).toBe('/trait/i735');
  });
  it('rewrites staff pages to /staff/sNNN', () => {
    expect(normalizeVndbHref('https://vndb.org/s90011')).toBe('/staff/s90011');
  });
  it('accepts http:// scheme too', () => {
    expect(normalizeVndbHref('http://vndb.org/c90046')).toBe('/character/c90046');
  });
  it('accepts www.vndb.org subdomain', () => {
    expect(normalizeVndbHref('https://www.vndb.org/v90017')).toBe('/vn/v90017');
  });
});

describe('normalizeVndbHref — prefixes without internal route', () => {
  it('keeps user pages external (u prefix)', () => {
    expect(normalizeVndbHref('https://vndb.org/u123')).toBe('https://vndb.org/u123');
  });
  it('keeps docs external (d prefix)', () => {
    expect(normalizeVndbHref('https://vndb.org/d5')).toBe('https://vndb.org/d5');
  });
  it('keeps threads external (t prefix)', () => {
    expect(normalizeVndbHref('https://vndb.org/t1')).toBe('https://vndb.org/t1');
  });
  it('keeps reviews external (w prefix)', () => {
    expect(normalizeVndbHref('https://vndb.org/w99')).toBe('https://vndb.org/w99');
  });
});

describe('normalizeVndbHref — bare refs and relative paths', () => {
  it('maps a bare character ref to /character/cNNN', () => {
    expect(normalizeVndbHref('c90046')).toBe('/character/c90046');
  });
  it('maps a bare VN ref to /vn/vNNN', () => {
    expect(normalizeVndbHref('v90017')).toBe('/vn/v90017');
  });
  it('maps an already-broken /cNNN relative path', () => {
    expect(normalizeVndbHref('/c90046')).toBe('/character/c90046');
  });
  it('keeps a bare ref with unknown prefix unchanged', () => {
    expect(normalizeVndbHref('u123')).toBe('u123');
  });
});

describe('normalizeVndbHref — already-normalized routes', () => {
  it('passes /character/cNNN through unchanged', () => {
    expect(normalizeVndbHref('/character/c90046')).toBe('/character/c90046');
  });
  it('passes /vn/vNNN through unchanged', () => {
    expect(normalizeVndbHref('/vn/v90017')).toBe('/vn/v90017');
  });
});

describe('normalizeVndbHref — unrelated URLs', () => {
  it('passes through generic external URLs untouched', () => {
    expect(normalizeVndbHref('https://example.com/x')).toBe('https://example.com/x');
  });
  it('passes through mailto: links untouched', () => {
    expect(normalizeVndbHref('mailto:nobody@example.com')).toBe('mailto:nobody@example.com');
  });
  it('passes through a non-VNDB host that happens to share a path shape', () => {
    expect(normalizeVndbHref('https://impostor.com/c90046')).toBe('https://impostor.com/c90046');
  });
});

describe('normalizeVndbHref — null-safe edge cases', () => {
  it('returns empty string for null', () => {
    expect(normalizeVndbHref(null)).toBe('');
  });
  it('returns empty string for undefined', () => {
    expect(normalizeVndbHref(undefined)).toBe('');
  });
  it('returns empty string for empty input', () => {
    expect(normalizeVndbHref('')).toBe('');
  });
  it('trims surrounding whitespace before matching', () => {
    expect(normalizeVndbHref('  https://vndb.org/c90046  ')).toBe('/character/c90046');
  });
  it('handles trailing query / fragment on absolute URLs', () => {
    expect(normalizeVndbHref('https://vndb.org/v90017?ref=foo')).toBe('/vn/v90017');
    expect(normalizeVndbHref('https://vndb.org/c90046#bio')).toBe('/character/c90046');
  });
});
