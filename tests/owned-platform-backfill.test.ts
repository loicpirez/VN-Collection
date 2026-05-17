/**
 * Pin the per-edition `owned_platform` autofill contract.
 *
 * Background: a single VNDB release row often lists multiple
 * platforms (e.g. one row may cover WIN / PS4 / PSV / SWI). The
 * user physically owns ONE SKU per `owned_release` row; without
 * a per-edition platform field the shelf popover and pool-card
 * face widened to the full set, which manual QA flagged as
 * misleading. The fix introduces `owned_release.owned_platform`
 * (lowercase VNDB code) plus three autofill layers:
 *
 *   - Layer A: one-shot DB migration backfill at startup,
 *     marker-gated so it runs once per DB.
 *   - Layer B: `markReleaseOwned` autofill on each insert when
 *     the linked release has exactly one platform.
 *   - Layer C: end-of-`materializeReleaseMetaForVn` autofill so
 *     rows that landed before the cache populated retroactively
 *     gain the singleton.
 *
 * Multi-platform releases remain NULL until the user explicitly
 * picks one through the `/api/collection/[id]/owned-releases`
 * PATCH endpoint (and its `<EditionEditor>` picker).
 *
 * Tests use synthetic VN / release ids only — no real titles.
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
  const key = `POST /release|POST|f00d${Math.random().toString(16).slice(2, 10)}`;
  db.prepare(
    `INSERT OR REPLACE INTO vndb_cache (cache_key, body, fetched_at, expires_at)
     VALUES (?, ?, ?, ?)`,
  ).run(key, JSON.stringify({ results: releases }), Date.now(), Date.now() + 3600 * 1000);
}

function getOwnedPlatform(vnId: string, releaseId: string): string | null {
  const row = db
    .prepare(
      `SELECT owned_platform FROM owned_release WHERE vn_id = ? AND release_id = ?`,
    )
    .get(vnId, releaseId) as { owned_platform: string | null } | undefined;
  return row?.owned_platform ?? null;
}

beforeAll(() => clear());
beforeEach(() => clear());

describe('owned_platform autofill', () => {
  it('Layer B: singleton-platform releases auto-fill on insert', () => {
    seedVn('v94100', ['win']);
    addToCollection('v94100', {});
    seedReleasePayload([
      {
        id: 'r941001',
        platforms: ['win'],
        languages: [{ lang: 'ja' }],
        vns: [{ id: 'v94100' }],
      },
    ]);
    materializeReleaseMetaForVn('v94100');

    markReleaseOwned('v94100', 'r941001');
    expect(getOwnedPlatform('v94100', 'r941001')).toBe('win');
  });

  it('Layer B: multi-platform release stays NULL until the user picks', () => {
    seedVn('v94101', ['win', 'ps4', 'psv', 'swi']);
    addToCollection('v94101', {});
    seedReleasePayload([
      {
        id: 'r941011',
        platforms: ['win', 'ps4', 'psv', 'swi'],
        languages: [{ lang: 'ja' }],
        vns: [{ id: 'v94101' }],
      },
    ]);
    materializeReleaseMetaForVn('v94101');

    markReleaseOwned('v94101', 'r941011');
    expect(getOwnedPlatform('v94101', 'r941011')).toBeNull();

    // User explicitly picks PS4 via the editor → patch lands.
    updateOwnedRelease('v94101', 'r941011', { owned_platform: 'ps4' });
    expect(getOwnedPlatform('v94101', 'r941011')).toBe('ps4');

    // Clearing back to NULL is supported (release stays multi-platform).
    updateOwnedRelease('v94101', 'r941011', { owned_platform: null });
    expect(getOwnedPlatform('v94101', 'r941011')).toBeNull();
  });

  it('Layer C: late-arriving release_meta_cache row backfills the NULL', () => {
    // Order matters: insert happens BEFORE release_meta_cache materializes
    // (e.g. when the user added the edition before the VN's release
    // fan-out ran).
    seedVn('v94102', ['psv']);
    addToCollection('v94102', {});
    markReleaseOwned('v94102', 'r941021');
    expect(getOwnedPlatform('v94102', 'r941021')).toBeNull();

    // Now the release fan-out lands.
    seedReleasePayload([
      {
        id: 'r941021',
        platforms: ['psv'],
        languages: [{ lang: 'ja' }],
        vns: [{ id: 'v94102' }],
      },
    ]);
    materializeReleaseMetaForVn('v94102');

    expect(getOwnedPlatform('v94102', 'r941021')).toBe('psv');
  });

  it('Explicit owned_platform on insert is preserved (no autofill clobber)', () => {
    seedVn('v94103', ['win', 'ps4']);
    addToCollection('v94103', {});
    seedReleasePayload([
      {
        id: 'r941031',
        platforms: ['win', 'ps4'],
        languages: [{ lang: 'ja' }],
        vns: [{ id: 'v94103' }],
      },
    ]);
    materializeReleaseMetaForVn('v94103');

    markReleaseOwned('v94103', 'r941031', { owned_platform: 'ps4' });
    expect(getOwnedPlatform('v94103', 'r941031')).toBe('ps4');
  });

  it('Synthetic release ids stay NULL (no cache row to autofill from)', () => {
    seedVn('v94104', ['win']);
    addToCollection('v94104', {});
    markReleaseOwned('v94104', 'synthetic:v94104');
    materializeReleaseMetaForVn('v94104');

    expect(getOwnedPlatform('v94104', 'synthetic:v94104')).toBeNull();
  });
});
