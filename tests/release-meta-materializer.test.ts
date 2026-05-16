/**
 * Pin the per-release metadata harvest contract.
 *
 * Before this change, the shelf-edition info popover surfaced VN-
 * level aggregate platforms / languages / release date. A user
 * who owned only the WIN release of a multi-platform VN saw
 * "WIN · PS4 · PSV · SWI" — confusing because they're shelving
 * ONE physical edition, not the entire VN catalog.
 *
 * The new flow: `materializeReleaseMetaForVn` scans cached
 * `POST /release|*` rows in `vndb_cache`, extracts every release
 * linked to the VN, and upserts the EXACT release-level fields
 * into `release_meta_cache`. The shelf list helpers then LEFT JOIN
 * that table so each owned edition carries `rel_platforms`,
 * `rel_languages`, `rel_released`, `rel_resolution`, etc.
 *
 * Tests use synthetic VN / release ids only — no real titles.
 */
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import {
  addToCollection,
  listAllOwnedReleases,
  listShelves,
  materializeReleaseMetaForVn,
  getReleaseMeta,
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

function seedVn(id: string, platforms: string[], languages: string[]): void {
  db.prepare(
    `INSERT OR REPLACE INTO vn (id, title, platforms, languages, fetched_at)
     VALUES (?, ?, ?, ?, ?)`,
  ).run(id, id, JSON.stringify(platforms), JSON.stringify(languages), Date.now());
}

function seedOwnedRelease(vnId: string, releaseId: string): void {
  db.prepare(
    `INSERT INTO owned_release (vn_id, release_id, added_at) VALUES (?, ?, ?)`,
  ).run(vnId, releaseId, Date.now());
}

function seedReleasePayload(vnId: string, releases: unknown[]): void {
  const key = `POST /release|POST|cafe${Math.random().toString(16).slice(2, 10)}`;
  db.prepare(
    `INSERT OR REPLACE INTO vndb_cache (cache_key, body, fetched_at, expires_at)
     VALUES (?, ?, ?, ?)`,
  ).run(key, JSON.stringify({ results: releases }), Date.now(), Date.now() + 3600 * 1000);
  void vnId;
}

beforeAll(() => clear());
beforeEach(() => clear());

describe('per-release metadata cache', () => {
  it('harvests platforms/languages/released per exact release id', () => {
    seedVn('v90300', ['win', 'psv', 'swi'], ['ja', 'en']);
    seedOwnedRelease('v90300', 'r903001');
    seedReleasePayload('v90300', [
      {
        id: 'r903001',
        title: 'synthetic release a',
        platforms: ['win'],
        languages: [{ lang: 'ja', main: true }],
        released: '2024-06-15',
        resolution: [1920, 1080],
        vns: [{ id: 'v90300' }],
      },
      {
        id: 'r903002',
        title: 'synthetic release b',
        platforms: ['psv'],
        languages: [{ lang: 'ja' }, { lang: 'en' }],
        released: '2024-09-01',
        vns: [{ id: 'v90300' }],
      },
    ]);

    materializeReleaseMetaForVn('v90300');

    const r1 = getReleaseMeta('r903001');
    const r2 = getReleaseMeta('r903002');
    expect(r1).toBeDefined();
    expect(r2).toBeDefined();
    expect(r1!.platforms).toEqual(['win']);
    expect(r1!.languages).toEqual([{ lang: 'ja', main: true }]);
    expect(r1!.released).toBe('2024-06-15');
    expect(r1!.resolution).toBe('1920x1080');
    expect(r2!.platforms).toEqual(['psv']);
    expect(r2!.languages).toEqual([{ lang: 'ja' }, { lang: 'en' }]);
    expect(r2!.released).toBe('2024-09-01');
  });

  it('listAllOwnedReleases LEFT JOINs release_meta_cache so each owned edition carries its own platforms', () => {
    seedVn('v90301', ['win', 'psv', 'swi'], ['ja']);
    addToCollection('v90301', {});
    // Owned: WIN release only.
    seedOwnedRelease('v90301', 'r903011');
    seedReleasePayload('v90301', [
      {
        id: 'r903011',
        platforms: ['win'],
        languages: [{ lang: 'ja' }],
        released: '2024-06-15',
        vns: [{ id: 'v90301' }],
      },
    ]);
    materializeReleaseMetaForVn('v90301');

    const entry = listAllOwnedReleases().find(
      (e) => e.vn_id === 'v90301' && e.release_id === 'r903011',
    );
    expect(entry).toBeDefined();
    // rel_* fields are populated and narrower than vn_* aggregate.
    expect(entry!.rel_platforms).toEqual(['win']);
    expect(entry!.vn_platforms).toEqual(['win', 'psv', 'swi']);
    expect(entry!.rel_released).toBe('2024-06-15');
    expect(entry!.rel_languages).toEqual(['ja']);
  });

  it('two owned editions of the same VN surface their own release-specific platforms', () => {
    seedVn('v90302', ['win', 'swi'], ['ja', 'en']);
    addToCollection('v90302', {});
    seedOwnedRelease('v90302', 'r903021'); // WIN
    seedOwnedRelease('v90302', 'r903022'); // SWI
    seedReleasePayload('v90302', [
      {
        id: 'r903021',
        platforms: ['win'],
        languages: [{ lang: 'ja' }],
        vns: [{ id: 'v90302' }],
      },
      {
        id: 'r903022',
        platforms: ['swi'],
        languages: [{ lang: 'en' }],
        vns: [{ id: 'v90302' }],
      },
    ]);
    materializeReleaseMetaForVn('v90302');

    const rows = listAllOwnedReleases().filter((e) => e.vn_id === 'v90302');
    expect(rows).toHaveLength(2);
    const win = rows.find((r) => r.release_id === 'r903021')!;
    const swi = rows.find((r) => r.release_id === 'r903022')!;
    expect(win.rel_platforms).toEqual(['win']);
    expect(swi.rel_platforms).toEqual(['swi']);
    // Languages too: WIN edition is ja-only; SWI edition is en-only.
    expect(win.rel_languages).toEqual(['ja']);
    expect(swi.rel_languages).toEqual(['en']);
  });

  it('synthetic release ids gracefully degrade (LEFT JOIN returns null, helpers expose empty arrays)', () => {
    seedVn('v90303', ['win', 'psv'], ['ja']);
    addToCollection('v90303', {});
    // Synthetic id (e.g. EGS-only VN); release_meta_cache will not have a row.
    seedOwnedRelease('v90303', 'synthetic:v90303');
    materializeReleaseMetaForVn('v90303'); // no-op, but should not throw

    const entry = listAllOwnedReleases().find(
      (e) => e.vn_id === 'v90303' && e.release_id === 'synthetic:v90303',
    );
    expect(entry).toBeDefined();
    expect(entry!.rel_platforms).toEqual([]);
    expect(entry!.rel_languages).toEqual([]);
    expect(entry!.rel_released).toBeNull();
    // VN-aggregate fallback is still available.
    expect(entry!.vn_platforms).toEqual(['win', 'psv']);
  });
});
