/**
 * Pin the href shape that every actionable token on the EGS surfaces
 * (EgsPanel, EgsRichDetails, `/egs` rows, `/top-ranked?tab=egs`,
 * `/upcoming?tab=anticipated`) produces. The surfaces inline the same
 * helpers from `lib/egs-links.ts`; this test guards against silent
 * drift between the helpers and what the UI assumes.
 *
 * No real game / studio names — synthetic placeholders only.
 */
import { describe, expect, it } from 'vitest';
import {
  brandHref,
  egsExternalHref,
  languageHref,
  platformHref,
  vnHref,
  yearHref,
} from '@/lib/egs-links';

describe('egs-links helpers', () => {
  it('brandHref prefers the local VNDB-mapped producer page when available', () => {
    expect(brandHref('p9001', 'placeholder-brand')).toBe('/producer/p9001');
    expect(brandHref('P9002', 'whatever')).toBe('/producer/P9002');
  });

  it('brandHref falls back to a name-search URL when no VNDB mapping', () => {
    expect(brandHref(null, 'placeholder-brand')).toBe('/search?q=placeholder-brand');
    expect(brandHref(undefined, 'with spaces & symbols')).toBe(
      '/search?q=with%20spaces%20%26%20symbols',
    );
  });

  it('brandHref returns null when both inputs are empty', () => {
    expect(brandHref(null, null)).toBeNull();
    expect(brandHref(null, '   ')).toBeNull();
    expect(brandHref('not-a-producer-id', null)).toBeNull();
  });

  it('platformHref encodes the search param', () => {
    expect(platformHref('win')).toBe('/search?platforms=win');
    expect(platformHref('ps4')).toBe('/search?platforms=ps4');
    expect(platformHref(null)).toBeNull();
    expect(platformHref('')).toBeNull();
  });

  it('languageHref encodes the search param', () => {
    expect(languageHref('ja')).toBe('/search?langs=ja');
    expect(languageHref('zh-Hant')).toBe('/search?langs=zh-Hant');
    expect(languageHref(null)).toBeNull();
  });

  it('yearHref extracts a 4-digit year from a date-like string', () => {
    expect(yearHref('2024')).toBe('/?yearMin=2024&yearMax=2024');
    expect(yearHref('2024-07-19')).toBe('/?yearMin=2024&yearMax=2024');
    expect(yearHref('TBA')).toBeNull();
    expect(yearHref(null)).toBeNull();
  });

  it('vnHref accepts only canonical VNDB ids', () => {
    expect(vnHref('v17')).toBe('/vn/v17');
    expect(vnHref('V18')).toBe('/vn/v18');
    expect(vnHref('egs_42')).toBeNull();
    expect(vnHref(null)).toBeNull();
  });

  it('egsExternalHref builds an absolute EGS URL', () => {
    expect(egsExternalHref(123)).toBe(
      'https://erogamescape.dyndns.org/~ap2/ero/toukei_kaiseki/game.php?game=123',
    );
    expect(egsExternalHref('42')).toContain('game=42');
  });
});
