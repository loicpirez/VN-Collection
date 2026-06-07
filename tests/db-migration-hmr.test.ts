/**
 * HMR resilience for the DB migration block.
 *
 * Long-running Next.js dev servers keep `global.__vndb_db` cached
 * across Turbopack hot-reloads. If source-tree edits add a new table
 * or column, the cached connection would never see it — and a route
 * that queries the new schema would 500 with "no such table" until
 * the user manually restarts the dev process.
 *
 * The contract we test: every call to `open()` runs the idempotent
 * migration body, even when `global.__vndb_db` is set. Re-running is
 * safe because every statement is `CREATE TABLE IF NOT EXISTS`,
 * `ensureColumn` (which checks via PRAGMA table_info before
 * `ALTER TABLE`), or a marker-gated `INSERT OR REPLACE INTO
 * app_setting` short-circuit.
 *
 * Without the fix in commit `<this one>`, this test would deadlock or
 * miss any new table the migration body adds against an existing
 * `global.__vndb_db`.
 */
import { describe, expect, it, vi } from 'vitest';
import { db } from '../src/lib/db';

declare global {
  // eslint-disable-next-line no-var
  var __vndb_db: import('better-sqlite3').Database | undefined;
}

async function rerunMigrations(): Promise<void> {
  vi.resetModules();
  const fresh = (await import('../src/lib/db')) as typeof import('../src/lib/db');
  void fresh.db.prepare('SELECT 1').get();
}

describe('DB migration HMR resilience', () => {
  it('runs migrations even when global.__vndb_db is already set', async () => {
    // Touch the lazy DB proxy so global.__vndb_db is populated with
    // the current process's connection.
    void db.prepare('SELECT 1').get();
    // Drop a recently-added table to simulate a connection that
    // pre-dates the migration that creates it. `vn_egs_link` is the
    // most recent addition (commit 8622e2e). The HMR scenario keeps
    // `global.__vndb_db` but resets module-local `_dbInstance` —
    // simulate that here via `vi.resetModules()`.
    const cached = global.__vndb_db;
    expect(cached).toBeDefined();
    cached!.exec(`DROP TABLE IF EXISTS vn_egs_link`);
    cached!.exec(`DROP TABLE IF EXISTS egs_vn_link`);
    expect(
      (
        cached!
          .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name = 'vn_egs_link'`)
          .all() as Array<{ name: string }>
      ).length,
    ).toBe(0);

    // Force HMR-style module re-import: `_dbInstance` resets, but
    // `global.__vndb_db` survives because vi.resetModules doesn't
    // clear globals.
    vi.resetModules();
    const { db: dbReimport } = (await import('../src/lib/db')) as typeof import('../src/lib/db');
    // First access through the new Proxy triggers a fresh open() ->
    // sees global.__vndb_db, reuses it, AND re-runs migrations.
    void dbReimport.prepare('SELECT 1').get();

    const after = cached!
      .prepare(
        `SELECT name FROM sqlite_master WHERE type='table'
         AND name IN ('vn_egs_link', 'egs_vn_link', 'vn_aspect_override', 'shelf_display_slot')`,
      )
      .all() as Array<{ name: string }>;
    expect(after.map((r) => r.name).sort()).toEqual(
      ['egs_vn_link', 'shelf_display_slot', 'vn_aspect_override', 'vn_egs_link'].sort(),
    );
  });

  it('open() is idempotent — re-running creates no duplicates or errors', () => {
    // Run the lazy access several times; each call routes through
    // _dbInstance which is module-cached, but the underlying
    // open()-time migrations are designed to survive repeated calls
    // (also matters when better-sqlite3 resets _dbInstance during
    // tests or HMR).
    for (let i = 0; i < 3; i++) {
      void db.prepare('SELECT 1').get();
    }
    // No exception thrown above — and the schema is still intact.
    const tables = (
      global.__vndb_db!.prepare(`SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table'`).get() as {
        n: number;
      }
    ).n;
    // Conservative lower bound: the app has many tables. If migrations
    // dropped any during the loop we'd see fewer than this.
    expect(tables).toBeGreaterThan(20);
  });

  it('reruns physical-location JSON and place-index backfills on a cached connection', async () => {
    void db.prepare('SELECT 1').get();
    const cached = global.__vndb_db;
    expect(cached).toBeDefined();
    cached!.exec(`
      DELETE FROM collection_place_index;
      DELETE FROM owned_release;
      DELETE FROM collection;
      DELETE FROM vn;
      DELETE FROM app_setting WHERE key IN ('phys_loc_json_migration_v1', 'collection_place_index_v2');
    `);
    cached!.prepare('INSERT INTO vn (id, title, fetched_at) VALUES (?, ?, ?)').run('v97001', 'Placeholder A', 1);
    cached!.prepare('INSERT INTO vn (id, title, fetched_at) VALUES (?, ?, ?)').run('v97002', 'Placeholder B', 1);
    cached!.prepare('INSERT INTO vn (id, title, fetched_at) VALUES (?, ?, ?)').run('v97003', 'Placeholder C', 1);
    cached!
      .prepare('INSERT INTO collection (vn_id, status, physical_location, added_at, updated_at) VALUES (?, ?, ?, ?, ?)')
      .run('v97001', 'completed', 'Shelf A, Shelf B', 1, 1);
    cached!
      .prepare('INSERT INTO collection (vn_id, status, physical_location, added_at, updated_at) VALUES (?, ?, ?, ?, ?)')
      .run('v97002', 'completed', null, 1, 1);
    cached!
      .prepare('INSERT INTO owned_release (vn_id, release_id, physical_location, added_at) VALUES (?, ?, ?, ?)')
      .run('v97001', 'r97001', JSON.stringify(['Box C']), 1);
    cached!
      .prepare('INSERT INTO owned_release (vn_id, release_id, physical_location, added_at) VALUES (?, ?, ?, ?)')
      .run('v97002', 'r97002', JSON.stringify(['Box D']), 1);
    cached!
      .prepare('INSERT INTO owned_release (vn_id, release_id, physical_location, added_at) VALUES (?, ?, ?, ?)')
      .run('v97003', 'r97003', JSON.stringify(['Orphan Box']), 1);

    await rerunMigrations();

    const row = cached!
      .prepare('SELECT physical_location FROM collection WHERE vn_id = ?')
      .get('v97001') as { physical_location: string | null };
    expect(JSON.parse(row.physical_location ?? '[]')).toEqual(['Shelf A', 'Shelf B']);
    const places = cached!
      .prepare('SELECT place FROM collection_place_index WHERE vn_id = ? ORDER BY place')
      .all('v97001') as Array<{ place: string }>;
    expect(places.map((p) => p.place)).toEqual(['Box C', 'Shelf A', 'Shelf B']);
    const ownedOnlyPlaces = cached!
      .prepare('SELECT place FROM collection_place_index WHERE vn_id = ? ORDER BY place')
      .all('v97002') as Array<{ place: string }>;
    expect(ownedOnlyPlaces.map((p) => p.place)).toEqual(['Box D']);
    const orphanPlaces = cached!
      .prepare('SELECT place FROM collection_place_index WHERE vn_id = ? ORDER BY place')
      .all('v97003') as Array<{ place: string }>;
    expect(orphanPlaces).toEqual([]);
  });

  it('reruns EGS synthetic id migrations across legacy and stale child rows', async () => {
    void db.prepare('SELECT 1').get();
    const cached = global.__vndb_db;
    expect(cached).toBeDefined();
    cached!.exec(`
      DELETE FROM staff_credit_index;
      DELETE FROM collection_place_index;
      DELETE FROM vn_egs_link;
      DELETE FROM collection;
      DELETE FROM vn;
      DELETE FROM app_setting WHERE key IN ('egs_colon_to_underscore_v1', 'egs_colon_to_underscore_v2');
    `);
    cached!.prepare('INSERT INTO vn (id, title, fetched_at) VALUES (?, ?, ?)').run('egs:97001', 'Placeholder B', 1);
    cached!
      .prepare('INSERT INTO collection (vn_id, status, added_at, updated_at) VALUES (?, ?, ?, ?)')
      .run('egs:97001', 'planning', 1, 1);

    await rerunMigrations();

    expect(
      cached!.prepare('SELECT id FROM vn WHERE id = ?').get('egs_97001'),
    ).toBeTruthy();
    expect(
      cached!.prepare('SELECT vn_id FROM collection WHERE vn_id = ?').get('egs_97001'),
    ).toBeTruthy();

    cached!.prepare('INSERT INTO vn (id, title, fetched_at) VALUES (?, ?, ?)').run('egs_97002', 'Placeholder C', 1);
    cached!.prepare("DELETE FROM app_setting WHERE key = 'egs_colon_to_underscore_v2'").run();

    await rerunMigrations();

    expect(
      cached!.prepare("SELECT value FROM app_setting WHERE key = 'egs_colon_to_underscore_v2'").get(),
    ).toEqual({ value: '1' });
  });

  it('reruns JSON-derived staff, tag, producer, language, platform, and staff-full backfills', async () => {
    void db.prepare('SELECT 1').get();
    const cached = global.__vndb_db;
    expect(cached).toBeDefined();
    cached!.exec(`
      DELETE FROM staff_credit_index;
      DELETE FROM vn_platform_index;
      DELETE FROM vn_language_index;
      DELETE FROM vn_publisher_index;
      DELETE FROM vn_developer_index;
      DELETE FROM vn_tag_index;
      DELETE FROM vn_va_credit;
      DELETE FROM vn_staff_credit;
      DELETE FROM vndb_cache;
      DELETE FROM vn;
      DELETE FROM app_setting
       WHERE key IN (
         'staff_va_credits_v1',
         'staff_credit_index_v1',
         'vn_tag_index_v1',
         'vn_tag_index_tag_name_v1',
         'vn_lang_platform_index_v1'
       );
    `);
    const validStaff = JSON.stringify([
      { id: 'S97010', aid: 1, eid: 2, role: 'scenario', note: 'note', name: 'Writer', original: '作家', lang: 'ja' },
    ]);
    const validVa = JSON.stringify([
      {
        note: 'voice',
        character: { id: 'C97010', name: 'Heroine', original: 'ヒロイン', image: { url: 'https://example.test/heroine.jpg' } },
        staff: { id: 'S97011', aid: 3, name: 'Voice Actor', original: '声優', lang: 'ja' },
      },
    ]);
    const validTags = JSON.stringify([{ id: 'G97010', name: 'Mystery', spoiler: 1, category: 'cont' }]);
    const validProducer = JSON.stringify([{ id: 'P97010', name: 'Producer' }]);
    const validPublisher = JSON.stringify([{ id: 'P97011', name: 'Publisher' }]);
    const validLanguages = JSON.stringify(['ja', 'en']);
    const validPlatforms = JSON.stringify(['win']);
    cached!
      .prepare(`
        INSERT INTO vn (
          id, title, staff, va, tags, developers, publishers, languages, platforms, fetched_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        'v97010',
        'Migration valid',
        validStaff,
        validVa,
        validTags,
        validProducer,
        validPublisher,
        validLanguages,
        validPlatforms,
        1,
      );
    cached!
      .prepare(`
        INSERT INTO vn (
          id, title, staff, va, tags, developers, publishers, languages, platforms, fetched_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run('v97011', 'Migration malformed', '{', '{', '{', '{', '{', '{', '{', 1);
    cached!
      .prepare('INSERT INTO vndb_cache (cache_key, body, fetched_at, expires_at) VALUES (?, ?, ?, ?)')
      .run(
        'staff_full:s97020',
        JSON.stringify({ productionCredits: [{ id: 'v97010' }], vaCredits: [{ id: 'v97011' }] }),
        1,
        2,
      );
    cached!
      .prepare('INSERT INTO vndb_cache (cache_key, body, fetched_at, expires_at) VALUES (?, ?, ?, ?)')
      .run('staff_full:s97021', '{', 1, 2);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    await rerunMigrations();

    expect(
      cached!.prepare('SELECT sid, role, name, original FROM vn_staff_credit WHERE vn_id = ?').get('v97010'),
    ).toEqual({ sid: 's97010', role: 'scenario', name: 'Writer', original: '作家' });
    expect(
      cached!.prepare('SELECT sid, c_id, va_name, c_image_url FROM vn_va_credit WHERE vn_id = ?').get('v97010'),
    ).toEqual({ sid: 's97011', c_id: 'c97010', va_name: 'Voice Actor', c_image_url: 'https://example.test/heroine.jpg' });
    expect(
      cached!.prepare('SELECT tag_id, tag_name, spoiler, category FROM vn_tag_index WHERE vn_id = ?').get('v97010'),
    ).toEqual({ tag_id: 'g97010', tag_name: 'Mystery', spoiler: 1, category: 'cont' });
    expect(
      cached!.prepare('SELECT producer_id FROM vn_developer_index WHERE vn_id = ?').get('v97010'),
    ).toEqual({ producer_id: 'p97010' });
    expect(
      cached!.prepare('SELECT producer_id FROM vn_publisher_index WHERE vn_id = ?').get('v97010'),
    ).toEqual({ producer_id: 'p97011' });
    expect(
      cached!.prepare('SELECT lang FROM vn_language_index WHERE vn_id = ? ORDER BY lang').all('v97010'),
    ).toEqual([{ lang: 'en' }, { lang: 'ja' }]);
    expect(
      cached!.prepare('SELECT platform FROM vn_platform_index WHERE vn_id = ?').get('v97010'),
    ).toEqual({ platform: 'win' });
    expect(
      cached!.prepare('SELECT sid, vn_id, is_va FROM staff_credit_index WHERE sid = ? ORDER BY is_va').all('s97020'),
    ).toEqual([
      { sid: 's97020', vn_id: 'v97010', is_va: 0 },
      { sid: 's97020', vn_id: 'v97011', is_va: 1 },
    ]);
    expect(warn.mock.calls.map((call) => String(call[0]))).toEqual([
      '[migrate] vn v97011 has malformed staff JSON',
      '[migrate] vn v97011 has malformed va JSON',
      '[migrate] vn v97011 has malformed tags JSON',
      '[migrate] vn v97011 has malformed developers JSON',
      '[migrate] vn v97011 has malformed publishers JSON',
      '[migrate] vn v97011 has malformed languages JSON',
      '[migrate] vn v97011 has malformed platforms JSON',
    ]);
    warn.mockRestore();
  });

  it('reruns the tag-name-only backfill when the wider tag index is already marked done', async () => {
    void db.prepare('SELECT 1').get();
    const cached = global.__vndb_db;
    expect(cached).toBeDefined();
    cached!.exec(`
      DELETE FROM vn_tag_index;
      DELETE FROM vn;
      DELETE FROM app_setting WHERE key IN ('vn_tag_index_v1', 'vn_tag_index_tag_name_v1');
    `);
    cached!
      .prepare('INSERT INTO vn (id, title, tags, fetched_at) VALUES (?, ?, ?, ?)')
      .run('v97012', 'Tag-name only', JSON.stringify([{ id: 'G97012', name: 'Drama', spoiler: 0, category: 'cont' }]), 1);
    cached!
      .prepare('INSERT INTO vn (id, title, tags, fetched_at) VALUES (?, ?, ?, ?)')
      .run('v97013', 'Tag-name malformed', '{', 1);
    cached!.prepare("INSERT INTO app_setting (key, value) VALUES ('vn_tag_index_v1', '1')").run();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    await rerunMigrations();

    expect(
      cached!.prepare('SELECT tag_id, tag_name FROM vn_tag_index WHERE vn_id = ?').get('v97012'),
    ).toEqual({ tag_id: 'g97012', tag_name: 'Drama' });
    expect(
      cached!.prepare("SELECT value FROM app_setting WHERE key = 'vn_tag_index_tag_name_v1'").get(),
    ).toEqual({ value: '1' });
    expect(warn.mock.calls.map((call) => String(call[0]))).toContain('[migrate] vn v97013 has malformed tags JSON');
    warn.mockRestore();
  });
});
