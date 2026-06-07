import Database from 'better-sqlite3';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  addGameLogEntry,
  addManualActivity,
  addToCollection,
  addVnToSeries,
  assertRestoreTmpPath,
  assertSqlIdent,
  batchGetCharNames,
  batchGetProducerNames,
  batchGetStaffNames,
  batchVnStockSummaries,
  buildTextSearchSnippet,
  countAliceNetDownloadPending,
  countAliceNetStock,
  createPlace,
  createRoute,
  createSeries,
  createShelf,
  createUserList,
  db as appDb,
  deriveVnAspectDisplay,
  deriveVnAspectKey,
  findCharacterSiblings,
  findDuplicates,
  findStaffSiblings,
  getAggregateStats,
  getAppSetting,
  getCacheFreshness,
  getCollectionItem,
  getDbStatus,
  getPlace,
  getReleaseMeta,
  getSourcePref,
  getSteamLinkByAppid,
  getVaTimeline,
  importData,
  invalidateAggregateStats,
  invalidateProducerStats,
  listActivityForVn,
  listAllQuotes,
  listCollection,
  listDumpStatus,
  listKnownPlaces,
  listOffersAtPlace,
  listOwnedReleasesWithShelfForVn,
  listPlaces,
  listPublisherStats,
  listRecentActivity,
  listRecentVnStockOffers,
  listSeriesForVnsMany,
  listShelfDisplaySlots,
  listShelfSlots,
  listVnsAtPlace,
  markReleaseOwned,
  markVnEgsOnly,
  materializeAspectForCollectionVns,
  materializeReleaseAspectsForVn,
  materializeReleaseMetaForCollectionVns,
  materializeReleaseMetaForVn,
  normalizeLegacyPhysicalLocationCsv,
  placeShelfDisplayItem,
  placeShelfItem,
  producerOwnershipSummary,
  renameShelf,
  replaceVnStockProviderSnapshot,
  removeRestoreTempFile,
  resizeShelf,
  restoreFromSqliteFile,
  searchLocalCharacters,
  searchLocalStaff,
  searchTextual,
  serializePhysicalLocations,
  setAppSetting,
  setCollectionCustomOrder,
  setAliceNetEgsLink,
  setOwnedReleaseAspectOverride,
  setQuotesForVn,
  setStockProviderExtras,
  setVnAspectOverride,
  todaysAnniversaries,
  updateCollection,
  updateGameLogEntry,
  updateOwnedRelease,
  updateUserList,
  updatePlace,
  updateRoute,
  updateSeries,
  upsertEgsForVn,
  upsertAliceNetStock,
  upsertProducer,
  upsertReleaseResolutionCache,
  upsertStockSource,
  upsertVn,
  type CollectionExportPayload,
  type RawVnPayload,
  type VnStockOfferInput,
} from '@/lib/db';
import { vndbReleaseFixture } from './fixtures/vndb-release';

getDbStatus();
const rawDb = new Database(process.env.DB_PATH!);

function wipe(): void {
  rawDb.exec(`
    DELETE FROM shelf_display_slot;
    DELETE FROM shelf_slot;
    DELETE FROM shelf_unit;
    DELETE FROM owned_release_aspect_override;
    DELETE FROM vn_aspect_override;
    DELETE FROM release_resolution_cache;
    DELETE FROM release_meta_cache;
    DELETE FROM owned_release;
    DELETE FROM vn_stock_offer;
    DELETE FROM vn_stock_provider_status;
    DELETE FROM vn_stock_alias;
    DELETE FROM vn_stock_source;
    DELETE FROM vn_title_resolve_cache;
    DELETE FROM alicenet_stock;
    DELETE FROM place_provider_link;
    DELETE FROM place_registry;
    DELETE FROM user_list_vn;
    DELETE FROM user_list;
    DELETE FROM reading_queue;
    DELETE FROM saved_filter;
    DELETE FROM steam_link;
    DELETE FROM vn_game_log;
    DELETE FROM vn_activity;
    DELETE FROM vn_quote;
    DELETE FROM character_image;
    DELETE FROM character_vn_index;
    DELETE FROM staff_credit_index;
    DELETE FROM vn_staff_credit;
    DELETE FROM vn_va_credit;
    DELETE FROM collection_place_index;
    DELETE FROM collection;
    DELETE FROM series_vn;
    DELETE FROM series;
    DELETE FROM producer;
    DELETE FROM egs_game;
    DELETE FROM vn_developer_index;
    DELETE FROM vn_publisher_index;
    DELETE FROM vn_tag_index;
    DELETE FROM vn_language_index;
    DELETE FROM vn_platform_index;
    DELETE FROM vndb_cache;
    DELETE FROM app_setting_audit;
    DELETE FROM app_setting;
    DELETE FROM vn;
  `);
  invalidateAggregateStats();
  invalidateProducerStats();
}

beforeAll(wipe);
beforeEach(wipe);
afterAll(() => rawDb.close());

function seedEgs(vnId: string, over: Partial<Parameters<typeof upsertEgsForVn>[0]> = {}): void {
  upsertEgsForVn({
    vn_id: vnId,
    egs_id: 910001,
    gamename: 'EGS fixture',
    gamename_furigana: null,
    brand_id: null,
    brand_name: null,
    model: null,
    description: null,
    image_url: null,
    okazu: null,
    erogame: null,
    raw_json: null,
    median: null,
    average: null,
    dispersion: null,
    count: null,
    sellday: null,
    playtime_median_minutes: null,
    source: 'manual',
    ...over,
  });
}

function insertStaff(vnId: string, sid: string, role: string, name: string, original: string | null = null): void {
  rawDb.prepare(`
    INSERT INTO vn_staff_credit (vn_id, sid, aid, eid, role, note, name, original, lang)
    VALUES (?, ?, 1, 1, ?, 'note', ?, ?, 'ja')
  `).run(vnId, sid, role, name, original);
}

function insertVa(vnId: string, sid: string, cid: string, cname: string, vaName: string, original: string | null = null): void {
  rawDb.prepare(`
    INSERT INTO vn_va_credit (vn_id, sid, aid, c_id, c_name, c_original, c_image_url, va_name, va_original, va_lang, note)
    VALUES (?, ?, 1, ?, ?, ?, NULL, ?, ?, 'ja', ?)
  `).run(vnId, sid, cid, cname, original, vaName, `${vaName} original`, `${sid}-${cid}`);
}

function stockOffer(over: Partial<VnStockOfferInput> = {}): VnStockOfferInput {
  return {
    vn_id: 'v910001',
    provider: 'surugaya',
    provider_offer_id: 'offer-1',
    source: 'direct',
    title: 'Stock offer',
    url: 'https://example.test/stock',
    price: 1000,
    currency: 'JPY',
    availability: 'in_stock',
    availability_label: null,
    condition: null,
    edition_label: null,
    location_label: null,
    location_branch: null,
    source_release_id: null,
    jan: null,
    fetched_at: Date.now(),
    error: null,
    content_kind: 'game_package',
    platform: null,
    edition_kind: null,
    series_relation: 'exact_game',
    match_confidence: 'exact',
    match_score: 1,
    match_warnings_json: null,
    marketplace_price: null,
    marketplace_count: null,
    list_price: null,
    category: null,
    store_code: null,
    product_id: null,
    page_kind: null,
    ...over,
  };
}

function erogeExtras(
  epId: number,
  prices: number[],
  selectedEpId: number | null = null,
  extraCandidates: Array<{ epId: number; prices: number[] }> = [],
): unknown {
  const candidate = (candidateEpId: number, candidatePrices: number[]) => ({
    epId: candidateEpId,
    gameUrl: `https://example.test/games/${candidateEpId}`,
    detail: {
      id: candidateEpId,
      title: 'Eroge Price fixture',
      downloadRetailers: candidatePrices.map((price, index) => ({
        retailerId: index + 1,
        retailerName: `Retailer ${index + 1}`,
        productUrl: `https://example.test/r/${index + 1}`,
        currentPrice: price,
      })),
      packageRetailers: [],
    },
    priceStats: {},
    priceHistory: [],
    related: {},
    fetchedAt: Date.now(),
  });
  return {
    schemaVersion: 1,
    selectedEpId,
    searchQuery: 'fixture',
    refreshedAt: Date.now(),
    candidates: [candidate(epId, prices), ...extraCandidates.map((entry) => candidate(entry.epId, entry.prices))],
  };
}

describe('db final coverage: exported boundary helpers', () => {
  it('validates SQL identifiers, legacy place CSV, and restore temp paths', async () => {
    expect(() => assertSqlIdent('valid_name_1', 'table')).not.toThrow();
    expect(() => assertSqlIdent('bad-name', 'column')).toThrow(/invalid SQL column identifier/);
    expect(normalizeLegacyPhysicalLocationCsv(' Shelf A, , Shelf B ')).toBe('["Shelf A","Shelf B"]');
    expect(normalizeLegacyPhysicalLocationCsv(' , ')).toBeNull();
    expect(() => assertRestoreTmpPath('/tmp/restore.db')).not.toThrow();
    expect(() => assertRestoreTmpPath('relative.db')).toThrow(/absolute/);
    expect(() => assertRestoreTmpPath(`/tmp/${'x'.repeat(1024)}`)).toThrow(/malformed/);
    expect(buildTextSearchSnippet('No matching text in this fixture', 'absent')).toBe('No matching text in this fixture');
    expect(buildTextSearchSnippet('needle at the start with short text', 'needle')).toBe('needle at the start with short text');
    expect(buildTextSearchSnippet(`${'a'.repeat(60)}needle${'b'.repeat(120)}`, 'needle')).toContain('…');
    await expect(removeRestoreTempFile('/tmp/vndb-collection-missing-restore-file.db')).resolves.toBeUndefined();
  });
});

describe('db final coverage: collection, activity, and logs', () => {
  it('covers lazy JSON assignment, CSV places, searched quotes, and orphan activity titles', () => {
    expect(typeof appDb.name).toBe('string');
    upsertVn({ id: 'v910001', title: 'Collection Fixture', has_anime: false });
    addToCollection('v910001', { dumped_ignored: false });
    markReleaseOwned('v910001', 'r910001', { physical_location: 'Shelf A, Shelf B', box_type: 'large' });
    expect(listKnownPlaces()).toEqual(['Shelf A', 'Shelf B']);

    const item = getCollectionItem('v910001');
    expect(item).not.toBeNull();
    item!.languages = ['ja'];
    expect(item!.languages).toEqual(['ja']);
    rawDb.prepare("UPDATE collection SET physical_location = 'Legacy A, Legacy B' WHERE vn_id = 'v910001'").run();
    expect(getCollectionItem('v910001')?.physical_location).toEqual(['Legacy A', 'Legacy B']);

    setQuotesForVn('v910001', [{ id: 'q910001', quote: 'literal_percent_%_quote', score: 10, character: null }]);
    expect(listAllQuotes('percent_%').map((q) => q.quote_id)).toEqual(['q910001']);

    addManualActivity('v910001', 'manual payload', 1000);
    rawDb.pragma('foreign_keys = OFF');
    try {
      rawDb.prepare("INSERT INTO vn_activity (vn_id, kind, payload, occurred_at) VALUES ('v999999', 'manual', NULL, 2000)").run();
    } finally {
      rawDb.pragma('foreign_keys = ON');
    }
    expect(listActivityForVn('v999999')[0].payload).toBeNull();
    expect(listRecentActivity(5).find((row) => row.vn_id === 'v999999')?.title).toBe('v999999');

    updateCollection('v999999', { status: 'completed' });
    expect(listRecentActivity(5).some((row) => row.kind === 'status')).toBe(false);
    setCollectionCustomOrder([]);
  });

  it('covers nullable game-log edits and empty-note validation', () => {
    upsertVn({ id: 'v910002', title: 'Log Fixture' });
    addToCollection('v910002');
    const entry = addGameLogEntry('v910002', 'Initial note', 1000, 12.4);
    expect(updateGameLogEntry('v910002', entry.id, { logged_at: 2000, session_minutes: 0 })).toMatchObject({
      note: 'Initial note',
      logged_at: 2000,
      session_minutes: null,
    });
    expect(updateGameLogEntry('v999999', entry.id, { note: 'Wrong VN' })).toBeNull();
    expect(() => updateGameLogEntry('v910002', entry.id, { note: '   ' })).toThrow(/empty note/);
  });

  it('covers source preference validation fallback and listCollection invalid limits', () => {
    upsertVn({ id: 'v910003', title: 'Invalid JSON Fixture' });
    addToCollection('v910003');
    rawDb.prepare("UPDATE collection SET source_pref = '[]' WHERE vn_id = 'v910003'").run();
    expect(getSourcePref('v910003')).toEqual({});
    expect(listCollection({ limit: Number.NaN, offset: Number.NaN }).map((row) => row.id)).toEqual(['v910003']);
    expect(serializePhysicalLocations(123)).toBeNull();
  });

  it('covers collection boolean converters and nullable activity payloads', () => {
    upsertVn({ id: 'v910004', title: 'Boolean Converter Fixture' });
    addToCollection('v910004', {
      favorite: true,
      dumped: true,
      dumped_ignored: true,
      user_rating: 70,
      started_date: '2024-01-01',
    });
    expect(listCollection({ dumped: true }).map((row) => row.id)).toEqual(['v910004']);
    updateCollection('v910004', {
      favorite: false,
      dumped: false,
      dumped_ignored: false,
      user_rating: null,
      started_date: null,
    });
    const item = getCollectionItem('v910004');
    expect(item).toMatchObject({ favorite: false, dumped: false, dumped_ignored: false, user_rating: null, started_date: null });
    expect(listCollection({ dumped: false }).map((row) => row.id)).toEqual(['v910004']);
  });
});

describe('db final coverage: VN payload indexes and local search', () => {
  it('covers optional staff fields and malformed local character payloads', () => {
    const payload: RawVnPayload = {
      id: 'v910010',
      title: 'Staff Payload Fixture',
      has_anime: true,
      tags: [
        { id: 'g910010', name: '', rating: 0, spoiler: 2, category: 'cont' },
        { id: 'g910011', name: 'ignored invalid id', rating: 0, spoiler: 0, category: 'cont' },
        { id: 'g910012', name: 'default spoiler', rating: 0, spoiler: 0, category: 'cont' },
      ],
      developers: [{ id: 'p910010', name: 'Developer Fixture' }, { id: 'p910011', name: 'Invalid Developer' }],
      staff: [{ id: 's910010', name: 'Staff Fixture' }],
      va: [{
        character: { id: 'c910010', name: 'Character Fixture' },
        staff: { id: 's910011', name: 'Voice Fixture' },
      }],
    };
    Reflect.set(payload.tags?.[1] ?? {}, 'id', 123);
    Reflect.set(payload.tags?.[2] ?? {}, 'spoiler', 'bad');
    Reflect.set(payload.developers?.[1] ?? {}, 'id', 123);
    upsertVn(payload);
    addToCollection('v910010');
    rawDb.prepare("INSERT INTO character_vn_index (character_id, vn_id) VALUES ('c910010', 'v910010')").run();
    rawDb.prepare(`
      INSERT INTO vndb_cache (cache_key, body, fetched_at, expires_at)
      VALUES ('char_full:c910010', '{"profile":{"id":""}}', 1, 999999999999)
    `).run();
    expect(searchLocalCharacters({ limit: 10 })).toEqual([]);
    expect(searchLocalStaff({ limit: 10 })[0].roles).toEqual([]);
    upsertVn({ id: 'v910015', title: 'Character No Voice Language' });
    addToCollection('v910015');
    rawDb.prepare("INSERT INTO character_vn_index (character_id, vn_id) VALUES ('c910015', 'v910015')").run();
    rawDb.prepare(`
      INSERT INTO vndb_cache (cache_key, body, fetched_at, expires_at)
      VALUES ('char_full:c910015', ?, 1, 999999999999)
    `).run(JSON.stringify({
      profile: {
        id: 'c910015',
        name: 'No Voice Lang',
        original: null,
        aliases: [],
        description: null,
        image: null,
        blood_type: null,
        height: null,
        weight: null,
        bust: null,
        waist: null,
        hips: null,
        cup: null,
        age: null,
        birthday: null,
        sex: null,
        gender: null,
        vns: [],
        traits: [],
      },
    }));
    expect(searchLocalCharacters({ q: 'No Voice', limit: 10 })[0]?.voice_languages).toEqual([]);
  });

  it('dedupes character and staff sibling VN rows', () => {
    upsertVn({ id: 'v910011', title: 'Sibling A' });
    upsertVn({ id: 'v910012', title: 'Sibling B' });
    upsertVn({ id: 'v910016', title: 'Timeline Same Year A', released: '2020-01-01' });
    upsertVn({ id: 'v910017', title: 'Timeline Same Year B', released: '2020-12-31' });
    addToCollection('v910011');
    addToCollection('v910012');
    addToCollection('v910016');
    addToCollection('v910017');
    insertVa('v910011', 's910020', 'c910020', 'Shared Character', 'Voice A', 'Shared Original');
    insertVa('v910012', 's910021', 'c910021', 'Shared Character', 'Voice B', 'Shared Original');
    insertVa('v910012', 's910022', 'c910021', 'Shared Character', 'Voice C', 'Shared Original');
    insertVa('v910016', 's910023', 'c910023', 'Timeline A', 'Timeline Voice');
    insertVa('v910017', 's910023', 'c910024', 'Timeline B', 'Timeline Voice');
    expect(getVaTimeline('s910023')[0]).toMatchObject({ year: 2020, total: 2, inCollection: 2 });
    expect(findCharacterSiblings('c910020')[0].vns).toEqual([{ vn_id: 'v910012', vn_title: 'Sibling B' }]);

    insertStaff('v910011', 's910030', 'scenario', 'Shared Staff', 'Shared Staff Original');
    insertStaff('v910012', 's910031', 'scenario', 'Shared Staff', 'Shared Staff Original');
    insertStaff('v910012', 's910031', 'art', 'Shared Staff', 'Shared Staff Original');
    insertStaff('v910012', 's910031', 'music', 'Shared Staff Original');
    expect(findStaffSiblings('s910030')[0].vns).toEqual([{ vn_id: 'v910012', vn_title: 'Sibling B' }]);
  });

  it('covers batched fallback name lookups with duplicate fallback rows', () => {
    upsertVn({ id: 'v910013', title: 'Name A', developers: [{ id: 'p910013', name: 'Developer Fallback' }] });
    upsertVn({ id: 'v910014', title: 'Name B', developers: [{ id: 'p910013', name: 'Developer Fallback' }] });
    expect(batchGetProducerNames(['p910013']).get('p910013')).toBe('Developer Fallback');
    upsertVn({ id: 'v910018', title: 'Empty Producer Name', developers: [{ id: 'p910018', name: 'Producer To Blank' }] });
    rawDb.prepare("UPDATE vn SET developers = '[{\"id\":\"p910018\",\"name\":\"\"}]' WHERE id = 'v910018'").run();
    expect(batchGetProducerNames(['p910018']).has('p910018')).toBe(false);

    insertVa('v910013', 's910040', 'c910040', 'Character A', 'VA Fallback');
    insertVa('v910014', 's910040', 'c910041', 'Character B', 'VA Fallback');
    rawDb.prepare(`
      INSERT INTO vn_va_credit (vn_id, sid, aid, c_id, c_name, c_original, c_image_url, va_name, va_original, va_lang, note)
      VALUES ('v910014', 's910041', 1, 'c910042', 'Character C', NULL, NULL, '', NULL, 'ja', 'empty')
    `).run();
    expect(batchGetStaffNames(['s910040']).get('s910040')).toBe('VA Fallback');
    expect(batchGetStaffNames(['s910041']).has('s910041')).toBe(false);
    expect(batchGetCharNames(['c910040']).get('c910040')).toBe('Character A');
  });
});

describe('db final coverage: routes, shelves, and aspects', () => {
  it('covers route auto-date branches and no-op route updates', () => {
    upsertVn({ id: 'v910020', title: 'Route Fixture' });
    const route = createRoute('v910020', 'Route A');
    expect(updateRoute(route.id, { completed: true })?.completed).toBe(true);
    expect(updateRoute(route.id, { completed: false })?.completed_date).toBeNull();
    expect(updateRoute(route.id, {})?.id).toBe(route.id);
    expect(updateRoute(999999, { name: 'missing' })).toBeNull();
  });

  it('covers shelf validation, no-op placement, display placement, and null box fallbacks', () => {
    expect(() => createShelf({ name: '   ' })).toThrow(/shelf name/);
    const shelf = createShelf({ name: 'Shelf Fixture', cols: Number.POSITIVE_INFINITY, rows: Number.NEGATIVE_INFINITY });
    expect(shelf.cols).toBe(8);
    expect(shelf.rows).toBe(4);
    expect(() => renameShelf(shelf.id, ' ')).toThrow(/shelf name/);
    expect(renameShelf(999999, 'Missing')).toBeNull();
    expect(resizeShelf(999999, 1, 1)).toBeNull();

    upsertVn({ id: 'v910021', title: 'Shelf A' });
    upsertVn({ id: 'v910022', title: 'Shelf B' });
    markReleaseOwned('v910021', 'r910021');
    markReleaseOwned('v910022', 'r910022');
    expect(() => placeShelfItem({ shelfId: 1.5, row: 0, col: 0, vnId: 'v910021', releaseId: 'r910021' })).toThrow(/shelf id/);
    expect(() => placeShelfItem({ shelfId: 999999, row: 0, col: 0, vnId: 'v910021', releaseId: 'r910021' })).toThrow(/shelf not found/);
    expect(() => placeShelfItem({ shelfId: shelf.id, row: 0, col: 0, vnId: 'v910021', releaseId: 'r999999' })).toThrow(/owned edition/);
    placeShelfItem({ shelfId: shelf.id, row: 0, col: 0, vnId: 'v910021', releaseId: 'r910021' });
    expect(placeShelfItem({ shelfId: shelf.id, row: 0, col: 0, vnId: 'v910021', releaseId: 'r910021' })).toEqual({ swapped: null });
    expect(listShelfSlots(shelf.id)[0].box_type).toBe('none');

    expect(() => placeShelfDisplayItem({ shelfId: 1.5, afterRow: 0, position: 0, vnId: 'v910022', releaseId: 'r910022' })).toThrow(/shelf id/);
    expect(() => placeShelfDisplayItem({ shelfId: shelf.id, afterRow: 0.5, position: 0, vnId: 'v910022', releaseId: 'r910022' })).toThrow(/integers/);
    expect(() => placeShelfDisplayItem({ shelfId: 999999, afterRow: 0, position: 0, vnId: 'v910022', releaseId: 'r910022' })).toThrow(/shelf not found/);
    expect(() => placeShelfDisplayItem({ shelfId: shelf.id, afterRow: 9, position: 0, vnId: 'v910022', releaseId: 'r910022' })).toThrow(/after_row/);
    expect(() => placeShelfDisplayItem({ shelfId: shelf.id, afterRow: 0, position: 9, vnId: 'v910022', releaseId: 'r910022' })).toThrow(/position/);
    expect(() => placeShelfDisplayItem({ shelfId: shelf.id, afterRow: 0, position: 0, vnId: 'v910022', releaseId: 'missing' })).toThrow(/owned edition/);
    placeShelfDisplayItem({ shelfId: shelf.id, afterRow: 1, position: 0, vnId: 'v910022', releaseId: 'r910022' });
    expect(listShelfDisplaySlots(shelf.id)[0].box_type).toBe('none');
    expect(listOwnedReleasesWithShelfForVn('v910021')[0].shelf?.kind).toBe('cell');
    expect(listOwnedReleasesWithShelfForVn('v910022')[0].shelf?.kind).toBe('display');
  });

  it('covers aspect cache skips, screenshot invalid rows, and release metadata fallbacks', () => {
    expect(() => materializeReleaseAspectsForVn('egs_910001')).not.toThrow();
    expect(() => materializeAspectForCollectionVns([])).not.toThrow();
    upsertVn({ id: 'v910030', title: 'Aspect Invalid', screenshots: [{ url: 'https://example.test/a.jpg', thumbnail: 'https://example.test/a-thumb.jpg', sexual: 0, violence: 0, dims: [0, 0] }] });
    upsertVn({ id: 'v910031', title: 'Aspect Valid', screenshots: [{ url: 'https://example.test/b.jpg', thumbnail: 'https://example.test/b-thumb.jpg', sexual: 0, violence: 0, dims: [1920, 1080] }] });
    upsertVn({
      id: 'v910033',
      title: 'Aspect Missing Dims',
      screenshots: [
        { url: 'https://example.test/c.jpg', thumbnail: 'https://example.test/c-thumb.jpg' },
        { url: 'https://example.test/d.jpg', thumbnail: 'https://example.test/d-thumb.jpg', dims: [1, 1] },
      ],
    });
    materializeAspectForCollectionVns(['v910030', 'v910031', 'v910033']);
    expect(deriveVnAspectKey('v910030')).toBe('unknown');
    expect(deriveVnAspectDisplay('v910031')).toMatchObject({ aspect: '16:9', source: 'screenshot' });
    expect(deriveVnAspectKey('v910033')).toBe('other');

    rawDb.prepare(`
      INSERT INTO release_resolution_cache (release_id, vn_id, width, height, raw_resolution, aspect_key, fetched_at)
      VALUES ('r910031', 'v910031', NULL, NULL, NULL, 'bogus', 1)
    `).run();
    expect(deriveVnAspectDisplay('v910999')).toMatchObject({ aspect: 'unknown' });
    rawDb.prepare(`
      INSERT INTO release_resolution_cache (release_id, vn_id, width, height, raw_resolution, aspect_key, fetched_at)
      VALUES ('r910042', 'v910030', 800, 600, NULL, '4:3', 1)
    `).run();
    expect(deriveVnAspectKey('v910030')).toBe('4:3');
    expect(() => materializeReleaseAspectsForVn('v910030')).not.toThrow();
    expect(deriveVnAspectDisplay('v910031')).toMatchObject({ aspect: '16:9' });

    upsertVn({ id: 'v910035', title: 'Malformed Release Cache Fresh VN' });
    rawDb.prepare(`
      INSERT INTO vndb_cache (cache_key, body, fetched_at, expires_at)
      VALUES ('POST /release|broken-aspect-fresh', '{', 1, 999999999999)
    `).run();
    expect(() => materializeReleaseAspectsForVn('v910035')).not.toThrow();
    upsertVn({ id: 'v910038', title: 'Release Memo Cap Fixture' });
    const insertReleaseCache = rawDb.prepare(`
      INSERT INTO vndb_cache (cache_key, body, fetched_at, expires_at)
      VALUES (?, ?, 1, 999999999999)
    `);
    const fillReleaseMemo = rawDb.transaction(() => {
      for (let index = 0; index < 4097; index += 1) {
        insertReleaseCache.run(
          `POST /release|memo-cap-${index}`,
          JSON.stringify({ results: [vndbReleaseFixture({ id: `r92${String(index).padStart(5, '0')}`, vns: [{ id: 'v999999' }] })] }),
        );
      }
    });
    fillReleaseMemo();
    expect(() => materializeReleaseAspectsForVn('v910038')).not.toThrow();

    upsertVn({ id: 'v910034', title: 'Manual Aspect Fixture' });
    addToCollection('v910034');
    markReleaseOwned('v910034', 'r910034');
    setOwnedReleaseAspectOverride({ vnId: 'v910034', releaseId: 'r910034', aspectKey: '16:9' });
    rawDb.prepare(`
      INSERT INTO release_resolution_cache (release_id, vn_id, width, height, raw_resolution, aspect_key, fetched_at)
      VALUES ('r910034', 'v910034', 1024, 768, NULL, '4:3', 1)
    `).run();
    setVnAspectOverride({ vnId: 'v910034', aspectKey: '4:3' });
    materializeAspectForCollectionVns(['v910034']);
    expect(listCollection({ aspect: '4:3' }).map((row) => row.id)).toContain('v910034');

    upsertVn({ id: 'v910036', title: 'Owned Cache Aspect Fixture' });
    addToCollection('v910036');
    markReleaseOwned('v910036', 'r910036');
    rawDb.prepare(`
      INSERT INTO release_resolution_cache (release_id, vn_id, width, height, raw_resolution, aspect_key, fetched_at)
      VALUES ('r910036', NULL, 1280, 800, NULL, '16:10', 1)
    `).run();
    expect(deriveVnAspectKey('v910036')).toBe('16:10');
    expect(deriveVnAspectDisplay('v910036')).toMatchObject({ aspect: '16:10', source: 'release' });
    expect(listOwnedReleasesWithShelfForVn('v910036')[0].aspect).toMatchObject({ aspect_key: '16:10', source: 'vndb' });

    upsertVn({ id: 'v910037', title: 'Direct Screenshot Aspect Fixture', screenshots: [{ url: 'https://example.test/e.jpg', thumbnail: 'https://example.test/e-thumb.jpg', dims: [1920, 1080] }] });
    expect(deriveVnAspectKey('v910037')).toBe('16:9');
    upsertVn({
      id: 'v910039',
      title: 'Direct Screenshot Missing Dims Fixture',
      screenshots: [
        { url: 'https://example.test/f.jpg', thumbnail: 'https://example.test/f-thumb.jpg' },
        { url: 'https://example.test/g.jpg', thumbnail: 'https://example.test/g-thumb.jpg', dims: [1280, 720] },
      ],
    });
    expect(deriveVnAspectKey('v910039')).toBe('16:9');

    rawDb.prepare(`
      INSERT INTO release_meta_cache (release_id, vn_id, title, platforms, languages, patch, freeware, uncensored, official, has_ero, fetched_at)
      VALUES ('r910040', 'v910030', NULL, '["win"]', '[{"lang":"ja","title":null,"latin":null}]', 0, 0, NULL, 1, 0, 1)
    `).run();
    expect(getReleaseMeta('r910040')).toMatchObject({ title: null, platforms: ['win'], uncensored: null });
    expect(getReleaseMeta('missing')).toBeNull();

    upsertReleaseResolutionCache({ releaseId: 'r910041', vnId: 'v910030', resolution: { raw: 'object' } });
    expect(rawDb.prepare("SELECT raw_resolution FROM release_resolution_cache WHERE release_id = 'r910041'").get()).toEqual({ raw_resolution: '{"raw":"object"}' });
    setVnAspectOverride({ vnId: 'v910030', aspectKey: 'unknown' });
    addToCollection('v910030');
    rawDb.prepare(`
      INSERT INTO vn_aspect_override (vn_id, aspect_key, note, updated_at)
      VALUES ('v910030', 'bogus', NULL, 1)
    `).run();
    expect(listCollection({}).find((row) => row.id === 'v910030')?.aspect_keys).toEqual(['4:3']);
    upsertVn({ id: 'v910044', title: 'Invalid Only Aspect Cache' });
    rawDb.prepare(`
      INSERT INTO release_resolution_cache (release_id, vn_id, width, height, raw_resolution, aspect_key, fetched_at)
      VALUES ('r910044', 'v910044', 100, 100, NULL, 'bogus', 1)
    `).run();
    expect(deriveVnAspectDisplay('v910044')).toMatchObject({ aspect: 'unknown', source: 'unknown' });

    rawDb.prepare(`
      INSERT INTO vndb_cache (cache_key, body, fetched_at, expires_at)
      VALUES ('POST /release|broken-aspect', '{', 1, 999999999999)
    `).run();
    expect(() => materializeReleaseAspectsForVn('v910033')).not.toThrow();
    expect(() => materializeReleaseMetaForVn('v910033')).not.toThrow();
    expect(materializeReleaseMetaForCollectionVns(['v910033'])).toBe(0);
  });

  it('materializes release metadata from cached payloads and skips malformed entries', () => {
    upsertVn({ id: 'v910032', title: 'Release Meta VN' });
    markReleaseOwned('v910032', 'r910032');
    rawDb.prepare(`
      INSERT INTO vndb_cache (cache_key, body, fetched_at, expires_at)
      VALUES (?, ?, 10, 999999999999), (?, ?, 11, 999999999999)
    `).run(
      'POST /release|valid-meta',
      JSON.stringify({ results: [{
        ...vndbReleaseFixture({
        id: 'r910032',
        vns: [{ id: 'v910032' }],
        platforms: ['win'],
        resolution: [800, 600],
        }),
        patch: true,
        freeware: true,
        uncensored: false,
        official: false,
        has_ero: true,
      }] }),
      'POST /release|bad-meta',
      JSON.stringify({ results: [{ id: 'bad' }] }),
    );
    markReleaseOwned('v910032', 'r910033');
    rawDb.prepare(`
      INSERT INTO vndb_cache (cache_key, body, fetched_at, expires_at)
      VALUES (?, ?, 12, 999999999999)
    `).run(
      'POST /release|valid-meta-strings',
      JSON.stringify({ results: [{
        ...vndbReleaseFixture({
          id: 'r910033',
          vns: [{ id: 'v910032' }],
          platforms: ['win'],
          resolution: [1024, 768],
          languages: [{ lang: 'ja', title: 'Release Title', latin: 'Release Latin' }],
        }),
        uncensored: true,
      }] }),
    );
    materializeReleaseMetaForVn('v910032');
    expect(getReleaseMeta('r910032')).toMatchObject({ patch: true, freeware: true, uncensored: false, official: false, has_ero: true });
    expect(getReleaseMeta('r910033')).toMatchObject({ uncensored: true });
    expect(markReleaseOwned('v910032', 'r910032')).toBeUndefined();
    expect(listOwnedReleasesWithShelfForVn('v910032')[0].owned_platform).toBe('win');
    expect(materializeReleaseMetaForCollectionVns(['v910032'])).toBeGreaterThan(0);
    expect(materializeReleaseMetaForCollectionVns([])).toBe(0);
  });
});

describe('db final coverage: places, producer stats, lists, search, and stock', () => {
  it('covers place defaults, empty updates, and availability filters', () => {
    const place = createPlace({ name: 'Place Fixture' });
    expect(getPlace(place)).toMatchObject({ kind: 'shop' });
    updatePlace(place, {});
    expect(listPlaces()[0].kind).toBe('shop');

    upsertVn({ id: 'v910040', title: 'Place Stock' });
    rawDb.prepare('INSERT INTO place_provider_link (place_id, provider_label) VALUES (?, ?)').run(place, 'Branch A');
    replaceVnStockProviderSnapshot('v910040', 'surugaya', [
      stockOffer({ vn_id: 'v910040', provider_offer_id: 'in', location_branch: 'Branch A', availability: 'in_stock', price: 1200 }),
      stockOffer({ vn_id: 'v910040', provider_offer_id: 'out', location_branch: 'Branch A', availability: 'out_of_stock', price: 800 }),
    ], { status: 'ok', message: null, fetched_at: Date.now(), offer_count: 2 });
    expect(listVnsAtPlace(place, 'all')).toHaveLength(1);
    expect(listOffersAtPlace(place, 'out_of_stock')[0].availability).toBe('out_of_stock');
  });

  it('covers stats caches and publisher fallbacks', () => {
    expect(getAggregateStats().egs).toMatchObject({ matched: 0, unmatched: 0, sum_playtime_minutes: 0 });
    expect(producerOwnershipSummary('p910000')).toMatchObject({ sample: null });
    upsertVn({
      id: 'v910041',
      title: 'Producer Fixture',
      developers: [{ id: 'p910041', name: 'Developer Fixture' }],
      rating: 80,
      tags: [{ id: 'g910041', name: 'tag fixture', rating: 2, spoiler: 0, category: 'cont' }],
    });
    addToCollection('v910041', { user_rating: 80, playtime_minutes: 120, finished_date: '2020-01-01' });
    rawDb.prepare("INSERT INTO vn_publisher_index (vn_id, producer_id) VALUES ('v910041', 'p910042')").run();
    rawDb.prepare("UPDATE vn SET publishers = '[{\"id\":\"p910042\",\"name\":\"Publisher Fallback\"}]' WHERE id = 'v910041'").run();
    seedEgs('v910041', { okazu: 1, erogame: 0, median: 70, playtime_median_minutes: 90 });
    upsertVn({ id: 'v910042', title: 'EGS Boolean Fixture' });
    addToCollection('v910042');
    seedEgs('v910042', { egs_id: 910042, okazu: 0, erogame: null });
    upsertVn({ id: 'v910043', title: 'EGS Null Fixture' });
    addToCollection('v910043');
    seedEgs('v910043', { egs_id: 910043, okazu: null, erogame: 1 });
    expect(listCollection({}).find((row) => row.id === 'v910041')?.egs).toMatchObject({ okazu: true, erogame: false });
    expect(listCollection({}).find((row) => row.id === 'v910042')?.egs).toMatchObject({ okazu: false, erogame: null });
    expect(listCollection({}).find((row) => row.id === 'v910043')?.egs).toMatchObject({ okazu: null, erogame: true });
    expect(getAggregateStats().egs).toMatchObject({ matched: 3, unmatched: 0 });
    expect(getAggregateStats().egs).toMatchObject({ matched: 3 });
    expect(listPublisherStats()[0].name).toBe('Publisher Fallback');
    expect(listPublisherStats()[0].name).toBe('Publisher Fallback');
    markVnEgsOnly('v910042', true);
    expect(rawDb.prepare("SELECT egs_only FROM vn WHERE id = 'v910042'").get()).toEqual({ egs_only: 1 });
    markVnEgsOnly('v910042', false);
    expect(rawDb.prepare("SELECT egs_only FROM vn WHERE id = 'v910042'").get()).toEqual({ egs_only: 0 });
  });

  it('covers series mapping, user list slug updates, and text/maintenance branches', () => {
    upsertVn({ id: 'v910050', title: 'Duplicate Long Title' });
    upsertVn({ id: 'v910051', title: 'Duplicate Long Title!' });
    upsertVn({ id: 'v910052', title: 'abc', released: 'xxxx-06-06' });
    addToCollection('v910050', { notes: 'Textual note fixture' });
    addToCollection('v910051');
    addToCollection('v910052');
    const series = createSeries('Series Fixture');
    addVnToSeries(series.id, 'v910050', 0);
    addVnToSeries(series.id, 'v910051', 1);
    expect(listSeriesForVnsMany(['v910050', 'v910051']).get('v910050')).toEqual([{ id: series.id, name: 'Series Fixture' }]);
    expect(listCollection({ series: series.id }).map((row) => row.id).sort()).toEqual(['v910050', 'v910051']);
    expect(updateSeries(series.id, {})?.id).toBe(series.id);
    expect(updateSeries(series.id, { banner_path: null })?.banner_path).toBeNull();

    const list = createUserList({ name: 'List Fixture' });
    expect(updateUserList(list.id, { name: 'List Fixture Renamed', pinned: true })?.slug).toBe('list-fixture-renamed');
    expect(updateUserList(list.id, { name: 'List Fixture Renamed', pinned: false })?.pinned).toBe(0);
    expect(updateUserList(list.id, { description: 'Description only' })?.description).toBe('Description only');
    expect(updateUserList(999999, { pinned: true })).toBeNull();

    expect(findDuplicates()[0].ids.sort()).toEqual(['v910050', 'v910051']);
    expect(todaysAnniversaries(new Date('2026-06-06T00:00:00Z'))).toEqual([]);
    expect(searchTextual('note')[0].source).toBe('notes');
    expect(searchTextual('x')).toEqual([]);
    expect(getCacheFreshness([])).toBeNull();
    expect(getCacheFreshness(['missing:%'])).toBeNull();
    expect(getSteamLinkByAppid(999999)).toBeNull();

    upsertVn({ id: 'v910053', title: 'Dump Sort A' });
    upsertVn({ id: 'v910054', title: 'Dump Sort B' });
    upsertVn({ id: 'v910055', title: 'Dump Partial' });
    upsertVn({ id: 'v910056', title: 'Dump Done' });
    addToCollection('v910053');
    addToCollection('v910054');
    addToCollection('v910055');
    addToCollection('v910056');
    markReleaseOwned('v910055', 'r910055-a', { dumped: true });
    markReleaseOwned('v910055', 'r910055-b', { dumped: false });
    markReleaseOwned('v910056', 'r910056', { dumped: true });
    expect(listDumpStatus().filter((row) => row.vn_id === 'v910053' || row.vn_id === 'v910054').map((row) => row.vn_title)).toEqual(['Dump Sort A', 'Dump Sort B']);
    expect(listDumpStatus().filter((row) => row.vn_id === 'v910055' || row.vn_id === 'v910056').map((row) => row.vn_title)).toEqual(['Dump Partial', 'Dump Done']);
  });

  it('covers AliceNet empty counters, stock extras fallback, and recent stock rows without VN joins', () => {
    expect(countAliceNetStock()).toMatchObject({
      total: 0,
      matched: 0,
      vndb_matched: 0,
      egs_only: 0,
      unprocessed: 0,
      none_found: 0,
      in_collection: 0,
    });
    expect(countAliceNetDownloadPending()).toEqual({ vndb_pending: 0, egs_pending: 0 });

    upsertVn({ id: 'v910060', title: 'Extras Fixture' });
    expect(setStockProviderExtras('v910060', 'eroge_price', erogeExtras(910060, [0, 3400, 2200]))).toBe(true);
    expect(batchVnStockSummaries(['v910060']).get('v910060')).toEqual({ available: 2, best_price: 2200 });
    upsertVn({ id: 'v910061', title: 'Selected Extras Fixture' });
    expect(setStockProviderExtras('v910061', 'eroge_price', erogeExtras(910061, [1800], 910061))).toBe(true);
    expect(batchVnStockSummaries(['v910061']).get('v910061')).toEqual({ available: 1, best_price: 1800 });
    upsertVn({ id: 'v910062', title: 'Stale Selected Extras Fixture' });
    expect(setStockProviderExtras('v910062', 'eroge_price', erogeExtras(910062, [2400], 999999))).toBe(true);
    expect(batchVnStockSummaries(['v910062']).get('v910062')).toEqual({ available: 1, best_price: 2400 });
    upsertVn({ id: 'v910063', title: 'Second Candidate Extras Fixture' });
    expect(setStockProviderExtras('v910063', 'eroge_price', erogeExtras(910063, [3000], 910064, [{ epId: 910064, prices: [1600] }]))).toBe(true);
    expect(batchVnStockSummaries(['v910063']).get('v910063')).toEqual({ available: 1, best_price: 1600 });
    upsertVn({ id: 'v910064', title: 'Zero Price Extras Fixture' });
    expect(setStockProviderExtras('v910064', 'eroge_price', erogeExtras(910064, [0], 910064))).toBe(true);
    expect(batchVnStockSummaries(['v910064']).has('v910064')).toBe(false);
    expect(setStockProviderExtras('v910060', 'bad_provider', erogeExtras(910060, [1000]))).toBe(false);
    const circular: { self?: unknown } = {};
    circular.self = circular;
    expect(setStockProviderExtras('v910060', 'eroge_price', circular)).toBe(false);

    replaceVnStockProviderSnapshot('v999999', 'surugaya', [stockOffer({ vn_id: 'v999999', provider_offer_id: 'orphan' })], {
      status: 'ok',
      message: null,
      fetched_at: Date.now(),
      offer_count: 1,
    });
    expect(listRecentVnStockOffers(5).find((row) => row.vn_id === 'v999999')?.vn_title).toBeNull();
    expect(upsertStockSource({ vn_id: 'v910060', provider: 'surugaya', url: 'https://example.test/source', release_id: null }).product_id).toBeNull();
    upsertAliceNetStock([{ code: '111-000001-001', title: 'AliceNet Fixture', jan: null, release_date: null, list_price: null, sale_price: null }]);
    setAliceNetEgsLink('111-000001-001', 910061, 'manual', {});
    expect(rawDb.prepare("SELECT egs_title FROM alicenet_stock WHERE code = '111-000001-001'").get()).toEqual({ egs_title: null });
    rawDb.exec(`
      CREATE TRIGGER stock_source_move_after_insert
      AFTER INSERT ON vn_stock_source
      BEGIN
        UPDATE vn_stock_source SET url = NEW.url || '-moved' WHERE rowid = NEW.rowid;
      END;
    `);
    try {
      expect(() => upsertStockSource({ vn_id: 'v910060', provider: 'surugaya', url: 'https://example.test/source-fail', release_id: null })).toThrow(/stock source upsert failed/);
    } finally {
      rawDb.exec('DROP TRIGGER stock_source_move_after_insert');
    }
  });
});

describe('db final coverage: import and restore edge cases', () => {
  it('imports sparse payloads and records collection / series soft errors', () => {
    const sparse: Partial<CollectionExportPayload> = { version: 2, exported_at: 1 };
    expect(importData(sparse)).toEqual({
      vns_upserted: 0,
      collection_upserted: 0,
      series_created: 0,
      series_links: 0,
      errors: [],
    });

    const payload: CollectionExportPayload = {
      version: 2,
      exported_at: 1,
      vns: [{ id: 'v910070', title: '', raw: { title: 'Raw Import Title' }, fetched_at: 1 }],
      collection: [{ vn_id: 'v999998', status: 'planning', user_rating: null, playtime_minutes: 0, started_date: null, finished_date: null, notes: null, favorite: 0, location: 'unknown', edition_type: 'none', edition_label: null, physical_location: null, added_at: 1, updated_at: 1 }],
      series: [{ id: 1, name: 'Import Series', description: null, cover_path: null, banner_path: null, created_at: 1, updated_at: 1 }],
      series_vn: [{ series_id: 2, vn_id: 'v910070', order_index: 0 }, { series_id: 1, vn_id: 'v999997', order_index: 0 }],
    };
    const summary = importData(payload);
    expect(summary.vns_upserted).toBe(1);
    expect(summary.series_created).toBe(1);
    expect(summary.errors).toEqual(expect.arrayContaining([
      'collection v999998: import failed',
      'series_vn 1/v999997: import failed',
    ]));

    upsertVn({ id: 'v910071', title: 'Existing Import VN' });
    addToCollection('v910071');
    const fallbackPayload: CollectionExportPayload = {
      version: 2,
      exported_at: 2,
      vns: [
        { id: 'v910071', title: null, raw: { title: 'Updated From Raw' } },
        { id: 'v910072', title: 'Inserted Import VN', raw: {} },
        { id: 'v910073', title: null, raw: {} },
        { id: 'v910074', title: 'Inserted Without Raw' },
      ],
      collection: [
        {
          vn_id: 'v910071',
          status: 'playing',
          user_rating: null,
          playtime_minutes: null,
          started_date: null,
          finished_date: null,
          notes: null,
          favorite: true,
          location: null,
          edition_type: null,
          edition_label: null,
          physical_location: null,
        },
        {
          vn_id: 'v910072',
          status: 'planning',
          user_rating: null,
          started_date: null,
          finished_date: null,
          notes: null,
          favorite: true,
          edition_label: null,
          physical_location: null,
        },
        {
          vn_id: 'v910074',
          status: 'planning',
          user_rating: null,
          started_date: null,
          finished_date: null,
          notes: null,
          favorite: false,
          edition_label: null,
          physical_location: null,
        },
      ],
      series: [
        { id: 4, name: 'Import Series Four', description: null, cover_path: null, banner_path: null, created_at: 1, updated_at: 1 },
        { id: 2, name: 'Import Series Two', description: null, cover_path: null, banner_path: null, created_at: 1, updated_at: 1 },
        { id: 3, name: '', description: null, cover_path: null, banner_path: null, created_at: 1, updated_at: 1 },
      ],
      series_vn: [
        { series_id: 2, vn_id: 'v910072' },
        { series_id: 4, vn_id: 'v910074' },
        { series_id: 4, vn_id: 'v910072', order_index: 7 },
      ],
    };
    rawDb.exec(`
      CREATE TRIGGER import_vn_fail_before_insert
      BEFORE INSERT ON vn
      WHEN NEW.id = 'v910073'
      BEGIN
        SELECT RAISE(FAIL, 'forced vn import failure');
      END;
      CREATE TRIGGER import_series_fail_before_insert
      BEFORE INSERT ON series
      WHEN NEW.name = 'Import Series Two'
      BEGIN
        SELECT RAISE(FAIL, 'forced series import failure');
      END;
    `);
    let fallbackSummary;
    try {
      fallbackSummary = importData(fallbackPayload);
    } finally {
      rawDb.exec(`
        DROP TRIGGER import_vn_fail_before_insert;
        DROP TRIGGER import_series_fail_before_insert;
      `);
    }
    expect(fallbackSummary.collection_upserted).toBe(3);
    expect(fallbackSummary.series_links).toBe(2);
    expect(fallbackSummary.errors).toEqual(expect.arrayContaining([
      'vn v910073: import failed',
      'series Import Series Two: import failed',
    ]));
    expect(getCollectionItem('v910071')).toMatchObject({ playtime_minutes: 0, location: 'unknown', edition_type: 'none' });
    expect(getCollectionItem('v910072')).toMatchObject({ playtime_minutes: 0, location: 'unknown', edition_type: 'none' });
  });

  it('rolls back SQLite restores that violate target constraints', async () => {
    upsertVn({ id: 'v910080', title: 'Before Restore' });
    const dir = await mkdtemp(join(tmpdir(), 'vndb-restore-fail-'));
    const backupPath = join(dir, 'bad.db');
    const source = new Database(backupPath);
    try {
      source.exec(`
        CREATE TABLE vn (id TEXT, title TEXT, fetched_at INTEGER);
        INSERT INTO vn (id, title, fetched_at) VALUES ('v910081', NULL, 1);
      `);
      source.close();
      appDb.pragma('foreign_keys = OFF');
      await expect(restoreFromSqliteFile(await readFile(backupPath))).rejects.toThrow(/NOT NULL/);
      expect(rawDb.prepare("SELECT title FROM vn WHERE id = 'v910080'").get()).toEqual({ title: 'Before Restore' });
    } finally {
      appDb.pragma('foreign_keys = ON');
      if (source.open) source.close();
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('masks audited setting URL fallbacks and clears empty values', () => {
    setAppSetting('vndb_backup_url', 'file:///tmp/backup.db');
    expect(rawDb.prepare("SELECT next_preview FROM app_setting_audit WHERE key = 'vndb_backup_url' ORDER BY id DESC LIMIT 1").get()).toEqual({ next_preview: '…p.db' });
    setAppSetting('vndb_backup_url', 'not a url but secret');
    setAppSetting('vndb_backup_url', '');
    expect(getAppSetting('vndb_backup_url')).toBeNull();
    const status = getDbStatus();
    expect(status.vndb_token).toBe('none');
    expect(status.cache_total).toBeGreaterThanOrEqual(0);
  });
});
