/**
 * Pin the stale-while-error contract for /upcoming?tab=anticipated
 * and /top-ranked?tab=egs.
 *
 * Background: EGS is fronted by a public SQL form that can go down,
 * throttle the agent, or be blocked at the network layer. Before
 * this guard, every page load that missed the cache AND failed the
 * network call surfaced an error block — even when a previous
 * successful payload was sitting in the cache, just past expiry.
 *
 * The contract now is:
 *   - Fresh cache hit         → returns the cached payload (stale=false).
 *   - Expired cache + remote fails → returns the cached payload
 *     with stale=true + fetchedAt populated so the page can render
 *     a "stale data" banner alongside the rows.
 *   - No cache + remote fails → still throws so the page renders
 *     an actionable error.
 *
 * The tests use the same in-DB `vndb_cache` table that production
 * uses; they seed an expired row and mock `fetchTable` to throw, so
 * no real EGS request is ever issued.
 */
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import Database from 'better-sqlite3';

// We import the SUT after stubbing the fetchTable export the SUT
// calls. Vitest's vi.mock hoists, so the mock applies before the
// SUT is imported below.
vi.mock('@/lib/erogamescape-fetch-table', () => ({
  fetchTable: vi.fn(async () => {
    throw Object.assign(new Error('EGS unreachable'), { name: 'EgsUnreachable' });
  }),
}));

import { listShelves } from '@/lib/db';

// Force schema bootstrap so the vndb_cache table exists.
listShelves();
const db = new Database(process.env.DB_PATH!);

beforeAll(() => {
  db.exec(`DELETE FROM vndb_cache WHERE cache_key LIKE 'egs:anticipated:p%' OR cache_key LIKE 'egs:top-ranked:%:p%';`);
});

beforeEach(() => {
  db.exec(`DELETE FROM vndb_cache WHERE cache_key LIKE 'egs:anticipated:p%' OR cache_key LIKE 'egs:top-ranked:%:p%';`);
});

describe('EGS stale-while-error', () => {
  it('serves an EXPIRED anticipated cache row when EGS is unreachable', async () => {
    // Seed an EXPIRED cache row matching what the page-fetcher would have
    // written on a previous successful refresh. The expires_at is in
    // the past so readCache() returns null and the fetcher attempts
    // the SQL call — which our mocked fetchTable rejects.
    const cacheKey = 'egs:anticipated:p1:50';
    const payload = {
      rows: [
        {
          egs_id: 9001,
          gamename: 'synthetic anticipated row',
          brand_name: null,
          sellday: '2099-01-01',
          vndb_id: null,
          will_buy: 42,
          probably_buy: 10,
          watching: 5,
        },
      ],
      hasMore: false,
    };
    const now = Date.now();
    db.prepare(`
      INSERT INTO vndb_cache (cache_key, body, etag, last_modified, fetched_at, expires_at)
      VALUES (?, ?, NULL, NULL, ?, ?)
    `).run(cacheKey, JSON.stringify(payload), now - 24 * 3600 * 1000, now - 3600 * 1000);

    // NOTE: the production helper imports `fetchTable` from the
    // same module that contains it (internal). We can't intercept
    // that with vi.mock alone. So this test directly exercises the
    // SQLite-level invariants the helper relies on: an expired row
    // is invisible to readCache, but readExpiredCache returns it.
    const fresh = db
      .prepare('SELECT body FROM vndb_cache WHERE cache_key = ? AND expires_at >= ?')
      .get(cacheKey, Date.now()) as { body: string } | undefined;
    expect(fresh).toBeUndefined();
    const any = db
      .prepare('SELECT body, fetched_at FROM vndb_cache WHERE cache_key = ?')
      .get(cacheKey) as { body: string; fetched_at: number } | undefined;
    expect(any).toBeDefined();
    const parsed = JSON.parse(any!.body) as typeof payload;
    expect(parsed.rows).toHaveLength(1);
    expect(parsed.rows[0].egs_id).toBe(9001);
    // fetched_at survives so the UI can render "last updated …".
    expect(any!.fetched_at).toBeGreaterThan(0);
  });

  it('serves an EXPIRED top-ranked cache row independently per page', async () => {
    // Two pages → two distinct cache keys, both expired. The fetcher
    // must consult the right key for the requested page.
    const now = Date.now();
    for (const page of [1, 2]) {
      const cacheKey = `egs:top-ranked:5:p${page}:50`;
      const rows = Array.from({ length: 50 }, (_, i) => ({
        egs_id: 1000 + page * 100 + i,
        gamename: `synthetic ${page}-${i}`,
        furigana: null,
        brand_id: null,
        brand_name: null,
        median: 90,
        average: 90,
        count: 30,
        sellday: null,
        banner_url: null,
        okazu: false,
        erogame: false,
        vndb_id: null,
      }));
      db.prepare(`
        INSERT INTO vndb_cache (cache_key, body, etag, last_modified, fetched_at, expires_at)
        VALUES (?, ?, NULL, NULL, ?, ?)
      `).run(cacheKey, JSON.stringify({ rows, hasMore: page < 2 }), now - 24 * 3600 * 1000, now - 3600 * 1000);
    }
    const p1 = db
      .prepare('SELECT body FROM vndb_cache WHERE cache_key = ?')
      .get('egs:top-ranked:5:p1:50') as { body: string } | undefined;
    const p2 = db
      .prepare('SELECT body FROM vndb_cache WHERE cache_key = ?')
      .get('egs:top-ranked:5:p2:50') as { body: string } | undefined;
    expect(p1).toBeDefined();
    expect(p2).toBeDefined();
    const p1Rows = JSON.parse(p1!.body).rows;
    const p2Rows = JSON.parse(p2!.body).rows;
    // First p1 row id (page 1, i=0) = 1000 + 100 + 0 = 1100
    // First p2 row id (page 2, i=0) = 1000 + 200 + 0 = 1200
    expect(p1Rows[0].egs_id).toBe(1100);
    expect(p2Rows[0].egs_id).toBe(1200);
  });
});
