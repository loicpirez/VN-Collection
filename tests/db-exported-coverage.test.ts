import Database from 'better-sqlite3';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  addManualActivity,
  addToCollection,
  batchVnStockSummaries,
  createShelf,
  deleteActivity,
  deriveVnAspectDisplay,
  findCharacterSiblings,
  getCharacterImage,
  getCharacterImages,
  getDbPath,
  getDbStatus,
  getOwnedRelease,
  getOwnedReleaseAspectInfo,
  getStaffProfileFromCredits,
  getVaTimeline,
  getVasForCharacter,
  isEgsOnly,
  isValidBoxType,
  isValidEditionType,
  isValidLocation,
  listInCollectionVnIds,
  listDumpStatus,
  listStaffProductionCredits,
  listStaffVaCredits,
  listVnIdsOnShelf,
  markReleaseOwned,
  markVnEgsOnly,
  materializeReleaseAspectsForCollectionVns,
  placeShelfDisplayItem,
  placeShelfItem,
  restoreFromSqliteFile,
  searchLocalStaff,
  setAppSetting,
  setEgsLocalImage,
  setOwnedReleaseAspectOverride,
  setStockProviderExtras,
  setVnAspectOverride,
  upsertCharacterImage,
  upsertEgsForVn,
  upsertEgsOnlyVn,
  upsertReleaseResolutionCache,
  upsertVn,
} from '@/lib/db';
import { vndbReleaseFixture } from './fixtures/vndb-release';

getDbStatus();
const db = new Database(process.env.DB_PATH!);

function wipe(): void {
  db.exec(`
    DELETE FROM shelf_display_slot;
    DELETE FROM shelf_slot;
    DELETE FROM shelf_unit;
    DELETE FROM owned_release_aspect_override;
    DELETE FROM release_resolution_cache;
    DELETE FROM vndb_cache;
    DELETE FROM vn_stock_offer;
    DELETE FROM vn_stock_provider_status;
    DELETE FROM owned_release;
    DELETE FROM vn_va_credit;
    DELETE FROM vn_staff_credit;
    DELETE FROM character_image;
    DELETE FROM egs_game;
    DELETE FROM vn_activity;
    DELETE FROM collection_place_index;
    DELETE FROM collection;
    DELETE FROM app_setting;
    DELETE FROM vn;
  `);
}

function seedEgs(vnId: string): void {
  upsertEgsForVn({
    vn_id: vnId,
    egs_id: 90001,
    gamename: 'EGS placeholder',
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
    count: 1,
    sellday: null,
    playtime_median_minutes: 60,
    source: 'manual',
  });
}

function insertStaffCredit(vnId: string, sid: string, role: string, name: string, original: string | null = null): void {
  db.prepare(`
    INSERT INTO vn_staff_credit (vn_id, sid, aid, eid, role, note, name, original, lang)
    VALUES (?, ?, 1, 2, ?, 'credit note', ?, ?, 'ja')
  `).run(vnId, sid, role, name, original);
}

function insertVaCredit(vnId: string, sid: string, charId: string, charName: string, vaName: string, charOriginal: string | null = null): void {
  db.prepare(`
    INSERT INTO vn_va_credit (vn_id, sid, aid, c_id, c_name, c_original, c_image_url, va_name, va_original, va_lang, note)
    VALUES (?, ?, 3, ?, ?, ?, 'https://example.test/character.jpg', ?, 'VA original', 'ja', 'voice note')
  `).run(vnId, sid, charId, charName, charOriginal, vaName);
}

beforeAll(wipe);
beforeEach(wipe);
afterAll(() => db.close());

describe('db exported staff and character helpers', () => {
  it('reconstructs staff profiles from production and VA credits', () => {
    upsertVn({ id: 'v90001', title: 'Production VN' });
    upsertVn({ id: 'v90002', title: 'Voice VN' });
    insertStaffCredit('v90001', 's90001', 'scenario', 'Writer', 'Writer Original');
    insertVaCredit('v90002', 's90002', 'c90001', 'Heroine', 'Voice Actor');

    expect(getStaffProfileFromCredits('s90001')).toEqual({
      sid: 's90001',
      name: 'Writer',
      original: 'Writer Original',
      lang: 'ja',
    });
    expect(getStaffProfileFromCredits('s90002')).toEqual({
      sid: 's90002',
      name: 'Voice Actor',
      original: 'VA original',
      lang: 'ja',
    });
    expect(getStaffProfileFromCredits('s99999')).toBeNull();
  });

  it('groups production and voice credits and scopes them to collection rows', () => {
    upsertVn({ id: 'v90003', title: 'Owned VN', released: '2020-01-01' });
    upsertVn({ id: 'v90004', title: 'External VN', released: '2021-01-01' });
    addToCollection('v90003');
    insertStaffCredit('v90003', 's90003', 'scenario', 'Writer');
    insertStaffCredit('v90003', 's90003', 'art', 'Artist');
    insertStaffCredit('v90004', 's90003', 'music', 'Composer');
    insertVaCredit('v90003', 's90004', 'c90003', 'Owned Heroine', 'Voice Actor');
    insertVaCredit('v90003', 's90004', 'c90004', 'Owned Friend', 'Voice Actor');
    insertVaCredit('v90004', 's90004', 'c90005', 'External Heroine', 'Voice Actor');

    expect(listStaffProductionCredits('s90003')).toHaveLength(2);
    expect(listStaffProductionCredits('s90003', { inCollectionOnly: true })[0].roles).toHaveLength(2);
    expect(listStaffVaCredits('s90004')).toHaveLength(2);
    expect(listStaffVaCredits('s90004', { inCollectionOnly: true })[0].characters).toHaveLength(2);
  });

  it('builds VA timelines, character siblings, and per-character VA groups', () => {
    upsertVn({ id: 'v90005', title: 'Timeline A', released: '2020-01-01' });
    upsertVn({ id: 'v90006', title: 'Timeline B' });
    upsertVn({ id: 'v90007', title: 'Timeline C', released: '2020-12-01' });
    addToCollection('v90005');
    addToCollection('v90007');
    insertVaCredit('v90005', 's90005', 'c90005', 'Recurring Heroine', 'Actor A', 'Recurring Original');
    insertVaCredit('v90006', 's90005', 'c90005', 'Recurring Heroine', 'Actor A', 'Recurring Original');
    insertVaCredit('v90007', 's90006', 'c90006', 'Recurring Heroine', 'Actor B', 'Recurring Original');

    expect(getVaTimeline('s90005')).toEqual([
      { year: 0, total: 1, inCollection: 0, vnIds: ['v90006'] },
      { year: 2020, total: 1, inCollection: 1, vnIds: ['v90005'] },
    ]);
    expect(getVaTimeline('s99999')).toEqual([]);
    expect(findCharacterSiblings('c90005')).toEqual([
      {
        c_id: 'c90006',
        c_name: 'Recurring Heroine',
        c_original: 'Recurring Original',
        c_image_url: 'https://example.test/character.jpg',
        vns: [{ vn_id: 'v90007', vn_title: 'Timeline C' }],
      },
    ]);
    expect(findCharacterSiblings('c99999')).toEqual([]);
    expect(getVasForCharacter('c90005')[0]).toMatchObject({
      sid: 's90005',
      va_name: 'Actor A',
      vns: [
        { id: 'v90005', in_collection: true },
        { id: 'v90006', in_collection: false },
      ],
    });
  });

  it('searches the local staff index with combined filters', () => {
    upsertVn({ id: 'v90008', title: 'Staff Search VN' });
    addToCollection('v90008');
    insertStaffCredit('v90008', 's90008', 'scenario', 'Name_With Percent%', 'Original');
    insertStaffCredit('v90008', 's90008', 'art', 'Name_With Percent%', 'Original');

    expect(searchLocalStaff({ q: 'name_', role: 'scenario', lang: 'ja', limit: 0 })).toEqual([
      {
        id: 's90008',
        name: 'Name_With Percent%',
        original: 'Original',
        lang: 'ja',
        roles: ['scenario'],
        vn_count: 1,
      },
    ]);
    expect(searchLocalStaff({ q: 'absent' })).toEqual([]);
  });
});

describe('db exported image, EGS, activity, and enum helpers', () => {
  it('round-trips character portraits in single and bulk form', () => {
    expect(getCharacterImage('c90010')).toBeNull();
    expect(getCharacterImages([]).size).toBe(0);
    upsertCharacterImage('c90010', 'https://example.test/a.jpg', 'character/a.jpg');
    upsertCharacterImage('c90011', null, null);

    expect(getCharacterImage('c90010')).toMatchObject({ url: 'https://example.test/a.jpg', local_path: 'character/a.jpg' });
    expect(getCharacterImages(['c90010', 'c90011', 'c99999']).size).toBe(2);
  });

  it('creates synthetic EGS-only rows and updates mirrored cover paths', () => {
    upsertEgsOnlyVn({
      vnId: 'egs_90001',
      title: 'Synthetic title',
      alttitle: null,
      released: '2020-01-01',
      description: 'Description',
      imageUrl: 'https://example.test/a.jpg',
    });
    expect(isEgsOnly('egs_90001')).toBe(true);
    markVnEgsOnly('egs_90001', false);
    expect(isEgsOnly('egs_90001')).toBe(false);
    expect(isEgsOnly('egs_99999')).toBe(false);

    seedEgs('egs_90001');
    setEgsLocalImage('egs_90001', 'egs/a.jpg');
    expect(db.prepare('SELECT local_image FROM egs_game WHERE vn_id = ?').get('egs_90001')).toEqual({ local_image: 'egs/a.jpg' });
  });

  it('lists collection ids and deletes activity rows by id', () => {
    upsertVn({ id: 'v90012', title: 'Activity VN' });
    addToCollection('v90012');
    expect(listInCollectionVnIds()).toEqual(['v90012']);
    const activity = addManualActivity('v90012', 'note');
    deleteActivity(activity.id);
    expect(db.prepare('SELECT 1 FROM vn_activity WHERE id = ?').get(activity.id)).toBeUndefined();
  });

  it('validates the remaining collection enum families', () => {
    expect(isValidLocation('jp')).toBe(true);
    expect(isValidLocation('invalid')).toBe(false);
    expect(isValidEditionType('limited')).toBe(true);
    expect(isValidEditionType(1)).toBe(false);
    expect(isValidBoxType('large')).toBe(true);
    expect(isValidBoxType(null)).toBe(false);
  });

  it('reports the database path and status with DB token precedence', () => {
    setAppSetting('vndb_token', 'fixture-token');
    const status = getDbStatus();
    expect(getDbPath()).toBe(process.env.DB_PATH);
    expect(status.db_path).toBe(process.env.DB_PATH);
    expect(status.vndb_token).toBe('db');
    expect(status.rows.some((row) => row.table === 'vn')).toBe(true);
  });
});

describe('db exported shelf and aspect helpers', () => {
  it('lists VN ids across cell and front-display shelf placements', () => {
    upsertVn({ id: 'v90013', title: 'Shelf cell' });
    upsertVn({ id: 'v90014', title: 'Shelf display' });
    markReleaseOwned('v90013', 'r90013');
    markReleaseOwned('v90014', 'r90014');
    const shelf = createShelf({ name: 'Coverage shelf', cols: 2, rows: 2 });
    placeShelfItem({ shelfId: shelf.id, row: 0, col: 0, vnId: 'v90013', releaseId: 'r90013' });
    placeShelfDisplayItem({ shelfId: shelf.id, afterRow: 1, position: 0, vnId: 'v90014', releaseId: 'r90014' });

    expect([...listVnIdsOnShelf()].sort()).toEqual(['v90013', 'v90014']);
  });

  it('reads missing, manual, cached, and unknown owned-release aspect details', () => {
    upsertVn({ id: 'v90015', title: 'Aspect VN' });
    markReleaseOwned('v90015', 'r90015');
    markReleaseOwned('v90015', 'r90016');
    markReleaseOwned('v90015', 'r90017');

    expect(getOwnedRelease('v90015', 'r99999')).toBeNull();
    expect(getOwnedRelease('v90015', 'r90015')?.release_id).toBe('r90015');
    expect(getOwnedReleaseAspectInfo('v90015', 'r99999').source).toBe('unknown');

    setOwnedReleaseAspectOverride({ vnId: 'v90015', releaseId: 'r90015', width: 1920, height: 1080, note: 'manual' });
    expect(getOwnedReleaseAspectInfo('v90015', 'r90015')).toMatchObject({ aspect_key: '16:9', source: 'manual', note: 'manual' });

    upsertReleaseResolutionCache({ releaseId: 'r90016', vnId: 'v90015', resolution: '800x600' });
    expect(getOwnedReleaseAspectInfo('v90015', 'r90016')).toMatchObject({ aspect_key: '4:3', source: 'vndb' });
    expect(getOwnedReleaseAspectInfo('v90015', 'r90017')).toMatchObject({ aspect_key: 'unknown', source: 'unknown' });

    setOwnedReleaseAspectOverride({ vnId: 'v90015', releaseId: 'r90015', aspectKey: null });
    expect(getOwnedReleaseAspectInfo('v90015', 'r90015').source).toBe('unknown');
    expect(() => setOwnedReleaseAspectOverride({ vnId: 'v90015', releaseId: 'r99999', aspectKey: '16:9' })).toThrow(/owned edition/);
  });

  it('derives aspect display priority from manual, edition, release, screenshot, and unknown rows', () => {
    upsertVn({ id: 'v90016', title: 'Manual Aspect' });
    setVnAspectOverride({ vnId: 'v90016', aspectKey: '4:3' });
    expect(deriveVnAspectDisplay('v90016')).toMatchObject({ aspect: '4:3', source: 'manual' });

    upsertVn({ id: 'v90017', title: 'Edition Aspect' });
    markReleaseOwned('v90017', 'r90018');
    setOwnedReleaseAspectOverride({ vnId: 'v90017', releaseId: 'r90018', aspectKey: '16:9' });
    expect(deriveVnAspectDisplay('v90017')).toMatchObject({ aspect: '16:9', source: 'edition' });

    upsertVn({ id: 'v90018', title: 'Release Aspect' });
    upsertReleaseResolutionCache({ releaseId: 'r90019', vnId: 'v90018', resolution: '1920x1080' });
    upsertReleaseResolutionCache({ releaseId: 'r90020', vnId: 'v90018', resolution: '1920x1080' });
    upsertReleaseResolutionCache({ releaseId: 'r90021', vnId: 'v90018', resolution: '800x600' });
    expect(deriveVnAspectDisplay('v90018')).toMatchObject({ aspect: '16:9', aspects: ['16:9', '4:3'], source: 'release' });

    upsertVn({ id: 'v90019', title: 'Screenshot Aspect' });
    db.prepare(`
      INSERT INTO release_resolution_cache (release_id, vn_id, width, height, raw_resolution, aspect_key, fetched_at)
      VALUES ('screenshot:v90019:0', 'v90019', 1280, 720, '1280x720', '16:9', ?)
    `).run(Date.now());
    expect(deriveVnAspectDisplay('v90019')).toMatchObject({ aspect: '16:9', source: 'screenshot' });

    upsertVn({ id: 'v90020', title: 'Unknown Aspect' });
    expect(deriveVnAspectDisplay('v90020')).toMatchObject({ aspect: 'unknown', source: 'unknown' });
  });
});

describe('db exported aspect materialization and dump helpers', () => {
  it('materializes cached release aspects for collection VN batches', () => {
    expect(() => materializeReleaseAspectsForCollectionVns([])).not.toThrow();
    expect(() => materializeReleaseAspectsForCollectionVns(['egs_90002'])).not.toThrow();
    upsertVn({ id: 'v90021', title: 'Materialized aspect' });
    upsertVn({ id: 'v90022', title: 'Already materialized' });
    upsertReleaseResolutionCache({ releaseId: 'r90022', vnId: 'v90022', resolution: '800x600' });
    db.prepare(`
      INSERT INTO vndb_cache (cache_key, body, fetched_at, expires_at)
      VALUES (?, ?, ?, ?), (?, ?, ?, ?)
    `).run(
      'POST /release|POST|valid',
      JSON.stringify({
        results: [
          vndbReleaseFixture({ id: 'r90021', resolution: [1920, 1080], vns: [{ id: 'v90021' }] }),
          vndbReleaseFixture({ id: 'r99999', resolution: [1280, 720], vns: [{ id: 'v99999' }] }),
        ],
      }),
      Date.now(),
      Date.now() + 1000,
      'POST /release|POST|invalid',
      '{',
      Date.now(),
      Date.now() + 1000,
    );

    materializeReleaseAspectsForCollectionVns(['v90021', 'v90022']);
    expect(deriveVnAspectDisplay('v90021')).toMatchObject({ aspect: '16:9', source: 'release' });
    expect(deriveVnAspectDisplay('v90022')).toMatchObject({ aspect: '4:3', source: 'release' });
    expect(() => materializeReleaseAspectsForCollectionVns(['v90021', 'v90022'])).not.toThrow();
  });

  it('sorts partial, untouched, and completed dump rows in operator order', () => {
    for (const id of ['v90023', 'v90024', 'v90025']) {
      upsertVn({ id, title: id });
      addToCollection(id);
    }
    markReleaseOwned('v90023', 'r90023', { dumped: true });
    markReleaseOwned('v90023', 'r90024');
    markReleaseOwned('v90025', 'r90025', { dumped: true });

    expect(listDumpStatus().map((row) => row.vn_id)).toEqual(['v90023', 'v90024', 'v90025']);
  });
});

describe('db exported stock-summary extras fallback', () => {
  it('uses selected Eroge Price retailer prices before materialized offers exist', () => {
    upsertVn({ id: 'v90026', title: 'Eroge extras' });
    expect(setStockProviderExtras('v90026', 'eroge_price', {
      schemaVersion: 1,
      candidates: [
        {
          epId: 90026,
          detail: {
            id: 90026,
            title: 'Fallback title',
            downloadRetailers: [
              { retailerId: 1, retailerName: 'A', productUrl: 'https://example.test/a', currentPrice: 3200 },
              { retailerId: 2, retailerName: 'B', productUrl: 'https://example.test/b', currentPrice: 0 },
            ],
            packageRetailers: [
              { retailerId: 3, retailerName: 'C', productUrl: 'https://example.test/c', currentPrice: 2100 },
            ],
          },
        },
      ],
      selectedEpId: 90026,
    })).toBe(true);

    expect(batchVnStockSummaries(['v90026']).get('v90026')).toEqual({ available: 2, best_price: 2100 });
  });
});

describe('db exported SQLite restore', () => {
  it('restores a live backup and records audited setting changes', async () => {
    setAppSetting('vndb_token', 'before-1111');
    upsertVn({ id: 'v90027', title: 'Backup row' });
    const dir = await mkdtemp(join(tmpdir(), 'vndb-db-coverage-'));
    const backupPath = join(dir, 'backup.db');
    try {
      await db.backup(backupPath);
      const buffer = await readFile(backupPath);
      setAppSetting('vndb_token', 'after-2222');
      db.prepare('DELETE FROM vn WHERE id = ?').run('v90027');

      const summary = await restoreFromSqliteFile(buffer);

      expect(summary.tables.some((table) => table.name === 'vn')).toBe(true);
      expect(db.prepare('SELECT title FROM vn WHERE id = ?').get('v90027')).toEqual({ title: 'Backup row' });
      expect(db.prepare(`SELECT 1 FROM app_setting_audit WHERE key = 'vndb_token (restore)'`).get()).toBeDefined();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('rejects non-SQLite restore buffers', async () => {
    await expect(restoreFromSqliteFile(Buffer.from('not sqlite'))).rejects.toThrow(/not a valid SQLite DB/);
  });
});
