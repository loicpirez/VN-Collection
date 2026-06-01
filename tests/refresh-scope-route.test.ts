/**
 * R5-058 / R5-106 / R5-215 — pin the POST `/api/refresh/scope` route's
 * behaviour:
 *   - Busts ONLY the cache rows matching the resolved scope patterns.
 *   - Returns the count of rows deleted.
 *   - 400 on unknown scope id.
 *   - 400 on unbound param placeholder.
 *   - 400 on unsafe param value (LIKE metacharacter).
 *
 * The route is gated by `requireLocalhostOrToken`. The test runs in
 * the vitest server context (loopback), so the gate passes by virtue
 * of the request's loopback origin.
 */
import Database from 'better-sqlite3';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { POST } from '@/app/api/refresh/scope/route';
import type { NextRequest } from 'next/server';

// Force lib/db bootstrap so vndb_cache exists.
db.prepare('SELECT 1').get();

const rawDb = new Database(process.env.DB_PATH!);

function seed(cacheKey: string, body = '{}'): void {
  const now = Date.now();
  rawDb
    .prepare(
      `INSERT OR REPLACE INTO vndb_cache (cache_key, body, fetched_at, expires_at)
       VALUES (?, ?, ?, ?)`,
    )
    .run(cacheKey, body, now, now + 60_000);
}

function postScope(body: object): NextRequest {
  // Build a NextRequest from the Web Request constructor — Next.js's
  // NextRequest is a subclass but our route only reads `.json()` and
  // (via requireLocalhostOrToken) the URL host, both of which the
  // base Request satisfies. The cast is safe because the route
  // doesn't touch any Next-specific surface.
  return new Request('http://127.0.0.1/api/refresh/scope', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }) as unknown as NextRequest;
}

beforeAll(() => {
  rawDb.exec('DELETE FROM vndb_cache');
});

afterAll(() => {
  rawDb.close();
});

describe('POST /api/refresh/scope — R5-058 behaviour', () => {
  beforeEach(() => {
    rawDb.exec('DELETE FROM vndb_cache');
  });

  it('busts only rows matching the scope patterns (tags-list)', async () => {
    seed('POST /tag|POST|abc');
    seed('tag_full:g73');
    seed('POST /vn|POST|xyz'); // NOT in scope — should survive
    seed('egs:anticipated:1'); // NOT in scope — should survive

    const res = await POST(postScope({ scope: 'tags-list' }));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.deleted).toBe(2);

    // Surviving rows confirm the bust didn't widen.
    const survivors = rawDb
      .prepare('SELECT cache_key FROM vndb_cache ORDER BY cache_key')
      .all() as Array<{ cache_key: string }>;
    expect(survivors.map((r) => r.cache_key)).toEqual([
      'POST /vn|POST|xyz',
      'egs:anticipated:1',
    ]);
  });

  it('busts only the templated tag-detail scope for a specific gid', async () => {
    seed('tag_full:g73');
    seed('tag_full:g100');
    seed('scrape_tag:g73');
    seed('scrape_tag:g100');

    const res = await POST(postScope({ scope: 'tag-detail', params: { gid: 'g73' } }));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.deleted).toBe(2);

    const survivors = rawDb
      .prepare('SELECT cache_key FROM vndb_cache ORDER BY cache_key')
      .all() as Array<{ cache_key: string }>;
    expect(survivors.map((r) => r.cache_key)).toEqual([
      'scrape_tag:g100',
      'tag_full:g100',
    ]);
  });

  it('busts the upcoming-anticipated scope ONLY (not all EGS keys)', async () => {
    seed('egs:anticipated:1');
    seed('egs:anticipated:2');
    seed('egs:top-ranked:1'); // different EGS surface — should survive
    seed('egs:cover-resolved:5'); // covers — should survive

    const res = await POST(postScope({ scope: 'upcoming-anticipated' }));
    const json = await res.json();
    expect(json.deleted).toBe(2);

    const survivors = rawDb
      .prepare('SELECT cache_key FROM vndb_cache ORDER BY cache_key')
      .all() as Array<{ cache_key: string }>;
    expect(survivors.map((r) => r.cache_key)).toEqual([
      'egs:cover-resolved:5',
      'egs:top-ranked:1',
    ]);
  });

  it('returns 400 on unknown scope id', async () => {
    const res = await POST(postScope({ scope: 'not-a-scope' }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('unknown scope');
  });

  it('returns 400 when a templated param is missing', async () => {
    const res = await POST(postScope({ scope: 'tag-detail' }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('missing param');
  });

  it('returns 400 when a param value contains LIKE metacharacters', async () => {
    const res = await POST(postScope({ scope: 'tag-detail', params: { gid: 'g%' } }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('invalid param value');
  });

  it('rejects malformed explicit params containers', async () => {
    expect((await POST(postScope({ scope: 'tags-list', params: [] }))).status).toBe(400);
    expect((await POST(postScope({ scope: 'tags-list', params: { gid: 73 } }))).status).toBe(400);
  });
});
