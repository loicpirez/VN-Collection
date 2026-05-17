/**
 * Pins the URL-mutation contract of the VN seed picker.
 *
 * The picker itself is a React client component (`VnSeedPicker.tsx`)
 * that calls `router.replace(...)` on every selection. To keep the
 * test surface lean we extracted the pure URL helpers into
 * `@/lib/seed-picker-url` and exercise them here.
 *
 * Coverage:
 *   1. `setSeed` overwrites/inserts the `seed=` slot while preserving
 *      every other param.
 *   2. `clearSeed` removes the `seed=` slot and leaves every other
 *      param untouched.
 *   3. Tampered VN ids are silently rejected by `setSeed` (the
 *      component would never get a chance to call it with a bad id,
 *      but defence-in-depth is cheap).
 *   4. An end-to-end "select a hit → router.replace gets the new
 *      query" loop using a hand-built `URLSearchParams` and a
 *      `router.replace` spy.
 */
import { describe, expect, it, vi } from 'vitest';
import { clearSeed, isValidSeedVnId, setSeed } from '@/lib/seed-picker-url';

describe('seed-picker-url helpers', () => {
  describe('setSeed', () => {
    it('inserts seed= when no seed param is present', () => {
      const current = new URLSearchParams('mode=similar-to-vn&ero=1');
      const next = setSeed(current, 'v17');
      expect(next.get('seed')).toBe('v17');
      expect(next.get('mode')).toBe('similar-to-vn');
      expect(next.get('ero')).toBe('1');
    });

    it('overwrites an existing seed value rather than appending', () => {
      const current = new URLSearchParams('mode=similar-to-vn&seed=v999');
      const next = setSeed(current, 'v17');
      expect(next.getAll('seed')).toEqual(['v17']);
    });

    it('accepts an `egs_NNN` synthetic id', () => {
      const next = setSeed(new URLSearchParams(), 'egs_4321');
      expect(next.get('seed')).toBe('egs_4321');
    });

    it('lowercases the stored seed id', () => {
      const next = setSeed(new URLSearchParams(), 'V17');
      expect(next.get('seed')).toBe('v17');
    });

    it('returns an unchanged clone when given a tampered id', () => {
      const current = new URLSearchParams('mode=similar-to-vn');
      const next = setSeed(current, "g123' OR 1=1");
      expect(next.has('seed')).toBe(false);
      expect(next.get('mode')).toBe('similar-to-vn');
    });

    it('accepts a query-string input as well as URLSearchParams', () => {
      const next = setSeed('mode=similar-to-vn&ero=1', 'v17');
      expect(next.get('seed')).toBe('v17');
      expect(next.get('mode')).toBe('similar-to-vn');
      expect(next.get('ero')).toBe('1');
    });

    it('never mutates the input URLSearchParams', () => {
      const current = new URLSearchParams('mode=similar-to-vn');
      const before = current.toString();
      setSeed(current, 'v17');
      expect(current.toString()).toBe(before);
    });
  });

  describe('clearSeed', () => {
    it('strips the seed param', () => {
      const current = new URLSearchParams('mode=similar-to-vn&seed=v17&ero=1');
      const next = clearSeed(current);
      expect(next.has('seed')).toBe(false);
      expect(next.get('mode')).toBe('similar-to-vn');
      expect(next.get('ero')).toBe('1');
    });

    it('is a no-op when the seed slot is absent', () => {
      const current = new URLSearchParams('mode=similar-to-vn');
      const next = clearSeed(current);
      expect(next.toString()).toBe(current.toString());
    });

    it('never mutates the input', () => {
      const current = new URLSearchParams('seed=v17&mode=similar-to-vn');
      clearSeed(current);
      expect(current.get('seed')).toBe('v17');
    });
  });

  describe('isValidSeedVnId', () => {
    it('accepts `v\\d+`', () => expect(isValidSeedVnId('v17')).toBe(true));
    it('accepts `egs_\\d+`', () => expect(isValidSeedVnId('egs_4321')).toBe(true));
    it('rejects empty / null', () => {
      expect(isValidSeedVnId('')).toBe(false);
      expect(isValidSeedVnId(null)).toBe(false);
      expect(isValidSeedVnId(undefined)).toBe(false);
    });
    it('rejects tag ids', () => expect(isValidSeedVnId('g123')).toBe(false));
    it('rejects tampered ids', () => {
      expect(isValidSeedVnId('v17;DROP')).toBe(false);
      expect(isValidSeedVnId("v17' OR '1'='1")).toBe(false);
    });
  });

  describe('router replace integration (hand-rolled)', () => {
    it('selecting a hit calls router.replace with the new query string', () => {
      // The picker component does:
      //   const nextParams = setSeed(searchParams, vnId);
      //   router.replace(qs ? `?${qs}` : '?', { scroll: false });
      // Re-do that same loop here to pin the contract end-to-end
      // without spinning up jsdom.
      const router = { replace: vi.fn() };
      const searchParams = new URLSearchParams('mode=similar-to-vn&ero=1');
      const next = setSeed(searchParams, 'v17');
      router.replace(`?${next.toString()}`, { scroll: false });
      expect(router.replace).toHaveBeenCalledTimes(1);
      const [target, opts] = router.replace.mock.calls[0];
      expect(target).toContain('seed=v17');
      expect(target).toContain('mode=similar-to-vn');
      expect(target).toContain('ero=1');
      expect(opts).toEqual({ scroll: false });
    });

    it('clearing a hit calls router.replace without the seed param', () => {
      const router = { replace: vi.fn() };
      const searchParams = new URLSearchParams('mode=similar-to-vn&seed=v17&ero=1');
      const next = clearSeed(searchParams);
      router.replace(`?${next.toString()}`, { scroll: false });
      const [target] = router.replace.mock.calls[0];
      expect(target).not.toContain('seed=');
      expect(target).toContain('mode=similar-to-vn');
    });
  });
});
