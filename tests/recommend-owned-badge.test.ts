/**
 * Pin the `inCollection` flag plumbed through `recommendVns` when
 * `includeOwned: true` is set. The /recommendations card grid reads
 * this flag to render the "Déjà dans ta bibliothèque" badge — a
 * regression that drops the flag silently degrades a visible UI
 * affordance without throwing, so the test asserts the per-row
 * presence explicitly.
 *
 * Uses the same VNDB mock infra as recommend-modes.test.ts. Local
 * SQLite is the real schema (per-worker temp DB from
 * `tests/setup.ts`); seed rows use synthetic `v9xxxx` ids and
 * placeholder titles only.
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
let upstreamMinVotes = 0;

vi.mock('@/lib/vndb-recommend', () => ({
  vndbAdvancedSearchRaw: vi.fn(async (args: { filters: unknown }) => {
    const filters = args.filters as [string, [string, string, [string, ...unknown[]]], [string, string, number]];
    const seedId = filters?.[1]?.[2]?.[0];
    upstreamMinVotes = filters?.[2]?.[2] ?? 0;
    if (!seedId) return [];
    return (POOL.get(seedId) ?? []).filter((h) => (h.votecount ?? 0) >= upstreamMinVotes);
  }),
}));

import { addToCollection, listShelves, updateCollection } from '@/lib/db';
import { recommendVns } from '@/lib/recommend';

listShelves();
const db = new Database(process.env.DB_PATH!);

function seedVn(id: string, tags: Array<{ id: string; name: string; rating?: number }>): void {
  db.prepare(`INSERT OR REPLACE INTO vn (id, title, tags, fetched_at) VALUES (?, ?, ?, ?)`).run(
    id,
    id,
    JSON.stringify(tags),
    Date.now(),
  );
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

beforeAll(() => clearAll());
beforeEach(() => clearAll());

describe('recommendVns({ includeOwned: true }) — inCollection flag', () => {
  it('seeds a synthetic VN as in-collection and the result row carries inCollection=true', async () => {
    // Seed VN that supplies the seed tag.
    seedVn('v90001', [{ id: 'g9001', name: 'placeholder-tag', rating: 2.5 }]);
    addToCollection('v90001', {});
    updateCollection('v90001', { user_rating: 90 });
    // Candidate VN that is ALREADY in the collection. With
    // includeOwned: true the recommender must surface it AND mark it.
    seedVn('v90002', [{ id: 'g9001', name: 'placeholder-tag', rating: 2.5 }]);
    addToCollection('v90002', {});
    POOL.set('g9001', [
      { id: 'v90002', title: 'placeholder-owned', rating: 82, votecount: 300 },
      { id: 'v99999', title: 'placeholder-fresh', rating: 80, votecount: 250 },
    ]);
    const r = await recommendVns({ mode: 'because-you-liked', includeOwned: true });
    const owned = r.results.find((x) => x.id === 'v90002');
    const fresh = r.results.find((x) => x.id === 'v99999');
    expect(owned).toBeDefined();
    expect(owned?.inCollection).toBe(true);
    expect(fresh?.inCollection).toBe(false);
  });

  it('omits the flag when includeOwned is false (owned rows are excluded anyway)', async () => {
    seedVn('v90001', [{ id: 'g9001', name: 'placeholder-tag', rating: 2.5 }]);
    addToCollection('v90001', {});
    updateCollection('v90001', { user_rating: 90 });
    POOL.set('g9001', [
      { id: 'v99999', title: 'placeholder-fresh', rating: 80, votecount: 250 },
    ]);
    const r = await recommendVns({ mode: 'because-you-liked' });
    const fresh = r.results.find((x) => x.id === 'v99999');
    expect(fresh).toBeDefined();
    // Helper stamping is skipped entirely; the flag is left undefined
    // / false on every row because no badge would ever render.
    expect(fresh?.inCollection).toBeFalsy();
  });
});
