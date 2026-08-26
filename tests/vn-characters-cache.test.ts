import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchVnCharacters, invalidateVnCharactersCache } from '@/lib/vn-characters-cache';

describe('vn-characters-cache', () => {
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

  it('keeps the shared request alive while another consumer remains', async () => {
    let resolveFetch: (response: Response) => void = () => {};
    const captured: { signal: AbortSignal | null } = { signal: null };
    fetchSpy.mockImplementationOnce((_url: RequestInfo | URL, init?: RequestInit) => {
      captured.signal = init?.signal ?? null;
      return new Promise<Response>((resolve) => { resolveFetch = resolve; });
    });
    const firstController = new AbortController();
    const secondController = new AbortController();
    const first = fetchVnCharacters(VN_ID, firstController.signal);
    const second = fetchVnCharacters(VN_ID, secondController.signal);
    const firstSettlement = expect(first).rejects.toMatchObject({ name: 'AbortError' });

    firstController.abort();
    await firstSettlement;
    expect(captured.signal?.aborted).toBe(false);
    resolveFetch(new Response(JSON.stringify({ characters: [{ id: 'c95001', name: 'Sample', localImage: null }] })));
    await expect(second).resolves.toHaveLength(1);
    expect(fetchSpy).toHaveBeenCalledOnce();
  });

  it('aborts the network request after its last consumer leaves', async () => {
    const captured: { signal: AbortSignal | null } = { signal: null };
    fetchSpy.mockImplementationOnce((_url: RequestInfo | URL, init?: RequestInit) => {
      captured.signal = init?.signal ?? null;
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')), { once: true });
      });
    });
    const controller = new AbortController();
    const abandoned = fetchVnCharacters(VN_ID, controller.signal);
    const settlement = expect(abandoned).rejects.toMatchObject({ name: 'AbortError' });

    controller.abort();
    await settlement;
    expect(captured.signal?.aborted).toBe(true);
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ characters: [{ id: 'c95002', name: 'Retry', localImage: null }] }),
    });
    await expect(fetchVnCharacters(VN_ID)).resolves.toMatchObject([{ id: 'c95002' }]);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
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
