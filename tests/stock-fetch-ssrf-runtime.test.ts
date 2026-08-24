import { describe, expect, it, vi } from 'vitest';
import { erogePriceJsonFetcher } from '@/lib/stock';

describe('stock fetch SSRF runtime guard', () => {
  it('rejects invalid and unapproved targets before issuing a network request', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    await expect(erogePriceJsonFetcher('not-a-url')).rejects.toThrow('Blocked stock URL: invalid host');
    await expect(erogePriceJsonFetcher('https://unapproved.example.test/private')).rejects.toThrow(
      'Blocked stock URL: unapproved.example.test',
    );
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
