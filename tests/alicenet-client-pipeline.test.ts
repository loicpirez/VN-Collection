import { afterEach, describe, expect, it, vi } from 'vitest';
import { runAliceNetWholeRefresh, type AliceNetRefreshProgress } from '@/lib/alicenet-pipeline';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

const scraped = { count: 2, added: 1, updated: 1, removed: 0, fetched_at: 1700000000 };

describe('runAliceNetWholeRefresh', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('runs every phase in order and reports per-phase progress', async () => {
    const calls: Array<{ url: string; body: Record<string, unknown> | null }> = [];
    const responses: Response[] = [
      json(scraped),
      json({ processed: 2, matched: 1, remaining: 1 }),
      json({ processed: 1, remaining: 0 }),
      json({ processed: 0, remaining: 2 }),
      json({ processed: 1, matched: 1, remaining: 0 }),
      json({ processed: 1, matched: 1, remaining: 0 }),
      json({ processed: 1, matched: 1, remaining: 0 }),
    ];
    global.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({
        url: String(input),
        body: typeof init?.body === 'string' ? JSON.parse(init.body) as Record<string, unknown> : null,
      });
      const response = responses.shift();
      if (!response) throw new Error('unexpected fetch');
      return response;
    });
    const progress: AliceNetRefreshProgress[] = [];

    const result = await runAliceNetWholeRefresh({
      errorFallback: 'fallback',
      onProgress: (p) => progress.push(p),
    });

    expect(result).toEqual({ scraped, matched: 4 });
    expect(calls.map((c) => c.url)).toEqual([
      '/api/alicenet/fetch',
      '/api/alicenet/match-next',
      '/api/alicenet/match-next',
      '/api/alicenet/match-next',
      '/api/alicenet/match-vndb-from-egs',
      '/api/alicenet/download-vndb',
      '/api/alicenet/resolve-egs',
    ]);
    expect(calls[1]?.body).toMatchObject({ retry_none: false, batch: 5 });
    expect(calls[3]?.body).toMatchObject({ retry_none: true, batch: 4 });
    expect(calls[4]?.body).toMatchObject({ batch: 10 });
    expect(progress).toEqual([
      { phase: 'scrape', done: 0, total: 0 },
      { phase: 'scrape', done: 1, total: 1 },
      { phase: 'match', done: 2, total: 3 },
      { phase: 'match', done: 3, total: 3 },
      { phase: 'retry', done: 0, total: 2 },
      { phase: 'vndb-from-egs', done: 1, total: 1 },
      { phase: 'download-vndb', done: 1, total: 1 },
      { phase: 'resolve-egs', done: 1, total: 1 },
    ]);
  });

  it('stops after scraping when the caller aborts during scrape progress', async () => {
    const ctrl = new AbortController();
    const urls: string[] = [];
    global.fetch = vi.fn(async (input: RequestInfo | URL) => {
      urls.push(String(input));
      return json(scraped);
    });

    const result = await runAliceNetWholeRefresh({
      errorFallback: 'fallback',
      signal: ctrl.signal,
      onProgress: (p) => {
        if (p.phase === 'scrape' && p.done === 1) ctrl.abort();
      },
    });

    expect(result.matched).toBe(0);
    expect(urls).toEqual(['/api/alicenet/fetch']);
  });

  it('uses the server error message when the scrape request fails', async () => {
    global.fetch = vi.fn(async () => json({ error: 'scrape blocked' }, 502));
    await expect(runAliceNetWholeRefresh({ errorFallback: 'fallback' })).rejects.toThrow('scrape blocked');
  });

  it('uses the fallback when the scrape payload is malformed', async () => {
    global.fetch = vi.fn(async () => json({ count: -1, added: 0, updated: 0, removed: 0, fetched_at: 1 }));
    await expect(runAliceNetWholeRefresh({ errorFallback: 'fallback' })).rejects.toThrow('fallback');
  });

  it('uses the server error message when a match phase fails', async () => {
    const responses = [json(scraped), json({ error: 'match failed' }, 500)];
    global.fetch = vi.fn(async () => {
      const response = responses.shift();
      if (!response) throw new Error('unexpected fetch');
      return response;
    });
    await expect(runAliceNetWholeRefresh({ errorFallback: 'fallback' })).rejects.toThrow('match failed');
  });

  it('uses the fallback when a match phase payload is malformed', async () => {
    const responses = [json(scraped), json({ processed: 1, remaining: Number.NaN })];
    global.fetch = vi.fn(async () => {
      const response = responses.shift();
      if (!response) throw new Error('unexpected fetch');
      return response;
    });
    await expect(runAliceNetWholeRefresh({ errorFallback: 'fallback' })).rejects.toThrow('fallback');
  });
});
