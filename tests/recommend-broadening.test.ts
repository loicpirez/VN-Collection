/**
 * Pins the broadened recommendation algorithm:
 *   - Multi-seed union (finished / rated / favorite / queue / wishlist).
 *   - Multi-source boost (≥ 2 contributors) + generic-tag penalty map.
 *   - Single-seed graceful fallback.
 *   - useWishlist toggle path.
 *
 * Uses the same upstream VNDB mock pattern as `recommend-modes.test.ts`.
 * Synthetic tag ids (g9xxx) + synthetic VN ids (v9xxxx) — no real titles.
 */
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import Database from 'better-sqlite3';

interface FakeHit {
  id: string;
  title: string;
  rating?: number | null;
  votecount?: number | null;
}

const POOL: Map<string, FakeHit[]> = new Map();

vi.mock('@/lib/vndb-recommend', () => ({
  vndbAdvancedSearchRaw: vi.fn(async (args: { filters: unknown }) => {
    const filters = args.filters as [
      string,
      [string, string, [string, ...unknown[]]],
      [string, string, number],
    ];
    const seedId = filters?.[1]?.[2]?.[0];
    const minVotes = filters?.[2]?.[2] ?? 0;
    if (!seedId) return [];
    return (POOL.get(seedId) ?? []).filter((h) => (h.votecount ?? 0) >= minVotes);
  }),
}));

import {
  addToCollection,
  listShelves,
  updateCollection,
} from '@/lib/db';
import {
  applyGenericPenalty,
  GENERIC_TAG_PENALTY_MAP,
  recommendVns,
} from '@/lib/recommend';

listShelves();
const db = new Database(process.env.DB_PATH!);

function seedVn(
  id: string,
  tags: Array<{ id: string; name: string; rating?: number; category?: string }>,
): void {
  db.prepare(
    `INSERT OR REPLACE INTO vn (id, title, tags, fetched_at) VALUES (?, ?, ?, ?)`,
  ).run(id, `placeholder-${id}`, JSON.stringify(tags), Date.now());
}

function clearAll(): void {
  db.exec(`
    DELETE FROM collection WHERE vn_id LIKE 'v9%';
    DELETE FROM reading_queue WHERE vn_id LIKE 'v9%';
    DELETE FROM vn WHERE id LIKE 'v9%';
    DELETE FROM vndb_cache WHERE cache_key LIKE '%g9%' OR cache_key LIKE '%/ulist%';
  `);
  POOL.clear();
}

beforeAll(() => clearAll());
beforeEach(() => clearAll());

describe('recommendVns() — broadening + generic-tag penalty', () => {
  it('applyGenericPenalty downweights ADV/Male-protag/High-school-heroine', () => {
    expect(GENERIC_TAG_PENALTY_MAP.g134).toBeDefined();
    expect(GENERIC_TAG_PENALTY_MAP.g630).toBeDefined();
    expect(GENERIC_TAG_PENALTY_MAP.g69).toBeDefined();
    expect(applyGenericPenalty('g134', 10)).toBeLessThan(10);
    expect(applyGenericPenalty('g99999', 10)).toBe(10);
  });

  it('5 seed VNs sharing 2 distinctive tags + 3 generic — distinctive rank first', async () => {
    // Five synthetic seeds; each shares two distinctive non-generic tags
    // (gD1 + gD2) and three universal/generic tags (g134, g630, g69).
    // Two of the seeds are merely rated; one is favourited; one is
    // finished; one is in the reading queue. The wishlist column stays
    // empty.
    const tags = [
      { id: 'gD1', name: 'distinctive-1', rating: 2.5 },
      { id: 'gD2', name: 'distinctive-2', rating: 2.5 },
      { id: 'g134', name: 'ADV', rating: 2.9 },
      { id: 'g630', name: 'Male Protagonist', rating: 2.9 },
      { id: 'g69', name: 'High School Heroine', rating: 2.9 },
    ];
    for (let i = 0; i < 5; i += 1) {
      const vnId = `v9${(90100 + i).toString()}`;
      seedVn(vnId, tags);
      addToCollection(vnId, {});
    }
    // Seed metadata differentiating signal classes:
    updateCollection('v990100', { status: 'completed', user_rating: 85 });
    updateCollection('v990101', { user_rating: 80 });
    updateCollection('v990102', { user_rating: 75 });
    updateCollection('v990103', { favorite: true, user_rating: 90 });
    // queue
    db.prepare(
      `INSERT OR REPLACE INTO reading_queue (vn_id, position, added_at) VALUES (?, 1, ?)`,
    ).run('v990104', Date.now());

    // Each tag returns at least one candidate so we can observe seed
    // ranking purely via the seeds field (the result list adds a layer
    // of noise we don't need to assert here).
    POOL.set('gD1', [{ id: 'v999D1', title: 'cand-D1', rating: 80, votecount: 300 }]);
    POOL.set('gD2', [{ id: 'v999D2', title: 'cand-D2', rating: 80, votecount: 300 }]);
    POOL.set('g134', [{ id: 'v9991A', title: 'cand-ADV', rating: 80, votecount: 300 }]);
    POOL.set('g630', [{ id: 'v9991B', title: 'cand-Male', rating: 80, votecount: 300 }]);
    POOL.set('g69', [{ id: 'v9991C', title: 'cand-HS', rating: 80, votecount: 300 }]);

    const r = await recommendVns({ mode: 'because-you-liked', tagLimit: 10 });

    // signalCounts surfaced
    expect(r.signalCounts).toBeDefined();
    expect(r.signalCounts!.finished).toBeGreaterThanOrEqual(1);
    expect(r.signalCounts!.rated).toBeGreaterThanOrEqual(2);
    expect(r.signalCounts!.favorite).toBeGreaterThanOrEqual(1);
    expect(r.signalCounts!.queue).toBeGreaterThanOrEqual(1);
    expect(r.signalCounts!.total).toBe(5);

    // Distinctive tags rank above ALL three generic tags after penalty.
    const order = r.seeds.map((s) => s.tagId);
    const idxD1 = order.indexOf('gD1');
    const idxD2 = order.indexOf('gD2');
    const idxADV = order.indexOf('g134');
    const idxMale = order.indexOf('g630');
    const idxHS = order.indexOf('g69');
    expect(idxD1).toBeGreaterThanOrEqual(0);
    expect(idxD2).toBeGreaterThanOrEqual(0);
    expect(idxD1).toBeLessThan(idxADV);
    expect(idxD2).toBeLessThan(idxADV);
    expect(idxD1).toBeLessThan(idxMale);
    expect(idxD1).toBeLessThan(idxHS);

    // rawSeeds (pre-penalty) is provided so the panel can compare
    expect(r.rawSeeds).toBeDefined();
  });

  it('still ranks with a single seed VN (graceful fallback)', async () => {
    seedVn('v990200', [{ id: 'gSolo', name: 'solo-tag', rating: 2.0 }]);
    addToCollection('v990200', {});
    updateCollection('v990200', { user_rating: 85 });
    POOL.set('gSolo', [
      { id: 'v999A', title: 'A', rating: 80, votecount: 300 },
    ]);
    const r = await recommendVns({ mode: 'because-you-liked' });
    expect(r.seeds.map((s) => s.tagId)).toContain('gSolo');
    expect(r.results.map((x) => x.id)).toContain('v999A');
    expect(r.signalCounts!.total).toBe(1);
  });

  it('useWishlist=true folds cached wishlist VNs into the seed pool', async () => {
    // No rated/finished/favourite/queue seeds at all — wishlist is the
    // only signal. The recommender must still produce a tag seed when
    // useWishlist is on, and must NOT when it's off.
    seedVn('v990300', [{ id: 'gWish', name: 'wish-tag', rating: 2.0 }]);
    const cacheKey = 'POST /ulist|POST|fakehashwishtest';
    const payload = JSON.stringify({ results: [{ id: 'v990300', labels: [5] }] });
    db.prepare(
      `INSERT OR REPLACE INTO vndb_cache (cache_key, body, fetched_at, expires_at) VALUES (?, ?, ?, ?)`,
    ).run(cacheKey, payload, Date.now(), Date.now() + 60_000);
    POOL.set('gWish', [
      { id: 'v999W', title: 'W', rating: 80, votecount: 300 },
    ]);

    const off = await recommendVns({ mode: 'because-you-liked', useWishlist: false });
    // includeWishlist=false (default) excludes v990300, AND useWishlist=false
    // drops it from the seed pool too — no seeds, no results.
    expect(off.seeds).toEqual([]);
    expect(off.signalCounts!.wishlist).toBe(0);

    const on = await recommendVns({ mode: 'because-you-liked', useWishlist: true });
    expect(on.signalCounts!.wishlist).toBeGreaterThanOrEqual(1);
    expect(on.seeds.map((s) => s.tagId)).toContain('gWish');
    expect(on.results.map((x) => x.id)).toContain('v999W');
  });

  it('contributors field surfaces top-2 seed VNs per recommendation', async () => {
    seedVn('v990400', [{ id: 'gC1', name: 'c-tag-1', rating: 2.5 }]);
    seedVn('v990401', [{ id: 'gC1', name: 'c-tag-1', rating: 2.5 }]);
    addToCollection('v990400', {});
    updateCollection('v990400', { user_rating: 85 });
    addToCollection('v990401', {});
    updateCollection('v990401', { user_rating: 90 });
    POOL.set('gC1', [
      { id: 'v999X', title: 'X', rating: 80, votecount: 300 },
    ]);
    const r = await recommendVns({ mode: 'because-you-liked' });
    const x = r.results.find((it) => it.id === 'v999X');
    expect(x).toBeDefined();
    expect(x?.contributors?.length).toBeGreaterThanOrEqual(1);
    expect(x?.contributors?.length).toBeLessThanOrEqual(2);
    // Contributor ids must be from our seeded VNs.
    for (const c of x?.contributors ?? []) {
      expect(['v990400', 'v990401']).toContain(c.id);
    }
  });
});
