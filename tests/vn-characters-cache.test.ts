/**
 * Audit P-209: the per-page cache for /api/vn/[id]/characters
 * deduplicates concurrent and back-to-back fetches by CharactersSection
 * + RoutesSection.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchVnCharacters, invalidateVnCharactersCache } from '@/lib/vn-characters-cache';

describe('vn-characters-cache (P-209)', () => {
  const VN_ID = 'v90017';
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    invalidateVnCharactersCache(VN_ID);
    fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ characters: [{ id: 'c95001', name: 'Sample', localImage: null }] }),
    });
    vi.stubGlobal('fetch', fetchSpy);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    invalidateVnCharactersCache(VN_ID);
  });

  it('first call issues a single network request', async () => {
    const rows = await fetchVnCharacters(VN_ID);
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe('c95001');
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('second sequential call within TTL hits cache (no second fetch)', async () => {
    await fetchVnCharacters(VN_ID);
    await fetchVnCharacters(VN_ID);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('concurrent in-flight calls share a single Promise', async () => {
    const [a, b] = await Promise.all([
      fetchVnCharacters(VN_ID),
      fetchVnCharacters(VN_ID),
    ]);
    expect(a).toBe(b);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('invalidate clears the cache', async () => {
    await fetchVnCharacters(VN_ID);
    invalidateVnCharactersCache(VN_ID);
    await fetchVnCharacters(VN_ID);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('failed fetch does not poison cache (next call retries)', async () => {
    fetchSpy.mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({}) });
    fetchSpy.mockResolvedValueOnce({
      ok: true, status: 200,
      json: async () => ({ characters: [{ id: 'c95001', name: 'Sample', localImage: null }] }),
    });
    await expect(fetchVnCharacters(VN_ID)).rejects.toThrow();
    const rows = await fetchVnCharacters(VN_ID);
    expect(rows[0].id).toBe('c95001');
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });
});
