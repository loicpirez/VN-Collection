/**
 * Coverage for src/lib/producer-completion.ts → fetchProducerCompletion.
 *
 * Queries VNDB (`developer` filter on POST /vn) through the real
 * `cachedFetch`, cross-references the returned VN ids against the local
 * `collection` table, and computes:
 *   - totalKnown  = decoded VN count
 *   - ownedCount  = how many are in the collection
 *   - pct         = round(ownedCount / totalKnown * 100)
 *   - vns[]       = each row enriched with an `owned` flag + vnId rename
 *
 * Hermetic: only `throttledFetch` is mocked. Ownership is seeded into
 * the real `collection` table. Synthetic ids only.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const throttledFetchMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/vndb-throttle', () => ({
  throttledFetch: throttledFetchMock,
}));

import { db } from '@/lib/db';
import { fetchProducerCompletion } from '@/lib/producer-completion';

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

function completionRow(id: string) {
  return { id, title: 'Catalogue VN', alttitle: null, released: null, rating: null, image: null };
}

function seedOwned(vnId: string): void {
  db.prepare(`INSERT INTO vn (id, title, fetched_at) VALUES (?, 'Owned', ?) ON CONFLICT(id) DO NOTHING`)
    .run(vnId, Date.now());
  db.prepare(`
    INSERT INTO collection (vn_id, status, added_at, updated_at, playtime_minutes)
    VALUES (?, 'finished', ?, ?, 0)
    ON CONFLICT(vn_id) DO NOTHING
  `).run(vnId, Date.now(), Date.now());
}

beforeEach(() => {
  throttledFetchMock.mockReset();
  db.prepare(`DELETE FROM vndb_cache WHERE cache_key LIKE 'POST /vn:producer|%'`).run();
});

afterEach(() => {
  db.prepare('DELETE FROM collection').run();
  db.prepare(`DELETE FROM vn WHERE id LIKE 'v90%'`).run();
});

describe('fetchProducerCompletion', () => {
  it('returns all-zero totals when VNDB reports no developed VNs', async () => {
    throttledFetchMock.mockResolvedValue(jsonResponse({ results: [] }));
    const r = await fetchProducerCompletion('p90040');
    expect(r).toEqual({ totalKnown: 0, ownedCount: 0, pct: 0, vns: [] });
  });

  it('computes pct + ownedCount and tags each VN with ownership', async () => {
    seedOwned('v90041');
    seedOwned('v90043');
    throttledFetchMock.mockResolvedValue(
      jsonResponse({
        results: [completionRow('v90041'), completionRow('v90042'), completionRow('v90043'), completionRow('v90044')],
      }),
    );

    const r = await fetchProducerCompletion('p90041');
    expect(r.totalKnown).toBe(4);
    expect(r.ownedCount).toBe(2);
    expect(r.pct).toBe(50);
    expect(r.vns.map((v) => v.vnId)).toEqual(['v90041', 'v90042', 'v90043', 'v90044']);
    expect(r.vns.find((v) => v.vnId === 'v90041')?.owned).toBe(true);
    expect(r.vns.find((v) => v.vnId === 'v90042')?.owned).toBe(false);
  });

  it('rounds the completion percentage to the nearest integer', async () => {
    seedOwned('v90051');
    throttledFetchMock.mockResolvedValue(
      jsonResponse({ results: [completionRow('v90051'), completionRow('v90052'), completionRow('v90053')] }),
    );
    // 1 / 3 = 33.33% → rounds to 33.
    const r = await fetchProducerCompletion('p90051');
    expect(r.totalKnown).toBe(3);
    expect(r.ownedCount).toBe(1);
    expect(r.pct).toBe(33);
  });

  it('reports 100% when every developed VN is owned', async () => {
    seedOwned('v90061');
    seedOwned('v90062');
    throttledFetchMock.mockResolvedValue(
      jsonResponse({ results: [completionRow('v90061'), completionRow('v90062')] }),
    );
    const r = await fetchProducerCompletion('p90061');
    expect(r.pct).toBe(100);
    expect(r.ownedCount).toBe(2);
  });

  it('normalizes upstream VN ids to lowercase before the ownership join', async () => {
    seedOwned('v90071');
    throttledFetchMock.mockResolvedValue(
      jsonResponse({ results: [completionRow('V90071'), completionRow('V90072')] }),
    );
    const r = await fetchProducerCompletion('p90071');
    expect(r.vns.map((v) => v.vnId)).toEqual(['v90071', 'v90072']);
    expect(r.vns.find((v) => v.vnId === 'v90071')?.owned).toBe(true);
    expect(r.ownedCount).toBe(1);
  });
});
