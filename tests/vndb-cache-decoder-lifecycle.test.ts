import { createHash } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { asJsonRecord } from '@/lib/json-shape';
import { db } from '@/lib/db';

const throttledFetchMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/vndb-throttle', () => ({
  throttledFetch: throttledFetchMock,
}));

import { cachedFetch } from '@/lib/vndb-cache';

const URL = 'https://api.vndb.org/kana/vn';

function key(method: string, pathTag: string, body?: unknown): string {
  if (!body) return `${pathTag}|${method}|`;
  const hash = createHash('sha1').update(JSON.stringify(body)).digest('hex').slice(0, 16);
  return `${pathTag}|${method}|${hash}`;
}

function seed(pathTag: string, body: unknown, value: unknown, expiresAt: number, etag: string | null = null): void {
  const now = Date.now();
  db.prepare(`
    INSERT OR REPLACE INTO vndb_cache
      (cache_key, body, etag, last_modified, fetched_at, expires_at)
    VALUES (?, ?, ?, NULL, ?, ?)
  `).run(key('POST', pathTag, body), JSON.stringify(value), etag, now - 1000, expiresAt);
}

function decodeResults(value: unknown): { results: string[] } | null {
  const record = asJsonRecord(value);
  if (!record || !Array.isArray(record.results) || !record.results.every((item) => typeof item === 'string')) {
    return null;
  }
  return { results: record.results.map((item) => item.toLowerCase()) };
}

function run(pathTag: string, body: unknown) {
  return cachedFetch(
    URL,
    { __pathTag: pathTag, method: 'POST', body: JSON.stringify(body) },
    { ttlMs: 60_000, decode: decodeResults },
  );
}

beforeEach(() => {
  throttledFetchMock.mockReset();
});

afterEach(() => {
  db.prepare(`DELETE FROM vndb_cache WHERE cache_key LIKE 'TEST /decoder:%'`).run();
});

describe('VNDB cache decoder lifecycle', () => {
  it('normalizes fresh cache hits without requesting upstream', async () => {
    const body = { id: 1 };
    seed('TEST /decoder:fresh', body, { results: ['VALUE'] }, Date.now() + 60_000);
    await expect(run('TEST /decoder:fresh', body)).resolves.toMatchObject({
      data: { results: ['value'] },
      fromCache: true,
    });
    expect(throttledFetchMock).not.toHaveBeenCalled();
  });

  it('treats malformed fresh cache as a miss and validates the refetched body', async () => {
    const body = { id: 2 };
    seed('TEST /decoder:refetch', body, { results: {} }, Date.now() + 60_000);
    throttledFetchMock.mockResolvedValue(new Response(JSON.stringify({ results: ['LIVE'] })));
    await expect(run('TEST /decoder:refetch', body)).resolves.toMatchObject({
      data: { results: ['live'] },
      fromCache: false,
    });
  });

  it('validates stale fallback after an upstream failure', async () => {
    const body = { id: 3 };
    seed('TEST /decoder:stale', body, { results: ['STALE'] }, Date.now() - 1000);
    throttledFetchMock.mockRejectedValue(new Error('offline'));
    await expect(run('TEST /decoder:stale', body)).resolves.toMatchObject({
      data: { results: ['stale'] },
      fromCache: true,
      stale: true,
    });
  });

  it('validates cached bodies after 304 revalidation', async () => {
    const body = { id: 4 };
    seed('TEST /decoder:revalidated', body, { results: ['CACHED'] }, Date.now() - 1000, 'etag');
    throttledFetchMock.mockResolvedValue(new Response(null, { status: 304 }));
    await expect(run('TEST /decoder:revalidated', body)).resolves.toMatchObject({
      data: { results: ['cached'] },
      fromCache: true,
      status: 304,
    });
  });

  it('rejects malformed live upstream bodies before caching them', async () => {
    const body = { id: 5 };
    throttledFetchMock.mockResolvedValue(new Response(JSON.stringify({ results: {} })));
    await expect(run('TEST /decoder:invalid-live', body)).rejects.toThrow(/invalid payload shape/);
  });
});
