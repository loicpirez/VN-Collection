/**
 * Pin the shelf-popover platform-display contract for a multi-platform
 * release with an explicit owned_platform pin. Manual QA flagged the
 * regression where the popover (and other surfaces) still widened to
 * the full release platform set even when the user had pinned a SKU.
 *
 * The test seeds an owned_release with `owned_platform = 'swi'` on a
 * release that lists ['win','ps4','psv','swi'], then asserts the
 * shared `derivePlatformDisplay` helper returns the 'owned' state
 * (not 'choose'). Surfaces that funnel through the helper are
 * guaranteed to behave correctly.
 *
 * Synthetic v9xxxx ids only; never touches the real DB or upstream.
 */
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import {
  addToCollection,
  listShelves,
  markReleaseOwned,
  materializeReleaseMetaForVn,
  updateOwnedRelease,
} from '@/lib/db';
import { derivePlatformDisplay } from '@/lib/platform-display';

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

function seedVn(id: string, platforms: string[]): void {
  db.prepare(
    `INSERT OR REPLACE INTO vn (id, title, platforms, languages, fetched_at)
     VALUES (?, ?, ?, ?, ?)`,
  ).run(id, id, JSON.stringify(platforms), JSON.stringify(['ja']), Date.now());
}

function seedReleasePayload(releases: unknown[]): void {
  const key = `POST /release|POST|aa11${Math.random().toString(16).slice(2, 10)}`;
  db.prepare(
    `INSERT OR REPLACE INTO vndb_cache (cache_key, body, fetched_at, expires_at)
     VALUES (?, ?, ?, ?)`,
  ).run(key, JSON.stringify({ results: releases }), Date.now(), Date.now() + 3600 * 1000);
}

interface JoinedSlot {
  owned_platform: string | null;
  release_id: string;
  rel_platforms: string[];
}

function joinedSlotFor(vnId: string, releaseId: string): JoinedSlot {
  const row = db
    .prepare(
      `SELECT o.owned_platform, o.release_id, rm.platforms AS rel_platforms_json
       FROM owned_release o
       LEFT JOIN release_meta_cache rm ON rm.release_id = o.release_id
       WHERE o.vn_id = ? AND o.release_id = ?`,
    )
    .get(vnId, releaseId) as {
      owned_platform: string | null;
      release_id: string;
      rel_platforms_json: string | null;
    } | undefined;
  if (!row) throw new Error('owned_release row missing');
  const parsed =
    row.rel_platforms_json && typeof row.rel_platforms_json === 'string'
      ? (JSON.parse(row.rel_platforms_json) as unknown)
      : [];
  const rel_platforms = Array.isArray(parsed)
    ? parsed.filter((p): p is string => typeof p === 'string')
    : [];
  return {
    owned_platform: row.owned_platform,
    release_id: row.release_id,
    rel_platforms,
  };
}

beforeAll(() => clear());
beforeEach(() => clear());

describe('shelf popover platform display', () => {
  it('owned_platform pin on a multi-platform release yields kind:owned', () => {
    seedVn('v90901', ['win', 'ps4', 'psv', 'swi']);
    addToCollection('v90901', {});
    seedReleasePayload([
      {
        id: 'r909001',
        platforms: ['win', 'ps4', 'psv', 'swi'],
        languages: [{ lang: 'ja' }],
        vns: [{ id: 'v90901' }],
      },
    ]);
    materializeReleaseMetaForVn('v90901');

    markReleaseOwned('v90901', 'r909001');
    updateOwnedRelease('v90901', 'r909001', { owned_platform: 'swi' });

    const joined = joinedSlotFor('v90901', 'r909001');
    expect(joined.rel_platforms.length).toBeGreaterThan(1);

    const state = derivePlatformDisplay({
      ownedPlatform: joined.owned_platform,
      releasePlatforms: joined.rel_platforms,
      releaseId: joined.release_id,
    });
    expect(state).toEqual({ kind: 'owned', platform: 'swi' });
  });

  it('multi-platform release with no pin yields kind:choose', () => {
    seedVn('v90902', ['win', 'ps4', 'psv', 'swi']);
    addToCollection('v90902', {});
    seedReleasePayload([
      {
        id: 'r909002',
        platforms: ['win', 'ps4', 'psv', 'swi'],
        languages: [{ lang: 'ja' }],
        vns: [{ id: 'v90902' }],
      },
    ]);
    materializeReleaseMetaForVn('v90902');

    markReleaseOwned('v90902', 'r909002');

    const joined = joinedSlotFor('v90902', 'r909002');
    expect(joined.owned_platform).toBeNull();

    const state = derivePlatformDisplay({
      ownedPlatform: joined.owned_platform,
      releasePlatforms: joined.rel_platforms,
      releaseId: joined.release_id,
    });
    expect(state.kind).toBe('choose');
  });

  it('synthetic edition with no release_meta_cache yields kind:unknown', () => {
    seedVn('v90903', ['win']);
    addToCollection('v90903', {});
    markReleaseOwned('v90903', 'synthetic:v90903');

    const joined = joinedSlotFor('v90903', 'synthetic:v90903');
    expect(joined.rel_platforms).toEqual([]);

    const state = derivePlatformDisplay({
      ownedPlatform: joined.owned_platform,
      releasePlatforms: joined.rel_platforms,
      releaseId: joined.release_id,
    });
    expect(state).toEqual({ kind: 'unknown' });
  });
});
