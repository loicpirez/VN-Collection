import { describe, expect, it, vi } from 'vitest';
import { collectUniqueVndbPages } from '@/lib/vndb-pagination';

describe('collectUniqueVndbPages', () => {
  it('follows every page and de-duplicates ids case-insensitively', async () => {
    const load = vi.fn()
      .mockResolvedValueOnce({ results: [{ id: 'c1' }, { id: 'C2' }], more: true })
      .mockResolvedValueOnce({ results: [{ id: 'c2' }, { id: 'c3' }], more: false });

    await expect(collectUniqueVndbPages(load)).resolves.toEqual([
      { id: 'c1' },
      { id: 'C2' },
      { id: 'c3' },
    ]);
    expect(load.mock.calls).toEqual([[1], [2]]);
  });

  it('fails closed when upstream never closes pagination', async () => {
    const load = vi.fn().mockResolvedValue({ results: [], more: true });
    await expect(collectUniqueVndbPages(load, 2)).rejects.toThrow('exceeded 2 pages');
    expect(load).toHaveBeenCalledTimes(2);
  });
});
