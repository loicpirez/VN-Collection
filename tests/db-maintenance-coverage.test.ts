/**
 * Coverage for the import/export round-trip, `migrateVnId`, the audited
 * app-setting writer, owned-release inventory writers, the EGS row
 * upsert/clear path, local-quote persistence, and the `vndb_cache`
 * helper cluster in `src/lib/db.ts`.
 *
 * Hermetic: every fixture goes through a real exported writer against the
 * per-worker temp SQLite from `tests/setup.ts`. No network. Synthetic ids.
 */
import Database from 'better-sqlite3';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  addToCollection,
  clearCache,
  clearEgsForVn,
  deleteCacheByPathPrefix,
  deleteCacheKey,
  exportData,
  getAppSetting,
  getCacheFreshness,
  getCacheRow,
  getCacheRows,
  getCollectionItem,
  getEgsForVn,
  getEgsForVns,
  getRandomLocalQuote,
  getVnCover,
  importData,
  isInCollection,
  isInCollectionMany,
  listActivityForVn,
  listAllQuotes,
  listOwnedReleasesForVn,
  listSettingAudit,
  markReleaseOwned,
  migrateVnId,
  pruneExpiredCache,
  putCacheRow,
  removeFromCollection,
  runStaffCreditUniqueMigration,
  setAppSetting,
  setVnPublishers,
  setQuotesForVn,
  touchCacheRow,
  unmarkReleaseOwned,
  updateOwnedRelease,
  upsertEgsForVn,
  upsertVn,
  type CollectionExportPayload,
} from '@/lib/db';

getCacheRow('boot');
const db = new Database(process.env.DB_PATH!);

function wipe(): void {
  db.exec(`
    DELETE FROM owned_release;
    DELETE FROM egs_game;
    DELETE FROM vn_quote;
    DELETE FROM vn_activity;
    DELETE FROM vn_route;
    DELETE FROM series_vn;
    DELETE FROM series;
    DELETE FROM collection_place_index;
    DELETE FROM collection;
    DELETE FROM vndb_cache;
    DELETE FROM app_setting;
    DELETE FROM app_setting_audit;
    DELETE FROM vn;
  `);
}

beforeAll(wipe);
afterAll(() => db.close());
beforeEach(wipe);

function staffMigrationDb(over: {
  marker?: string;
  exec?: (sql: string) => void;
} = {}): { handle: Database.Database; markerWritten: () => boolean; execCount: () => number } {
  let markerWritten = false;
  let execCount = 0;
  const handle = {
    prepare(sql: string) {
      if (sql.includes("key = 'migration_staff_credit_unique_v1'")) {
        return { get: () => over.marker != null ? { value: over.marker } : undefined };
      }
      if (sql.includes("VALUES ('migration_staff_credit_unique_v1', '1')")) {
        return { run: () => { markerWritten = true; } };
      }
      throw new Error(`unexpected SQL: ${sql}`);
    },
    transaction(fn: () => void) {
      return () => fn();
    },
    exec(sql: string) {
      execCount += 1;
      over.exec?.(sql);
    },
  };
  return {
    handle: handle as unknown as Database.Database,
    markerWritten: () => markerWritten,
    execCount: () => execCount,
  };
}

describe('staff credit uniqueness migration helper', () => {
  it('skips the migration when the marker is already present', () => {
    const fake = staffMigrationDb({ marker: '1' });

    runStaffCreditUniqueMigration(fake.handle);

    expect(fake.execCount()).toBe(0);
    expect(fake.markerWritten()).toBe(false);
  });

  it('runs once and writes the marker on a healthy database', () => {
    const fake = staffMigrationDb();

    runStaffCreditUniqueMigration(fake.handle);

    expect(fake.execCount()).toBe(1);
    expect(fake.markerWritten()).toBe(true);
  });

  it('logs SQLite corruption without rethrowing so unrelated routes can open the DB', () => {
    const error = Object.assign(new Error('database disk image is malformed'), { code: 'SQLITE_CORRUPT_INDEX' });
    const fake = staffMigrationDb({ exec: () => { throw error; } });
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(() => runStaffCreditUniqueMigration(fake.handle)).not.toThrow();
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('SQLite corruption blocked staff credit uniqueness migration'));
    expect(fake.markerWritten()).toBe(false);

    spy.mockRestore();
  });

  it('rethrows non-corruption migration failures', () => {
    const error = new Error('ordinary failure');
    const fake = staffMigrationDb({ exec: () => { throw error; } });

    expect(() => runStaffCreditUniqueMigration(fake.handle)).toThrow(error);
  });
});

function seedEgs(vnId: string, over: Partial<Parameters<typeof upsertEgsForVn>[0]> = {}): void {
  upsertEgsForVn({
    vn_id: vnId,
    egs_id: 4242,
    gamename: 'placeholder',
    gamename_furigana: null,
    brand_id: null,
    brand_name: null,
    model: null,
    description: null,
    image_url: null,
    okazu: 0,
    erogame: 0,
    raw_json: null,
    median: 70,
    average: 70,
    dispersion: null,
    count: 5,
    sellday: null,
    playtime_median_minutes: 300,
    source: 'manual',
    ...over,
  });
}

describe('export / import round-trip', () => {
  it('exports only in-collection VNs and re-imports them idempotently', () => {
    upsertVn({ id: 'v90001', title: 'Owned VN' });
    upsertVn({ id: 'v90002', title: 'Not owned' });
    addToCollection('v90001', { status: 'completed', user_rating: 80, playtime_minutes: 600, notes: 'n', physical_location: ['Shelf A'] });
    const series = db.prepare("INSERT INTO series (name, created_at, updated_at) VALUES ('Saga', ?, ?)").run(Date.now(), Date.now());
    db.prepare('INSERT INTO series_vn (series_id, vn_id, order_index) VALUES (?, ?, 0)').run(series.lastInsertRowid, 'v90001');

    const payload = exportData();
    expect(payload.version).toBe(2);
    expect(payload.vns.map((v) => v.id)).toEqual(['v90001']); // only in-collection.
    expect(payload.collection).toHaveLength(1);
    expect(payload.series.map((s) => s.name)).toEqual(['Saga']);

    // Wipe and re-import.
    wipe();
    const summary = importData(payload);
    expect(summary.vns_upserted).toBe(1);
    expect(summary.collection_upserted).toBe(1);
    expect(summary.series_created).toBe(1);
    expect(summary.series_links).toBe(1);
    expect(getCollectionItem('v90001')?.user_rating).toBe(80);
    expect(getCollectionItem('v90001')?.physical_location).toEqual(['Shelf A']);

    // Re-importing the same payload again is a no-op upsert (series re-used by name).
    const second = importData(payload);
    expect(second.series_created).toBe(0);
    expect(second.collection_upserted).toBe(1);
  });

  it('records soft errors without aborting the whole import', () => {
    const payload: CollectionExportPayload = {
      version: 2,
      exported_at: Date.now(),
      vns: [{ id: 'v90010', title: 'Good', raw: { id: 'v90010', title: 'Good' }, fetched_at: Date.now() }],
      collection: [],
      series: [],
      series_vn: [],
    };
    const summary = importData(payload);
    expect(summary.vns_upserted).toBe(1);
    expect(summary.errors).toEqual([]);
    expect(isInCollection('v90010')).toBe(false);
  });

  it('continues after collection and series-link rows fail foreign-key checks', () => {
    const now = Date.now();
    const payload: CollectionExportPayload = {
      version: 2,
      exported_at: now,
      vns: [{ id: 'v90020', title: 'Imported VN', raw: { id: 'v90020', title: 'Imported VN' }, fetched_at: now }],
      collection: [
        {
          vn_id: 'v99998',
          status: 'planning',
          user_rating: null,
          playtime_minutes: 0,
          started_date: null,
          finished_date: null,
          notes: null,
          favorite: 0,
          location: 'unknown',
          edition_type: 'none',
          edition_label: null,
          physical_location: null,
          added_at: now,
          updated_at: now,
        },
      ],
      series: [{ id: 700, name: 'Broken membership import', description: null, cover_path: null, banner_path: null, created_at: now, updated_at: now }],
      series_vn: [{ series_id: 700, vn_id: 'v99999', order_index: 0 }],
    };

    const summary = importData(payload);
    expect(summary.vns_upserted).toBe(1);
    expect(summary.collection_upserted).toBe(0);
    expect(summary.series_created).toBe(1);
    expect(summary.series_links).toBe(0);
    expect(summary.errors).toEqual([
      'collection v99998: import failed',
      'series_vn 700/v99999: import failed',
    ]);
    expect(isInCollection('v99998')).toBe(false);
  });
});

describe('migrateVnId', () => {
  it('moves every reference from a synthetic id onto a real VN and drops the synthetic row', () => {
    db.prepare('INSERT INTO vn (id, title, egs_only, fetched_at) VALUES (?, ?, 1, ?)').run('egs_7001', 'Synthetic', Date.now());
    upsertVn({ id: 'v90001', title: 'Real VN' });
    addToCollection('egs_7001', { status: 'completed', user_rating: 70 });
    markReleaseOwned('egs_7001', 'synthetic:egs_7001', { condition: 'new' });
    seedEgs('egs_7001');
    db.prepare('INSERT INTO vn_quote (quote_id, vn_id, quote, score, fetched_at) VALUES (?, ?, ?, ?, ?)').run('q1', 'egs_7001', 'line', 3, Date.now());

    migrateVnId('egs_7001', 'v90001');

    expect(db.prepare('SELECT 1 FROM vn WHERE id = ?').get('egs_7001')).toBeUndefined();
    expect(getCollectionItem('v90001')?.user_rating).toBe(70);
    expect(listOwnedReleasesForVn('v90001').map((r) => r.release_id)).toEqual(['synthetic:egs_7001']);
    expect(getEgsForVn('v90001')?.egs_id).toBe(4242);
    expect(db.prepare('SELECT vn_id FROM vn_quote WHERE quote_id = ?').get('q1')).toEqual({ vn_id: 'v90001' });
  });

  it('is a no-op when from === to and throws when the target VN is missing', () => {
    expect(() => migrateVnId('v90001', 'v90001')).not.toThrow();
    expect(() => migrateVnId('egs_8001', 'v99999')).toThrow(/not in vn table/);
  });

  it('drops a duplicate collection row on the target before moving', () => {
    db.prepare('INSERT INTO vn (id, title, egs_only, fetched_at) VALUES (?, ?, 1, ?)').run('egs_7002', 'Synthetic 2', Date.now());
    upsertVn({ id: 'v90002', title: 'Real VN 2' });
    addToCollection('egs_7002', { status: 'completed', user_rating: 55 });
    addToCollection('v90002', { status: 'planning', user_rating: 99 });
    migrateVnId('egs_7002', 'v90002');
    // The synthetic's row wins after the target's duplicate is dropped.
    expect(getCollectionItem('v90002')?.user_rating).toBe(55);
  });
});

describe('app-setting audit', () => {
  it('records a tail-masked audit row for audited keys, and skips unaudited ones', () => {
    setAppSetting('vndb_token', 'super-secret-token-ABCD');
    setAppSetting('default_sort', 'title'); // not audited.
    setAppSetting('vndb_backup_url', 'https://backup.example.test/db');

    expect(getAppSetting('vndb_token')).toBe('super-secret-token-ABCD');
    expect(getAppSetting('default_sort')).toBe('title');

    const audit = listSettingAudit();
    const tokenRow = audit.find((a) => a.key === 'vndb_token');
    expect(tokenRow?.next_preview).toBe('…ABCD'); // masked, never the raw value.
    expect(audit.find((a) => a.key === 'default_sort')).toBeUndefined();
    // URL-shaped credentials store the hostname.
    expect(audit.find((a) => a.key === 'vndb_backup_url')?.next_preview).toBe('backup.example.test');
  });

  it('clearing an audited key deletes the row and logs the transition once', () => {
    setAppSetting('steam_api_key', 'key-WXYZ');
    setAppSetting('steam_api_key', null);
    expect(getAppSetting('steam_api_key')).toBeNull();
    const rows = listSettingAudit().filter((a) => a.key === 'steam_api_key');
    expect(rows).toHaveLength(2); // set + clear.
    // The clear transition is the one whose next preview is null and prior is the masked key.
    const clearRow = rows.find((r) => r.next_preview === null);
    expect(clearRow?.prior_preview).toBe('…WXYZ');
  });

  it('a no-op write (same value) does not append an audit row', () => {
    setAppSetting('vndb_token', 'same-value-0001');
    setAppSetting('vndb_token', 'same-value-0001');
    expect(listSettingAudit().filter((a) => a.key === 'vndb_token')).toHaveLength(1);
  });

  it('audits blank secrets and malformed backup URLs with diagnostic previews', () => {
    setAppSetting('vndb_token', '   ');
    setAppSetting('vndb_backup_url', 'not a url 1234');

    const audit = listSettingAudit();
    expect(audit.find((a) => a.key === 'vndb_token')?.next_preview).toBeNull();
    expect(audit.find((a) => a.key === 'vndb_backup_url')?.next_preview).toBe('…1234');
  });
});

describe('VN materialized indexes', () => {
  it('skips invalid embedded VNDB credits while keeping valid index rows', () => {
    upsertVn({
      id: 'v90031',
      title: 'Index validation VN',
      has_anime: false,
      developers: [
        { id: '', name: 'Ignored developer' },
        { id: 'p90031', name: 'Valid developer' },
      ],
      languages: ['', 'ja'],
      platforms: ['', 'win'],
      tags: [
        { id: '', name: 'Ignored tag', rating: 0, spoiler: 0, category: null },
        { id: 'g90031', name: '', rating: 2, spoiler: 1, category: null },
      ],
      relations: [
        {
          id: 'v90032',
          title: 'Related without developer id',
          relation: 'seq',
          relation_official: false,
          developers: [{ name: 'No id developer' }],
        },
      ],
      staff: [
        {},
        { id: 's90031' },
        { id: 's90032', name: 'Valid Writer', role: 'scenario' },
      ],
      va: [
        { staff: { id: 's90033', name: '' }, character: { id: 'c90031', name: 'No Staff Name' } },
        { staff: { id: 's90034', name: 'No Character Id' }, character: { id: '', name: 'Missing id' } },
        { staff: { id: 's90035', name: 'Valid VA' }, character: { id: 'c90035', name: 'Valid Character' } },
      ],
    });

    expect(db.prepare('SELECT producer_id FROM vn_developer_index WHERE vn_id = ?').all('v90031')).toEqual([
      { producer_id: 'p90031' },
    ]);
    expect(db.prepare('SELECT lang FROM vn_language_index WHERE vn_id = ?').all('v90031')).toEqual([{ lang: 'ja' }]);
    expect(db.prepare('SELECT platform FROM vn_platform_index WHERE vn_id = ?').all('v90031')).toEqual([{ platform: 'win' }]);
    expect(db.prepare('SELECT tag_id, tag_name, spoiler, category FROM vn_tag_index WHERE vn_id = ?').all('v90031')).toEqual([
      { tag_id: 'g90031', tag_name: 'g90031', spoiler: 1, category: null },
    ]);
    expect(db.prepare('SELECT sid, role FROM vn_staff_credit WHERE vn_id = ?').all('v90031')).toEqual([
      { sid: 's90032', role: 'scenario' },
    ]);
    expect(db.prepare('SELECT sid, c_id FROM vn_va_credit WHERE vn_id = ?').all('v90031')).toEqual([
      { sid: 's90035', c_id: 'c90035' },
    ]);
  });

  it('deduplicates publishers and ignores incomplete publisher rows', () => {
    upsertVn({ id: 'v90033', title: 'Publisher index VN' });
    setVnPublishers('v90033', [
      { id: '', name: 'Missing id' },
      { id: 'p90033', name: '' },
      { id: 'p90034', name: 'Publisher A' },
      { id: 'p90034', name: 'Publisher A duplicate' },
      { id: 'p90035', name: 'Publisher B' },
    ]);

    const publisherRow = db.prepare('SELECT publishers FROM vn WHERE id = ?').get('v90033') as { publishers: string };
    expect(JSON.parse(publisherRow.publishers)).toEqual([
      { id: 'p90034', name: 'Publisher A' },
      { id: 'p90035', name: 'Publisher B' },
    ]);
    expect(db.prepare('SELECT producer_id FROM vn_publisher_index WHERE vn_id = ? ORDER BY producer_id').all('v90033')).toEqual([
      { producer_id: 'p90034' },
      { producer_id: 'p90035' },
    ]);
  });
});

describe('owned releases', () => {
  it('inserts, updates, lists, and removes an owned edition', () => {
    upsertVn({ id: 'v90001', title: 'Edition VN' });
    addToCollection('v90001', { status: 'planning' });
    markReleaseOwned('v90001', 'r1001', { condition: 'used', price_paid: 3000, currency: 'JPY', physical_location: ['Box 1'] });
    let rows = listOwnedReleasesForVn('v90001');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ release_id: 'r1001', condition: 'used', price_paid: 3000 });
    expect(rows[0].physical_location).toEqual(['Box 1']);

    // markReleaseOwned on an existing row delegates to updateOwnedRelease.
    markReleaseOwned('v90001', 'r1001', { condition: 'new' });
    expect(listOwnedReleasesForVn('v90001')[0].condition).toBe('new');

    updateOwnedRelease('v90001', 'r1001', { notes: 'mint', physical_location: ['Shelf X'] });
    rows = listOwnedReleasesForVn('v90001');
    expect(rows[0].notes).toBe('mint');
    expect(rows[0].physical_location).toEqual(['Shelf X']);

    // An empty patch is a no-op.
    updateOwnedRelease('v90001', 'r1001', {});
    expect(listOwnedReleasesForVn('v90001')[0].notes).toBe('mint');

    unmarkReleaseOwned('v90001', 'r1001');
    expect(listOwnedReleasesForVn('v90001')).toHaveLength(0);
  });

  it('updates every owned-edition patch field with typed values', () => {
    upsertVn({ id: 'v90021', title: 'Edition full patch VN' });
    addToCollection('v90021', { status: 'planning' });
    markReleaseOwned('v90021', 'r1021');

    updateOwnedRelease('v90021', 'r1021', {
      notes: 'complete patch',
      location: 'jp',
      physical_location: 'Shelf Z, Box Z',
      box_type: 'large',
      edition_label: 'First print',
      condition: 'mint',
      price_paid: 1234,
      currency: 'JPY',
      acquired_date: '2026-01-02',
      purchase_place: 'AliceNet counter',
      owned_platform: 'win',
      dumped: true,
    });

    const [row] = listOwnedReleasesForVn('v90021');
    expect(row).toMatchObject({
      notes: 'complete patch',
      location: 'jp',
      physical_location: ['Shelf Z', 'Box Z'],
      box_type: 'large',
      edition_label: 'First print',
      condition: 'mint',
      price_paid: 1234,
      currency: 'JPY',
      acquired_date: '2026-01-02',
      owned_platform: 'win',
      dumped: true,
    });
    expect(
      db.prepare('SELECT purchase_place, dumped FROM owned_release WHERE vn_id = ? AND release_id = ?').get('v90021', 'r1021'),
    ).toEqual({ purchase_place: 'AliceNet counter', dumped: 1 });
    expect(
      db.prepare('SELECT place FROM collection_place_index WHERE vn_id = ? ORDER BY place').all('v90021'),
    ).toEqual([{ place: 'Box Z' }, { place: 'Shelf Z' }]);

    updateOwnedRelease('v90021', 'r1021', { dumped: false, physical_location: null });
    expect(listOwnedReleasesForVn('v90021')[0].dumped).toBe(false);
    expect(
      db.prepare('SELECT place FROM collection_place_index WHERE vn_id = ?').all('v90021'),
    ).toEqual([]);
  });
});

describe('EGS row upsert / read / clear', () => {
  it('upserts, reads single + bulk, and clears the EGS row', () => {
    upsertVn({ id: 'v90001', title: 'Egs VN' });
    seedEgs('v90001', { median: 88, gamename: 'placeholder-game' });
    expect(getEgsForVn('v90001')).toMatchObject({ egs_id: 4242, median: 88, source: 'manual' });

    const bulk = getEgsForVns(['v90001', 'v99999']);
    expect(bulk.get('v90001')?.median).toBe(88);
    expect(bulk.has('v99999')).toBe(false);
    expect(getEgsForVns([]).size).toBe(0);

    // Re-upsert preserves the existing local_image when not supplied.
    db.prepare('UPDATE egs_game SET local_image = ? WHERE vn_id = ?').run('mirror.jpg', 'v90001');
    seedEgs('v90001', { median: 91 });
    expect(getEgsForVn('v90001')?.local_image).toBe('mirror.jpg');
    expect(getEgsForVn('v90001')?.median).toBe(91);

    clearEgsForVn('v90001');
    expect(getEgsForVn('v90001')).toBeNull();
  });
});

describe('local quotes', () => {
  it('persists quotes for a VN, lists them, and serves a random one', () => {
    upsertVn({ id: 'v90001', title: 'Quoted VN' });
    addToCollection('v90001', { status: 'planning' });
    setQuotesForVn('v90001', [
      { id: 'q1', quote: 'first quoted line placeholder', score: 5, character: { id: 'c1', name: 'Character A' } },
      { id: 'q2', quote: 'second quoted line placeholder', score: 3, character: null },
    ]);
    const all = listAllQuotes();
    expect(all.map((q) => q.quote_id).sort()).toEqual(['q1', 'q2']);
    expect(all.every((q) => q.vn_title === 'Quoted VN')).toBe(true);

    const random = getRandomLocalQuote();
    expect(random && ['q1', 'q2']).toContain(random!.quote_id);

    // Re-persisting replaces the prior set.
    setQuotesForVn('v90001', [{ id: 'q3', quote: 'only one now placeholder', score: 4, character: null }]);
    expect(listAllQuotes().map((q) => q.quote_id)).toEqual(['q3']);
  });

  it('getRandomLocalQuote returns null with no cached quotes', () => {
    expect(getRandomLocalQuote()).toBeNull();
  });
});

describe('vndb_cache helpers', () => {
  it('puts, reads single + bulk, touches, deletes, and clears', () => {
    const now = Date.now();
    putCacheRow({ cache_key: 'GET /vn|a', body: '{"x":1}', etag: 'e1', last_modified: null, fetched_at: now, expires_at: now + 60_000 });
    putCacheRow({ cache_key: 'GET /vn|b', body: '{"y":2}', etag: null, last_modified: null, fetched_at: now, expires_at: now + 60_000 });

    expect(getCacheRow('GET /vn|a')?.body).toBe('{"x":1}');
    expect(getCacheRow('missing')).toBeNull();

    const bulk = getCacheRows(['GET /vn|a', 'GET /vn|b', 'absent']);
    expect(bulk.size).toBe(2);

    // Upsert on conflict updates the body in place.
    putCacheRow({ cache_key: 'GET /vn|a', body: '{"x":99}', etag: 'e2', last_modified: null, fetched_at: now, expires_at: now + 60_000 });
    expect(getCacheRow('GET /vn|a')?.body).toBe('{"x":99}');

    touchCacheRow('GET /vn|a', now + 5, now + 120_000);
    expect(getCacheRow('GET /vn|a')?.expires_at).toBe(now + 120_000);

    deleteCacheKey('GET /vn|a');
    expect(getCacheRow('GET /vn|a')).toBeNull();
  });

  it('prunes expired rows, deletes by path prefix, reports freshness, and clears all', () => {
    const now = Date.now();
    putCacheRow({ cache_key: 'POST /release|x', body: '1', etag: null, last_modified: null, fetched_at: now - 1000, expires_at: now - 1 });
    putCacheRow({ cache_key: 'POST /release|y', body: '2', etag: null, last_modified: null, fetched_at: now, expires_at: now + 60_000 });
    putCacheRow({ cache_key: 'GET /producer|z', body: '3', etag: null, last_modified: null, fetched_at: now, expires_at: now + 60_000 });

    expect(pruneExpiredCache()).toBe(1); // only the expired release row.
    expect(getCacheFreshness(['POST /release|%'])).toBe(now);
    expect(getCacheFreshness([])).toBeNull();

    expect(deleteCacheByPathPrefix('POST /release')).toBe(1);
    expect(getCacheRow('POST /release|y')).toBeNull();
    // A prefix carrying LIKE metacharacters is rejected.
    expect(() => deleteCacheByPathPrefix('bad%prefix')).toThrow();

    expect(clearCache()).toBe(1); // the remaining producer row.
    expect(getCacheRow('GET /producer|z')).toBeNull();
  });
});

describe('collection membership + cover helpers', () => {
  it('isInCollection / isInCollectionMany / removeFromCollection / getVnCover', () => {
    upsertVn({ id: 'v90001', title: 'In', image: { url: 'cover.jpg' } });
    upsertVn({ id: 'v90002', title: 'Out' });
    addToCollection('v90001', { status: 'planning' });

    expect(isInCollection('v90001')).toBe(true);
    expect(isInCollection('v90002')).toBe(false);
    expect(isInCollectionMany([])).toEqual(new Set());
    expect([...isInCollectionMany(['v90001', 'v90002'])]).toEqual(['v90001']);
    expect(getVnCover('v90001')?.image_url).toBe('cover.jpg');
    expect(getVnCover('v99999')).toBeNull();

    addManualActivitySafe('v90001');
    removeFromCollection('v90001');
    expect(isInCollection('v90001')).toBe(false);
  });
});

/** Helper kept out of the table-driven block to avoid an extra import churn. */
function addManualActivitySafe(vnId: string): void {
  // Touch the activity table so removeFromCollection's cascade has rows to drop.
  db.prepare('INSERT INTO vn_activity (vn_id, kind, payload, occurred_at) VALUES (?, ?, ?, ?)').run(vnId, 'manual', '{}', Date.now());
  expect(listActivityForVn(vnId).length).toBeGreaterThan(0);
}
