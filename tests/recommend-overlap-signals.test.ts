/**
 * Targeted coverage for the lesser-trodden branches of
 * `src/lib/recommend.ts`: the studio-overlap score boost, the per-seed
 * upstream-failure isolation, the `customTagIds` bypass inside
 * `similar-to-vn` mode, and the multi-signal rating-bump path.
 *
 * The upstream VNDB call (`vndbAdvancedSearchRaw`) is mocked with a
 * per-seed-tag pool, mirroring the convention in `recommend-modes.test.ts`.
 * Local SQLite is the real per-worker schema; every id is synthetic
 * (`v9xxxx` / `p9xxxx` / `g9xxxx`) with placeholder titles.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import Database from 'better-sqlite3';

interface FakeHit {
  id: string;
  title: string;
  rating?: number | null;
  votecount?: number | null;
  developers?: { id: string; name: string }[];
}

const POOL = new Map<string, FakeHit[]>();
const seedFailures = new Set<string>();

vi.mock('@/lib/vndb-recommend', () => ({
  vndbAdvancedSearchRaw: vi.fn(async (args: { filters: unknown }) => {
    const filters = args.filters as [string, [string, string, [string, ...unknown[]]], unknown];
    const seedId = filters?.[1]?.[2]?.[0];
    if (!seedId) return [];
    if (seedFailures.has(seedId)) throw new Error(`seed ${seedId} upstream failure`);
    return POOL.get(seedId) ?? [];
  }),
}));

import { addToCollection, listShelves, updateCollection } from '@/lib/db';
import { recommendVns } from '@/lib/recommend';

listShelves(); // Idempotent schema bootstrap.
const db = new Database(process.env.DB_PATH!);

function seedVn(
  id: string,
  tags: Array<{ id: string; name: string; rating?: number; category?: string }>,
  developers?: Array<{ id?: string; name: string }>,
): void {
  db.prepare(`INSERT OR REPLACE INTO vn (id, title, tags, developers, fetched_at) VALUES (?, ?, ?, ?, ?)`).run(
    id,
    id,
    JSON.stringify(tags),
    developers ? JSON.stringify(developers) : null,
    Date.now(),
  );
}

function clearAll(): void {
  db.exec(`
    DELETE FROM collection WHERE vn_id LIKE 'v9%';
    DELETE FROM vn WHERE id LIKE 'v9%';
  `);
  POOL.clear();
  seedFailures.clear();
}

beforeEach(() => clearAll());

describe('studio-overlap signal', () => {
  it('boosts a candidate whose developer is shared by >= 3 seed VNs', async () => {
    // Three finished seed VNs all developed by the same studio p90001 and all
    // tagged g9001, so the studioCount for p90001 reaches 3 (the threshold).
    // Seed `developers` JSON is stored name-only so `studioCount` is keyed by
    // the studio NAME — the key shape `runRecommendForSeeds` matches against
    // the upstream hit's developer name.
    for (const id of ['v90001', 'v90002', 'v90003']) {
      seedVn(id, [{ id: 'g9001', name: 'tag-shared', rating: 2.5 }], [{ name: 'studio-shared' }]);
      addToCollection(id, { status: 'completed' });
      updateCollection(id, { user_rating: 90 });
    }
    // Two candidates: one from the shared studio, one from a different studio.
    POOL.set('g9001', [
      { id: 'v99001', title: 'studio-match', rating: 80, votecount: 300, developers: [{ id: 'p90001', name: 'studio-shared' }] },
      { id: 'v99002', title: 'studio-other', rating: 80, votecount: 300, developers: [{ id: 'p90999', name: 'studio-other' }] },
    ]);

    const r = await recommendVns({ mode: 'because-you-liked' });
    const matched = r.results.find((x) => x.id === 'v99001');
    const other = r.results.find((x) => x.id === 'v99002');
    expect(matched?.studioOverlap).toBe(3);
    // The studio match must outrank the equally-rated non-match thanks to the
    // overlap score boost.
    const matchedScore = matched?.score ?? 0;
    const otherScore = other?.score ?? 0;
    expect(matchedScore).toBeGreaterThan(otherScore);
    expect(r.results.findIndex((x) => x.id === 'v99001')).toBeLessThan(
      r.results.findIndex((x) => x.id === 'v99002'),
    );
  });

  it('reports per-class signal counts for the explanation panel', async () => {
    seedVn('v90010', [{ id: 'g9002', name: 'tag-A', rating: 2.5 }]);
    addToCollection('v90010', { status: 'completed' });
    updateCollection('v90010', { user_rating: 95, favorite: true });
    POOL.set('g9002', [{ id: 'v99010', title: 'cand', rating: 80, votecount: 300 }]);

    const r = await recommendVns({ mode: 'because-you-liked' });
    expect(r.signalCounts?.finished).toBe(1);
    expect(r.signalCounts?.favorite).toBe(1);
    expect(r.signalCounts?.rated).toBe(1);
    expect(r.signalCounts?.total).toBe(1);
  });
});

describe('per-seed upstream failure isolation', () => {
  it('skips a failing seed but still returns hits from the surviving seed', async () => {
    seedVn('v90020', [
      { id: 'g9003', name: 'tag-good', rating: 2.5 },
      { id: 'g9004', name: 'tag-bad', rating: 2.5 },
    ]);
    addToCollection('v90020', { status: 'completed' });
    updateCollection('v90020', { user_rating: 90 });
    seedFailures.add('g9004');
    POOL.set('g9003', [{ id: 'v99020', title: 'survivor', rating: 80, votecount: 300 }]);

    const r = await recommendVns({ mode: 'because-you-liked' });
    expect(r.results.map((x) => x.id)).toContain('v99020');
  });
});

describe('similar-to-vn with pinned custom tags', () => {
  it('uses the supplied tag ids as the seed set for the anchor VN', async () => {
    seedVn('v90030', [
      { id: 'g9005', name: 'anchor-tag-A', rating: 2.5 },
      { id: 'g9006', name: 'anchor-tag-B', rating: 2.4 },
    ]);
    POOL.set('g9005', [{ id: 'v99030', title: 'sim-A', rating: 80, votecount: 300 }]);
    // g9006 is NOT used because customTagIds pins only g9005.

    const r = await recommendVns({
      mode: 'similar-to-vn',
      seedVnId: 'v90030',
      customTagIds: ['g9005'],
    });
    expect(r.seeds.map((s) => s.tagId)).toEqual(['g9005']);
    expect(r.results.map((x) => x.id)).toContain('v99030');
    // The anchor VN itself is excluded from its own recommendations.
    expect(r.results.map((x) => x.id)).not.toContain('v90030');
  });
});
