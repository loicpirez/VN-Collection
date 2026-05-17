/**
 * Pin the global-refresh rebuild of `release_meta_cache`.
 *
 * Before this change, `POST /api/refresh/global` busted every
 * page-level cache (`% /release|%`, `% /producer|%`, etc.) but
 * never touched the materialised `release_meta_cache` table. The
 * shelf popover / owned-editions surfaces read FROM that table —
 * so a global refresh re-fetched the upstream payloads but left
 * the user-facing values stale until each VN was individually
 * touched.
 *
 * The new flow:
 *   1. Bust `release_meta_cache` in the same sweep.
 *   2. Re-fetch upstream cache rows (existing behavior).
 *   3. Iterate every collection VN and call
 *      `materializeReleaseMetaForVn` so the table is rebuilt
 *      with the fresh cached release payloads.
 *
 * This test exercises the underlying DB sequence rather than the
 * HTTP route — the route already wraps each step in `startJob/
 * tickJob`. The route-level integration is covered indirectly by
 * `release-meta-materializer.test.ts` for the materializer itself.
 *
 * Synthetic VN / release ids only — never reference real titles.
 */
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import {
  addToCollection,
  db as appDb,
  getReleaseMeta,
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

describe('global refresh rebuilds release_meta_cache', () => {
  it('busts stale rows and re-materializes from cached release payloads', () => {
    seedVn('v90600');
    addToCollection('v90600', {});
    // Seed a STALE release_meta_cache row with the wrong platforms,
    // simulating a pre-refresh state. Direct SQL keeps the test
    // independent of the materializer's upsert path.
    db.prepare(
      `INSERT INTO release_meta_cache (
         release_id, vn_id, title, platforms, languages, released, fetched_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      'r906001',
      'v90600',
      'stale title',
      JSON.stringify(['win']),
      JSON.stringify([{ lang: 'ja' }]),
      '2020-01-01',
      1, // ancient timestamp
    );

    // Mirror the route's bust sweep: wipe release_meta_cache. Then
    // seed a FRESH `POST /release` cache row that lists more
    // platforms for the same release id, and re-run the
    // materializer (route does this per-VN).
    appDb.prepare('DELETE FROM release_meta_cache').run();
    seedReleasePayload([
      {
        id: 'r906001',
        title: 'fresh title',
        platforms: ['win', 'psv', 'swi'],
        languages: [{ lang: 'ja' }, { lang: 'en' }],
        released: '2024-06-15',
        vns: [{ id: 'v90600' }],
      },
    ]);
    materializeReleaseMetaForVn('v90600');

    const meta = getReleaseMeta('r906001');
    expect(meta).toBeDefined();
    // Title was 'stale title', now reads the fresh payload.
    expect(meta!.title).toBe('fresh title');
    // Platforms list widened from ['win'] → 3 codes.
    expect(meta!.platforms).toEqual(['win', 'psv', 'swi']);
    expect(meta!.released).toBe('2024-06-15');
    // fetched_at lives in the underlying row but isn't surfaced on
    // the typed result. Query it directly to assert it moved
    // forward (was 1, now wall-clock).
    const raw = db
      .prepare(`SELECT fetched_at FROM release_meta_cache WHERE release_id = ?`)
      .get('r906001') as { fetched_at: number };
    expect(raw.fetched_at).toBeGreaterThan(1000);
  });

  it('materializer is a no-op for synthetic egs_* ids (route filters them out anyway)', () => {
    // The route filters the VN list with /^v\d+$/, but defense-in-
    // depth: even if a synthetic id leaked through, the helper
    // short-circuits and never writes a row.
    materializeReleaseMetaForVn('egs_777');
    const rows = db
      .prepare(`SELECT COUNT(*) AS n FROM release_meta_cache`)
      .get() as { n: number };
    expect(rows.n).toBe(0);
  });

  it('rebuilds rows for every collection VN with cached release payloads', () => {
    seedVn('v90601');
    seedVn('v90602');
    addToCollection('v90601', {});
    addToCollection('v90602', {});
    seedReleasePayload([
      {
        id: 'r906011',
        platforms: ['win'],
        languages: [{ lang: 'ja' }],
        vns: [{ id: 'v90601' }],
      },
      {
        id: 'r906021',
        platforms: ['swi'],
        languages: [{ lang: 'en' }],
        vns: [{ id: 'v90602' }],
      },
    ]);
    appDb.prepare('DELETE FROM release_meta_cache').run();
    // Route iterates every collection VN. Mirror that here.
    for (const id of ['v90601', 'v90602']) {
      materializeReleaseMetaForVn(id);
    }
    expect(getReleaseMeta('r906011')?.platforms).toEqual(['win']);
    expect(getReleaseMeta('r906021')?.platforms).toEqual(['swi']);
  });
});
