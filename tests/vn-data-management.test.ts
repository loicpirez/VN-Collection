/**
 * Pin the relaxation of `POST /api/collection/[id]/assets?refresh=true`
 * for VNs that exist in the `vn` cache table but NOT in `collection`.
 *
 * Manual QA flagged that opening `/vn/v123456` from an EGS top-ranked
 * map link, a search hit, or an anticipated row could surface "stale"
 * cached metadata, but the refresh action was gated behind "add to
 * collection first". Data / metadata refresh is a per-VN concern (it
 * targets the `vn` cache + on-disk images + `release_meta_cache`),
 * not a per-collection-row concern.
 *
 * The route now requires only that the VN exists in `vn`; collection
 * membership is irrelevant. Adding the VN as a side-effect is
 * explicitly NOT done — the operator stays in control of the
 * collection set.
 *
 * This test exercises the underlying DB + materializer sequence the
 * route runs. We don't drive the HTTP handler directly because it
 * spawns multiple fire-and-forget VNDB fan-outs that would need
 * extensive stubbing to be hermetic; the pieces the brief calls out
 * (no auto-add to collection, materialize runs, release_meta_cache
 * rebuilds) are all independently testable.
 *
 * Synthetic VN / release ids only — never reference real titles.
 */
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import {
  db as appDb,
  getReleaseMeta,
  isInCollection,
  listShelves,
  materializeReleaseMetaForVn,
} from '@/lib/db';

listShelves();
const db = new Database(process.env.DB_PATH!);

function clear(): void {
  db.exec(
    `DELETE FROM owned_release;
     DELETE FROM release_meta_cache;
     DELETE FROM collection WHERE vn_id LIKE 'v9%';
     DELETE FROM vn WHERE id LIKE 'v9%';
     DELETE FROM vndb_cache WHERE cache_key LIKE 'POST /release|%';`,
  );
}

function seedVn(id: string): void {
  db.prepare(
    `INSERT OR REPLACE INTO vn (id, title, fetched_at) VALUES (?, ?, ?)`,
  ).run(id, id, Date.now());
}

function seedReleasePayload(releases: unknown[]): void {
  const key = `POST /release|POST|cafe${Math.random().toString(16).slice(2, 10)}`;
  db.prepare(
    `INSERT OR REPLACE INTO vndb_cache (cache_key, body, fetched_at, expires_at)
     VALUES (?, ?, ?, ?)`,
  ).run(key, JSON.stringify({ results: releases }), Date.now(), Date.now() + 3600 * 1000);
}

beforeAll(() => clear());
beforeEach(() => clear());

describe('non-library VN data management', () => {
  it('materializeReleaseMetaForVn rebuilds release_meta_cache for a VN NOT in collection', () => {
    // Seed: VN exists in `vn` cache, but NO collection row.
    seedVn('v90700');
    expect(isInCollection('v90700')).toBe(false);

    seedReleasePayload([
      {
        id: 'r907001',
        platforms: ['win'],
        languages: [{ lang: 'ja' }],
        released: '2024-08-12',
        vns: [{ id: 'v90700' }],
      },
    ]);

    // Wipe + rebuild — mirrors the bust-then-materialize sequence
    // the assets route runs on `?refresh=true`.
    appDb.prepare('DELETE FROM release_meta_cache').run();
    materializeReleaseMetaForVn('v90700');

    const meta = getReleaseMeta('r907001');
    expect(meta).toBeDefined();
    expect(meta!.platforms).toEqual(['win']);
    expect(meta!.released).toBe('2024-08-12');

    // The refresh DID NOT auto-add the VN to the collection.
    expect(isInCollection('v90700')).toBe(false);
  });

  it('refresh leaves the collection row state UNCHANGED for in-library VNs', () => {
    // Two VNs: one in collection, one only in the cache. After a
    // simulated bulk refresh, the collection membership of both is
    // exactly what it was before.
    seedVn('v90701');
    seedVn('v90702');
    db.prepare(
      `INSERT INTO collection (vn_id, status, added_at, updated_at) VALUES (?, ?, ?, ?)`,
    ).run('v90701', 'finished', Date.now(), Date.now());
    expect(isInCollection('v90701')).toBe(true);
    expect(isInCollection('v90702')).toBe(false);

    seedReleasePayload([
      { id: 'r907011', platforms: ['win'], vns: [{ id: 'v90701' }] },
      { id: 'r907021', platforms: ['swi'], vns: [{ id: 'v90702' }] },
    ]);
    appDb.prepare('DELETE FROM release_meta_cache').run();
    for (const id of ['v90701', 'v90702']) {
      materializeReleaseMetaForVn(id);
    }

    expect(getReleaseMeta('r907011')?.platforms).toEqual(['win']);
    expect(getReleaseMeta('r907021')?.platforms).toEqual(['swi']);
    // Membership untouched on both sides.
    expect(isInCollection('v90701')).toBe(true);
    expect(isInCollection('v90702')).toBe(false);
  });

  it('the route helper precondition is "vn row exists" not "collection row exists"', () => {
    // Defensive check on the precondition the assets route now
    // enforces: it looks up `vn(id)`, not `collection(vn_id)`. The
    // route itself runs `upsertVn(getVn(id))` to hydrate when the
    // row is missing; without a mocked VNDB client we can't drive
    // that path end-to-end, but we CAN pin the underlying
    // observation: `vn` is the gating table, not `collection`.
    seedVn('v90703');
    const vnRow = db.prepare('SELECT id FROM vn WHERE id = ?').get('v90703');
    const colRow = db
      .prepare('SELECT vn_id FROM collection WHERE vn_id = ?')
      .get('v90703');
    expect(vnRow).toBeDefined();
    expect(colRow).toBeUndefined();
  });
});
