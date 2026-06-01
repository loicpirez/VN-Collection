import { createHash } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import {
  readCachedJson,
  readCachedJsonMany,
  type CachedJsonRead,
} from '@/lib/vndb-cache';
import { asJsonRecord } from '@/lib/json-shape';

function key(method: string, pathTag: string, body?: unknown): string {
  if (!body) return `${pathTag}|${method}|`;
  const hash = createHash('sha1').update(JSON.stringify(body)).digest('hex').slice(0, 16);
  return `${pathTag}|${method}|${hash}`;
}

function seed(cacheKey: string, value: unknown): void {
  const now = Date.now();
  db.prepare(`
    INSERT OR REPLACE INTO vndb_cache
      (cache_key, body, etag, last_modified, fetched_at, expires_at)
    VALUES (?, ?, NULL, NULL, ?, ?)
  `).run(cacheKey, JSON.stringify(value), now, now + 60_000);
}

function decodeResults(value: unknown): { results: string[] } | null {
  const record = asJsonRecord(value);
  if (!record || !Array.isArray(record.results) || !record.results.every((item) => typeof item === 'string')) {
    return null;
  }
  return { results: record.results };
}

afterEach(() => {
  db.prepare(`DELETE FROM vndb_cache WHERE cache_key LIKE 'TEST /direct-cache:%'`).run();
});

describe('direct VNDB cache validation', () => {
  it('returns decoder-normalized payloads and treats malformed containers as misses', () => {
    const body = { filters: ['id', '=', 'v990001'] };
    const cacheKey = key('POST', 'TEST /direct-cache:single', body);
    seed(cacheKey, { results: ['valid'] });
    expect(readCachedJson('POST', 'TEST /direct-cache:single', body, decodeResults)).toEqual({
      results: ['valid'],
    });

    seed(cacheKey, { results: {} });
    expect(readCachedJson('POST', 'TEST /direct-cache:single', body, decodeResults)).toBeNull();
  });

  it('keeps valid batched rows when another row is malformed', () => {
    const reads: CachedJsonRead[] = [
      { id: 'v990002', method: 'POST', pathTag: 'TEST /direct-cache:many', body: { id: 'v990002' } },
      { id: 'v990003', method: 'POST', pathTag: 'TEST /direct-cache:many', body: { id: 'v990003' } },
    ];
    seed(key('POST', reads[0].pathTag, reads[0].body), { results: {} });
    seed(key('POST', reads[1].pathTag, reads[1].body), { results: ['valid'] });

    expect(readCachedJsonMany(reads, decodeResults)).toEqual(
      new Map([['v990003', { results: ['valid'] }]]),
    );
  });
});
