import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '@/lib/db';

const FAKE_HTML = '<html><body>test page</body></html>';
const VNDB_PATH = '/p99999-test-slug';
const CACHE_KEY = `scrape:${VNDB_PATH}`;
const FAR_FUTURE = Date.now() + 86_400_000 * 30;

function clearCache(): void {
  db.prepare(`DELETE FROM vndb_cache WHERE cache_key = ?`).run(CACHE_KEY);
}

beforeEach(() => {
  clearCache();
  vi.useFakeTimers();
});

afterEach(() => {
  clearCache();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('fetchVndbWebHtml', () => {
  it('returns cached HTML without calling fetch when cache is fresh', async () => {
    db.prepare(
      `INSERT INTO vndb_cache (cache_key, body, etag, last_modified, fetched_at, expires_at)
       VALUES (?, ?, NULL, NULL, ?, ?)`,
    ).run(CACHE_KEY, FAKE_HTML, Date.now(), FAR_FUTURE);

    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const { fetchVndbWebHtml } = await import('@/lib/vndb-scrape');
    const result = await fetchVndbWebHtml(VNDB_PATH);

    expect(result).toBe(FAKE_HTML);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('re-fetches when the cached entry is stale (expires_at in the past)', async () => {
    const PAST = Date.now() - 1_000;
    db.prepare(
      `INSERT INTO vndb_cache (cache_key, body, etag, last_modified, fetched_at, expires_at)
       VALUES (?, ?, NULL, NULL, ?, ?)`,
    ).run(CACHE_KEY, 'stale-html', Date.now() - 86_400_000, PAST);

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(FAKE_HTML, { status: 200 }),
    );

    const { fetchVndbWebHtml } = await import('@/lib/vndb-scrape');
    const resultPromise = fetchVndbWebHtml(VNDB_PATH);
    await vi.runAllTimersAsync();
    const result = await resultPromise;

    expect(result).toBe(FAKE_HTML);
  });

  it('stores fetched HTML in the cache on success', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(FAKE_HTML, { status: 200 }),
    );

    const { fetchVndbWebHtml } = await import('@/lib/vndb-scrape');
    const resultPromise = fetchVndbWebHtml(VNDB_PATH, { force: true });
    await vi.runAllTimersAsync();
    const result = await resultPromise;

    expect(result).toBe(FAKE_HTML);
    const cached = db
      .prepare(`SELECT body FROM vndb_cache WHERE cache_key = ?`)
      .get(CACHE_KEY) as { body: string } | undefined;
    expect(cached?.body).toBe(FAKE_HTML);
  });

  it('returns null after all retries fail with network error', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network error'));

    const { fetchVndbWebHtml } = await import('@/lib/vndb-scrape');
    const resultPromise = fetchVndbWebHtml(VNDB_PATH, { force: true });
    await vi.runAllTimersAsync();
    const result = await resultPromise;

    expect(result).toBeNull();
  });

  it('returns null after all retries fail with non-ok response', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('Not Found', { status: 404 }),
    );

    const { fetchVndbWebHtml } = await import('@/lib/vndb-scrape');
    const resultPromise = fetchVndbWebHtml(VNDB_PATH, { force: true });
    await vi.runAllTimersAsync();
    const result = await resultPromise;

    expect(result).toBeNull();
  });

  it('processes a second request after a fetch failure', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('always fails'));

    const { fetchVndbWebHtml } = await import('@/lib/vndb-scrape');

    const first = fetchVndbWebHtml('/p99998', { force: true });
    await vi.runAllTimersAsync();
    const firstResult = await first;
    expect(firstResult).toBeNull();

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(FAKE_HTML, { status: 200 }));

    const second = fetchVndbWebHtml(VNDB_PATH, { force: true });
    await vi.runAllTimersAsync();
    const secondResult = await second;

    expect(secondResult).toBe(FAKE_HTML);
  });
});

describe('htmlToText', () => {
  it('strips HTML tags and returns plain text', async () => {
    const { htmlToText } = await import('@/lib/vndb-scrape');
    expect(htmlToText('<p>Hello <b>world</b></p>')).toBe('Hello world');
  });

  it('handles empty string', async () => {
    const { htmlToText } = await import('@/lib/vndb-scrape');
    expect(htmlToText('')).toBe('');
  });
});
