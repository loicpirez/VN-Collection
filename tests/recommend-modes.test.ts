/**
 * Pins the per-mode contract of `recommendVns()`.
 *
 * The upstream VNDB call (`vndbAdvancedSearchRaw`) is mocked with a
 * fake fan-out so each test can hand-craft the candidate pool the
 * recommender sees per seed tag. Local SQLite is the real schema
 * (per-worker temp DB from `tests/setup.ts`); seed rows use synthetic
 * `v9xxxx` ids and placeholder titles only.
 */
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import Database from 'better-sqlite3';

interface FakeHit {
  id: string;
  title: string;
  alttitle?: string | null;
  released?: string | null;
  rating?: number | null;
  votecount?: number | null;
  length_minutes?: number | null;
  image?: { url: string; thumbnail: string; sexual?: number } | null;
  developers?: { id: string; name: string }[];
}

// Per-seed-tag pool; the mock looks up the seed by parsing the
// `filters` array the SUT sends ('and', ['tag', '=', [seedId, ...]],
// ['votecount', '>=', N]) and returns the matching list of hits.
// `votecount >= N` filtering happens before we get here, so the mock
// just dispenses pre-canned rows; the SUT applies its mode-specific
// post-filters on its own.
const POOL: Map<string, FakeHit[]> = new Map();
let upstreamMinVotes = 0;

vi.mock('@/lib/vndb-recommend', () => ({
  vndbAdvancedSearchRaw: vi.fn(async (args: { filters: unknown }) => {
    // The SUT passes ['and', ['tag', '=', [tagId, ...]], ['votecount', '>=', N]].
    // Extract the tag id; if the shape changes the test will visibly fail.
    const filters = args.filters as [string, [string, string, [string, ...unknown[]]], [string, string, number]];
    const seedId = filters?.[1]?.[2]?.[0];
    upstreamMinVotes = filters?.[2]?.[2] ?? 0;
    if (!seedId) return [];
    return (POOL.get(seedId) ?? []).filter((h) => (h.votecount ?? 0) >= upstreamMinVotes);
  }),
}));

import {
  addToCollection,
  listShelves,
  updateCollection,
} from '@/lib/db';
import { recommendVns } from '@/lib/recommend';

listShelves(); // Force schema bootstrap (idempotent).
const db = new Database(process.env.DB_PATH!);

function seedVn(id: string, tags: Array<{ id: string; name: string; rating?: number; category?: string }>): void {
  db.prepare(
    `INSERT OR REPLACE INTO vn (id, title, tags, fetched_at) VALUES (?, ?, ?, ?)`,
  ).run(id, id, JSON.stringify(tags), Date.now());
}

function clearAll(): void {
  db.exec(`
    DELETE FROM collection WHERE vn_id LIKE 'v9%';
    DELETE FROM vn WHERE id LIKE 'v9%';
    DELETE FROM vndb_cache WHERE cache_key LIKE '%g9%';
  `);
  POOL.clear();
  upstreamMinVotes = 0;
}

// One reusable seed setup: a single highly-rated VN tagged g9001.
function seedSingleHighRated(): void {
  seedVn('v90001', [{ id: 'g9001', name: 'placeholder-tag', rating: 2.5 }]);
  addToCollection('v90001', {});
  updateCollection('v90001', { user_rating: 90 });
}

beforeAll(() => clearAll());
beforeEach(() => clearAll());

describe('recommendVns() — modes', () => {
  describe('because-you-liked', () => {
    it('excludes owned VNs from the result set', async () => {
      seedSingleHighRated();
      // Make sure v90002 is already owned, so even though it shares the
      // seed tag it should not appear in the recommendation list.
      seedVn('v90002', [{ id: 'g9001', name: 'placeholder-tag', rating: 2.5 }]);
      addToCollection('v90002', {});
      POOL.set('g9001', [
        { id: 'v90002', title: 'owned-A', rating: 82, votecount: 300 },
        { id: 'v99999', title: 'fresh-B', rating: 80, votecount: 250 },
      ]);
      const r = await recommendVns({ mode: 'because-you-liked' });
      const ids = r.results.map((x) => x.id);
      expect(ids).not.toContain('v90002');
      expect(ids).toContain('v99999');
    });
  });

  describe('tag-based', () => {
    it('drops rating from the score so VNs rank by tag-overlap count', async () => {
      // Two seed VNs in the collection, each contributing a different tag.
      // Pool: candidate-A hits BOTH seeds, candidate-B hits only one but
      // has a much higher VNDB rating. tag-based must rank A above B.
      seedVn('v90001', [
        { id: 'g9001', name: 'tag-X', rating: 2.5 },
        { id: 'g9002', name: 'tag-Y', rating: 2.5 },
      ]);
      addToCollection('v90001', {});
      updateCollection('v90001', { user_rating: 90 });
      seedVn('v90002', [
        { id: 'g9001', name: 'tag-X', rating: 2.0 },
        { id: 'g9002', name: 'tag-Y', rating: 2.0 },
      ]);
      addToCollection('v90002', {});
      updateCollection('v90002', { user_rating: 80 });
      POOL.set('g9001', [
        { id: 'v99001', title: 'candidate-A', rating: 70, votecount: 300 },
        { id: 'v99002', title: 'candidate-B', rating: 95, votecount: 300 },
      ]);
      POOL.set('g9002', [
        { id: 'v99001', title: 'candidate-A', rating: 70, votecount: 300 },
      ]);
      const r = await recommendVns({ mode: 'tag-based' });
      const ids = r.results.map((x) => x.id);
      // candidate-A (2 tag hits) must rank above candidate-B (1 hit + higher rating).
      expect(ids.indexOf('v99001')).toBeLessThan(ids.indexOf('v99002'));
      // Score for candidate-A is the count (2); for candidate-B it's (1).
      const aScore = r.results.find((x) => x.id === 'v99001')?.score ?? 0;
      const bScore = r.results.find((x) => x.id === 'v99002')?.score ?? 0;
      expect(aScore).toBe(2);
      expect(bScore).toBe(1);
    });
  });

  describe('hidden-gems', () => {
    it('filters out any hit with votecount >= 200', async () => {
      seedSingleHighRated();
      POOL.set('g9001', [
        { id: 'v99100', title: 'popular', rating: 85, votecount: 500 },
        { id: 'v99101', title: 'gem-A', rating: 80, votecount: 150 },
        { id: 'v99102', title: 'gem-B', rating: 78, votecount: 199 },
        { id: 'v99103', title: 'edge-200', rating: 80, votecount: 200 },
      ]);
      const r = await recommendVns({ mode: 'hidden-gems' });
      const ids = r.results.map((x) => x.id);
      expect(ids).toContain('v99101');
      expect(ids).toContain('v99102');
      expect(ids).not.toContain('v99100');
      // The cutoff is strictly `< 200`, so a row at exactly 200 must drop.
      expect(ids).not.toContain('v99103');
    });
  });

  describe('highly-rated', () => {
    it('requires rating >= 80 AND votecount >= 100', async () => {
      seedSingleHighRated();
      POOL.set('g9001', [
        { id: 'v99200', title: 'classic', rating: 88, votecount: 600 },
        { id: 'v99201', title: 'low-rating', rating: 70, votecount: 600 },
        { id: 'v99202', title: 'low-votes', rating: 90, votecount: 90 },
      ]);
      const r = await recommendVns({ mode: 'highly-rated' });
      const ids = r.results.map((x) => x.id);
      expect(ids).toContain('v99200');
      expect(ids).not.toContain('v99201');
      expect(ids).not.toContain('v99202');
      // And the upstream votecount filter is bumped to 100 for this mode.
      expect(upstreamMinVotes).toBe(100);
    });
  });

  describe('similar-to-vn', () => {
    it('returns an empty result without a seed VN', async () => {
      const r = await recommendVns({ mode: 'similar-to-vn' });
      expect(r.seeds).toEqual([]);
      expect(r.results).toEqual([]);
    });

    it('seeds from the chosen VN tags and excludes the seed itself', async () => {
      // Anchor VN is in the local table but the seed itself must NOT appear
      // in the recommendations.
      seedVn('v90555', [
        { id: 'g9050', name: 'anchor-tag', rating: 2.4 },
      ]);
      POOL.set('g9050', [
        { id: 'v90555', title: 'anchor-self', rating: 80, votecount: 300 },
        { id: 'v99550', title: 'fresh-match', rating: 78, votecount: 220 },
      ]);
      const r = await recommendVns({ mode: 'similar-to-vn', seedVnId: 'v90555' });
      const ids = r.results.map((x) => x.id);
      expect(r.seeds.map((s) => s.tagId)).toContain('g9050');
      expect(ids).toContain('v99550');
      expect(ids).not.toContain('v90555');
    });
  });

  describe('owned / wishlist flags', () => {
    it('includes owned VNs when includeOwned is true', async () => {
      seedSingleHighRated();
      seedVn('v90600', [{ id: 'g9001', name: 'placeholder-tag', rating: 2.5 }]);
      addToCollection('v90600', {});
      POOL.set('g9001', [
        { id: 'v90600', title: 'owned-shown', rating: 82, votecount: 300 },
      ]);
      const off = await recommendVns({ mode: 'because-you-liked', includeOwned: false });
      const on = await recommendVns({ mode: 'because-you-liked', includeOwned: true });
      expect(off.results.map((x) => x.id)).not.toContain('v90600');
      expect(on.results.map((x) => x.id)).toContain('v90600');
    });

    it('includes wishlisted VNs when includeWishlist is true', async () => {
      seedSingleHighRated();
      // The recommender reads the wishlist from the locally cached VNDB
      // ulist payload. Seed a cache row that mirrors what the live
      // `/ulist` POST would have persisted (label = 5 = Wishlist).
      const cacheKey = 'POST /ulist|POST|fakehashabcdef';
      const payload = JSON.stringify({
        results: [{ id: 'v90700' }],
      });
      db.prepare(
        `INSERT OR REPLACE INTO vndb_cache (cache_key, body, fetched_at, expires_at) VALUES (?, ?, ?, ?)`,
      ).run(cacheKey, payload, Date.now(), Date.now() + 60_000);
      POOL.set('g9001', [
        { id: 'v90700', title: 'wishlisted', rating: 82, votecount: 300 },
      ]);
      const off = await recommendVns({ mode: 'because-you-liked', includeWishlist: false });
      const on = await recommendVns({ mode: 'because-you-liked', includeWishlist: true });
      expect(off.results.map((x) => x.id)).not.toContain('v90700');
      expect(on.results.map((x) => x.id)).toContain('v90700');
    });
  });
});
