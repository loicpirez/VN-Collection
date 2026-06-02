/**
 * Complementary hermetic coverage for `src/lib/vndb-scrape.ts`, targeting the
 * branches the existing queue test does not exercise: the SSRF-allowlist
 * rejection, the Content-Length cap, and the streamed-body byte-cap loop
 * (including the cap-exceeded cancel path). `safeFetch` is mocked; no network.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/safe-fetch', () => ({ safeFetch: vi.fn() }));

import { db } from '@/lib/db';
import { safeFetch } from '@/lib/safe-fetch';

const mockSafeFetch = vi.mocked(safeFetch);

const MAX_HTML_BYTES = 8 * 1024 * 1024;

/** Build a Response whose body is a real ReadableStream of the given chunks. */
function streamingResponse(chunks: Uint8Array[], headers: Record<string, string> = {}): Response {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const c of chunks) controller.enqueue(c);
      controller.close();
    },
  });
  return new Response(stream, { status: 200, headers });
}

function clearKey(path: string): void {
  db.prepare(`DELETE FROM vndb_cache WHERE cache_key = ?`).run(`scrape:${path}`);
}

beforeEach(() => {
  mockSafeFetch.mockReset();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('fetchVndbWebHtml — SSRF allowlist', () => {
  it('returns null without fetching when the resolved host is off-allowlist', async () => {
    // `https://vndb.org` + `@evil.com/x` resolves to host `evil.com`, which is
    // not on the SSRF allowlist, so the target is rejected before any fetch.
    const { fetchVndbWebHtml } = await import('@/lib/vndb-scrape');
    const result = await fetchVndbWebHtml('@evil.com/x', { force: true });
    expect(result).toBeNull();
    expect(mockSafeFetch).not.toHaveBeenCalled();
  });
});

describe('fetchVndbWebHtml — Content-Length cap', () => {
  it('returns null when the declared Content-Length exceeds the cap', async () => {
    const path = '/p70001';
    clearKey(path);
    mockSafeFetch.mockResolvedValue(
      streamingResponse([new Uint8Array([60])], { 'content-length': String(MAX_HTML_BYTES + 1) }),
    );
    const { fetchVndbWebHtml } = await import('@/lib/vndb-scrape');
    const promise = fetchVndbWebHtml(path, { force: true });
    await vi.runAllTimersAsync();
    expect(await promise).toBeNull();
    clearKey(path);
  });
});

describe('fetchVndbWebHtml — streamed body cap', () => {
  it('decodes a streamed body assembled from multiple chunks', async () => {
    const path = '/p70002';
    clearKey(path);
    const enc = new TextEncoder();
    mockSafeFetch.mockResolvedValue(
      streamingResponse([enc.encode('<html>'), enc.encode('<body>ok'), enc.encode('</body></html>')]),
    );
    const { fetchVndbWebHtml } = await import('@/lib/vndb-scrape');
    const promise = fetchVndbWebHtml(path, { force: true });
    await vi.runAllTimersAsync();
    const html = await promise;
    expect(html).toBe('<html><body>ok</body></html>');
    const cached = db.prepare(`SELECT body FROM vndb_cache WHERE cache_key = ?`).get(`scrape:${path}`) as { body: string } | undefined;
    expect(cached?.body).toBe('<html><body>ok</body></html>');
    clearKey(path);
  });

  it('returns null when the streamed body exceeds the byte cap mid-stream', async () => {
    const path = '/p70003';
    clearKey(path);
    // Two ~5 MiB chunks: the running total trips the 8 MiB cap on the second,
    // exercising the cancel + early return path.
    const big = new Uint8Array(5 * 1024 * 1024).fill(65);
    mockSafeFetch.mockResolvedValue(streamingResponse([big, big]));
    const { fetchVndbWebHtml } = await import('@/lib/vndb-scrape');
    const promise = fetchVndbWebHtml(path, { force: true });
    await vi.runAllTimersAsync();
    expect(await promise).toBeNull();
    // Nothing should have been cached.
    const cached = db.prepare(`SELECT body FROM vndb_cache WHERE cache_key = ?`).get(`scrape:${path}`);
    expect(cached).toBeUndefined();
    clearKey(path);
  });

  it('retries to the next attempt when a response has no readable body', async () => {
    const path = '/p70004';
    clearKey(path);
    const enc = new TextEncoder();
    // First response: a 200 with a null body (no reader) → continue.
    // Second response: a normal streamed body → success.
    mockSafeFetch
      .mockResolvedValueOnce(new Response(null, { status: 200 }))
      .mockResolvedValueOnce(streamingResponse([enc.encode('<html>retry-ok</html>')]));
    const { fetchVndbWebHtml } = await import('@/lib/vndb-scrape');
    const promise = fetchVndbWebHtml(path, { force: true });
    await vi.runAllTimersAsync();
    expect(await promise).toBe('<html>retry-ok</html>');
    clearKey(path);
  });
});

describe('fetchVndbWebHtml — concurrent queue drain', () => {
  it('serialises two concurrent fetches through the in-process queue', async () => {
    const pathA = '/p70005';
    const pathB = '/p70006';
    clearKey(pathA);
    clearKey(pathB);
    const enc = new TextEncoder();
    mockSafeFetch.mockImplementation(async () => streamingResponse([enc.encode('<html>drained</html>')]));
    const { fetchVndbWebHtml } = await import('@/lib/vndb-scrape');
    const pA = fetchVndbWebHtml(pathA, { force: true });
    const pB = fetchVndbWebHtml(pathB, { force: true });
    await vi.runAllTimersAsync();
    const [a, b] = await Promise.all([pA, pB]);
    expect(a).toBe('<html>drained</html>');
    expect(b).toBe('<html>drained</html>');
    clearKey(pathA);
    clearKey(pathB);
  });
});
