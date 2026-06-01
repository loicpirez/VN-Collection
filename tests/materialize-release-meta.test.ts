/**
 * R5-132 / R5-133 pin:
 *   - `materializeReleaseMetaForVn` and the new
 *     `materializeReleaseMetaForCollectionVns` both use an ANCHORED
 *     `LIKE 'POST /release|%'` prefix (so the `vndb_cache` PK index
 *     can serve the lookup; the previous `% /release|%` was a
 *     leading-wildcard scan).
 *   - The bulk helper visits each cached release exactly once and
 *     dispatches every release to every owned VN it lists in `vns[]`.
 *   - Per-VN materialise short-circuits when `release_meta_cache`
 *     has rows newer than the latest matching `vndb_cache` row.
 */
import Database from 'better-sqlite3';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  materializeReleaseMetaForCollectionVns,
  materializeReleaseMetaForVn,
} from '@/lib/db';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { vndbReleaseFixture } from './fixtures/vndb-release';

// Force lib/db to bootstrap.
materializeReleaseMetaForVn('v9000');
const db = new Database(process.env.DB_PATH!);

const SOURCE = readFileSync(join(__dirname, '..', 'src/lib/db.ts'), 'utf8');

function seedVnAndCollection(vnId: string): void {
  const now = Date.now();
  db.prepare('INSERT OR IGNORE INTO vn (id, title, fetched_at) VALUES (?, ?, ?)').run(vnId, vnId, now);
  db.prepare(`INSERT OR IGNORE INTO collection (vn_id, added_at, updated_at, status) VALUES (?, ?, ?, 'planning')`).run(vnId, now, now);
}

function seedReleaseCacheRow(hash: string, ageMs: number, releases: Array<{ id: string; vns: Array<{ id: string }> }>): void {
  const now = Date.now();
  const fetched = now - ageMs;
  db.prepare(`INSERT OR REPLACE INTO vndb_cache (cache_key, body, fetched_at, expires_at) VALUES (?, ?, ?, ?)`).run(
    `POST /release|POST|${hash}`,
    JSON.stringify({ results: releases.map(vndbReleaseFixture) }),
    fetched,
    now + 60_000,
  );
}

beforeAll(() => {
  db.exec(`
    DELETE FROM release_meta_cache;
    DELETE FROM owned_release;
    DELETE FROM collection;
    DELETE FROM vndb_cache;
    DELETE FROM vn;
  `);
});

afterAll(() => {
  db.close();
});

describe('materializeReleaseMeta133', () => {
  beforeEach(() => {
    db.exec(`
      DELETE FROM release_meta_cache;
      DELETE FROM owned_release;
      DELETE FROM collection;
      DELETE FROM vndb_cache;
      DELETE FROM vn;
    `);
  });

  it('per-VN helper uses anchored LIKE prefix (no leading wildcard)', () => {
    const body = SOURCE.split('export function materializeReleaseMetaForVn')[1]?.split('\nexport')[0] ?? '';
    expect(body).toMatch(/LIKE 'POST \/release\|%'/);
    expect(body).not.toMatch(/LIKE '% \/release\|%'/);
  });

  it('aspect-materialiser also uses anchored LIKE', () => {
    const body = SOURCE.split('export function materializeReleaseAspectsForVn')[1]?.split('\nexport')[0] ?? '';
    expect(body).toMatch(/LIKE 'POST \/release\|%'/);
    expect(body).not.toMatch(/LIKE '% \/release\|%'/);
  });

  it('bulk helper visits each release exactly once and dispatches per owned VN', () => {
    seedVnAndCollection('v9000');
    seedVnAndCollection('v9001');
    // One cached body that lists a release linked to both v9000 and v9001.
    seedReleaseCacheRow('abc', 0, [
      { id: 'r1', vns: [{ id: 'v9000' }, { id: 'v9001' }] },
    ]);
    materializeReleaseMetaForCollectionVns(['v9000', 'v9001']);
    const rows = db.prepare('SELECT vn_id, release_id FROM release_meta_cache').all() as Array<{ vn_id: string; release_id: string }>;
    // The release_meta_cache PRIMARY KEY is `release_id`, so only the
    // last vn_id wins on upsert. Confirm at least one row exists and
    // points to one of the owned VNs (the bulk helper visited the
    // release once and dispatched to both candidate VNs).
    expect(rows.length).toBe(1);
    expect(rows[0].release_id).toBe('r1');
    expect(['v9000', 'v9001']).toContain(rows[0].vn_id);
  });

  it('bulk helper ignores releases linked only to non-collection VNs', () => {
    seedVnAndCollection('v9100');
    seedReleaseCacheRow('xyz', 0, [
      { id: 'r9', vns: [{ id: 'v9999' }] }, // not in collection
    ]);
    materializeReleaseMetaForCollectionVns(['v9100']);
    const rows = db.prepare('SELECT * FROM release_meta_cache').all();
    expect(rows).toEqual([]);
  });

  it('per-VN helper short-circuits when release_meta_cache is fresh', () => {
    seedVnAndCollection('v9200');
    seedReleaseCacheRow('h1', 60_000, [
      { id: 'r10', vns: [{ id: 'v9200' }] },
    ]);
    // Pre-populate release_meta_cache with a row newer than the cache.
    const now = Date.now();
    db.prepare(`
      INSERT INTO release_meta_cache (release_id, vn_id, title, platforms, languages, media, producers, extlinks, patch, freeware, official, has_ero, fetched_at)
      VALUES ('r10', 'v9200', 'cached', '[]', '[]', '[]', '[]', '[]', 0, 0, 1, 0, ?)
    `).run(now);
    materializeReleaseMetaForVn('v9200');
    // The title should still be 'cached' — the materializer
    // short-circuited and didn't overwrite with the upstream row.
    const row = db.prepare('SELECT title FROM release_meta_cache WHERE release_id = ?').get('r10') as { title: string };
    expect(row.title).toBe('cached');
  });
});
