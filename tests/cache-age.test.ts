import { describe, expect, it } from 'vitest';
import { isCacheFresh, isCacheStale, VNDB_CACHE_MS, STOCK_STALE_MS } from '@/lib/cache-age';

/**
 * Tests for the shared cache-age helper (audit U-063). The helper
 * previously lived inline in four files, each declaring its own
 * `CACHE_MS = 24 * 3600 * 1000`. The test fixes the contract so
 * a future refactor that touches the constants stays observably
 * compatible.
 */
describe('isCacheStale / isCacheFresh', () => {
  it('treats a freshly-fetched row as fresh', () => {
    const now = 10_000_000;
    expect(isCacheStale(now - 1, VNDB_CACHE_MS, now)).toBe(false);
    expect(isCacheFresh(now - 1, VNDB_CACHE_MS, now)).toBe(true);
  });

  it('treats a row older than `maxAgeMs` as stale', () => {
    const now = 10_000_000;
    expect(isCacheStale(now - VNDB_CACHE_MS - 1, VNDB_CACHE_MS, now)).toBe(true);
    expect(isCacheFresh(now - VNDB_CACHE_MS - 1, VNDB_CACHE_MS, now)).toBe(false);
  });

  it('treats `null` / `undefined` timestamps as stale', () => {
    expect(isCacheStale(null, VNDB_CACHE_MS)).toBe(true);
    expect(isCacheStale(undefined, VNDB_CACHE_MS)).toBe(true);
    expect(isCacheFresh(null, VNDB_CACHE_MS)).toBe(false);
    expect(isCacheFresh(undefined, VNDB_CACHE_MS)).toBe(false);
  });

  it('exports the canonical constants', () => {
    expect(VNDB_CACHE_MS).toBe(24 * 3600 * 1000);
    expect(STOCK_STALE_MS).toBe(7 * 24 * 60 * 60 * 1000);
  });
});
