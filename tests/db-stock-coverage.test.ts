/**
 * Coverage for the AliceNet stock paging / matching cluster and the
 * generic per-VN stock offer/provider-status surface in `src/lib/db.ts`,
 * plus stock aliases, user-pinned stock sources, the title-resolution
 * cache, and the place-registry queries.
 *
 * Hermetic: seeds through the real exported writers
 * (`upsertAliceNetStock`, `setAliceNetVnLink`, `replaceVnStockProviderSnapshot`,
 * `createPlace`, …) against the per-worker temp SQLite from
 * `tests/setup.ts`. No network. Synthetic ids only.
 */
import Database from 'better-sqlite3';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  addToCollection,
  batchVnStockSummaries,
  clearAliceNetVnLink,
  clearVnStockCache,
  countAliceNetDownloadPending,
  countAliceNetNoVndbNoEgs,
  countAliceNetNoVndbResult,
  countAliceNetNoVndbWithEgs,
  countAliceNetStock,
  countAliceNetStockTotal,
  countAliceNetUnmatchedQueue,
  createPlace,
  deletePlace,
  deleteStockAlias,
  deleteStockSource,
  getAliceNetStockItem,
  getCachedTitleResolution,
  getPlace,
  getPlaceProviderMap,
  linkProviderToPlace,
  listAliceNetMatchedVnIds,
  listAliceNetNoVndbNoEgs,
  listAliceNetNoVndbResult,
  listAliceNetNoVndbWithEgs,
  listAliceNetStockForVn,
  listAliceNetStockPage,
  listAliceNetItemsForEgsResolve,
  listAliceNetUnmatched,
  listAliceNetVnidsToDownload,
  listBranchesAtOtherPlaces,
  listOffersAtPlace,
  listPlaces,
  listPlaceVnsEnhanced,
  listRecentVnStockOffers,
  listStockAliases,
  listStockSources,
  listUnassignedBranches,
  listVnsAtPlace,
  listVnStockOffers,
  listVnStockProviderStatuses,
  moveProviderLink,
  replaceVnStockProviderSnapshot,
  resetAliceNetAutoMatches,
  setAliceNetEgsLink,
  setAliceNetVnLink,
  setCachedTitleResolution,
  unlinkProviderFromPlace,
  updatePlace,
  upsertAliceNetStock,
  upsertStockAlias,
  upsertStockSource,
  upsertVn,
  type VnStockOfferInput,
} from '@/lib/db';

// Force bootstrap, then open a raw handle for cleanup.
listAliceNetStockPage(1, 0);
const db = new Database(process.env.DB_PATH!);

function wipe(): void {
  db.exec(`
    DELETE FROM alicenet_stock;
    DELETE FROM vn_stock_offer;
    DELETE FROM vn_stock_provider_status;
    DELETE FROM vn_stock_alias;
    DELETE FROM vn_stock_source;
    DELETE FROM vn_title_resolve_cache;
    DELETE FROM place_provider_link;
    DELETE FROM place_registry;
    DELETE FROM collection;
    DELETE FROM vn;
  `);
}

beforeAll(wipe);
afterAll(() => db.close());
beforeEach(wipe);

function aliceRow(code: string, title: string): {
  code: string; title: string; jan: string | null; release_date: string | null;
  list_price: string | null; sale_price: string | null;
} {
  return { code, title, jan: null, release_date: null, list_price: '5000', sale_price: '3000' };
}

function stockOffer(over: Partial<VnStockOfferInput> = {}): VnStockOfferInput {
  return {
    vn_id: 'v90001',
    provider: 'surugaya',
    provider_offer_id: 'o1',
    source: 'title_search',
    title: 'placeholder offer',
    url: 'https://example.test/o1',
    price: 4000,
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

describe('upsertAliceNetStock — full sync', () => {
  it('reports added / updated / removed and deletes sold rows', () => {
    const first = upsertAliceNetStock([aliceRow('100-000001-001', 'Item A'), aliceRow('100-000002-002', 'Item B')]);
    expect(first).toEqual({ added: 2, updated: 0, removed: 0 });
    expect(countAliceNetStockTotal()).toBe(2);

    // Re-sync with A kept (updated) + C added; B is absent → removed.
    const second = upsertAliceNetStock([aliceRow('100-000001-001', 'Item A v2'), aliceRow('100-000003-003', 'Item C')]);
    expect(second).toEqual({ added: 1, updated: 1, removed: 1 });
    expect(getAliceNetStockItem('100-000001-001')?.title).toBe('Item A v2');
    expect(getAliceNetStockItem('100-000002-002')).toBeNull();
  });
});

describe('alicenet matching queues + counts', () => {
  it('classifies unprocessed / none-found / matched / egs-only correctly', () => {
    upsertAliceNetStock([
      aliceRow('200-000001-001', 'Unprocessed'),
      aliceRow('200-000002-002', 'None found'),
      aliceRow('200-000003-003', 'VNDB matched'),
      aliceRow('200-000004-004', 'EGS only'),
    ]);
    upsertVn({ id: 'v90001', title: 'Matched VN' });
    addToCollection('v90001', { status: 'planning' });

    setAliceNetVnLink('200-000002-002', null, 'none');
    setAliceNetVnLink('200-000003-003', 'v90001', 'auto', JSON.stringify([{ id: 'v90001', title: 'Matched VN', alttitle: null, released: null }]), 'matched vn');
    setAliceNetEgsLink('200-000004-004', 9999, 'auto', { title: 'egs t' });

    const counts = countAliceNetStock();
    expect(counts.total).toBe(4);
    expect(counts.vndb_matched).toBe(1);
    expect(counts.egs_only).toBe(1);
    expect(counts.matched).toBe(2);
    expect(counts.unprocessed).toBe(1);
    expect(counts.none_found).toBe(1);
    expect(counts.in_collection).toBe(1);

    expect(countAliceNetUnmatchedQueue()).toBe(1);
    expect(listAliceNetUnmatched(10).map((r) => r.code)).toEqual(['200-000001-001']);
    expect(countAliceNetNoVndbResult()).toBe(1);
    expect(listAliceNetNoVndbResult(10).map((r) => r.code)).toEqual(['200-000002-002']);
    expect(countAliceNetNoVndbNoEgs()).toBe(1);
    expect(listAliceNetNoVndbNoEgs(10).map((r) => r.code)).toEqual(['200-000002-002']);
    expect(countAliceNetNoVndbWithEgs()).toBe(0);
    expect(listAliceNetMatchedVnIds()).toEqual(['v90001']);
  });

  it('surfaces a none-found-with-egs row in the second-pass queue', () => {
    upsertAliceNetStock([aliceRow('210-000001-001', 'Has egs no vndb')]);
    setAliceNetVnLink('210-000001-001', null, 'none');
    setAliceNetEgsLink('210-000001-001', 1234, 'manual');
    expect(countAliceNetNoVndbWithEgs()).toBe(1);
    expect(listAliceNetNoVndbWithEgs(10).map((r) => r.code)).toEqual(['210-000001-001']);
    expect(countAliceNetNoVndbNoEgs()).toBe(0);
  });

  it('clears an AliceNet EGS link while preserving the explicit source marker', () => {
    upsertAliceNetStock([aliceRow('210-000002-002', 'Clear egs')]);
    setAliceNetEgsLink('210-000002-002', 4321, 'auto');
    setAliceNetEgsLink('210-000002-002', null, 'manual');
    const row = getAliceNetStockItem('210-000002-002');
    expect(row).toMatchObject({
      egs_id: null,
      egs_match_source: 'manual',
      egs_title: null,
      egs_brand: null,
      egs_release_date: null,
      egs_image_url: null,
    });
  });

  it('persists full AliceNet EGS metadata when a resolver returns it', () => {
    upsertAliceNetStock([aliceRow('210-000003-003', 'Full egs')]);
    setAliceNetEgsLink('210-000003-003', 5678, 'auto', {
      title: 'EGS Title',
      brand: 'EGS Brand',
      releaseDate: '2024-05-01',
      imageUrl: 'https://example.test/cover.jpg',
      vndbRaw: 'v12345',
    });
    expect(getAliceNetStockItem('210-000003-003')).toMatchObject({
      egs_id: 5678,
      egs_match_source: 'auto',
      egs_title: 'EGS Title',
      egs_brand: 'EGS Brand',
      egs_release_date: '2024-05-01',
      egs_image_url: 'https://example.test/cover.jpg',
      egs_vndb_raw: 'v12345',
    });
  });

  it('honours the retryBefore window on the none-found queue', () => {
    upsertAliceNetStock([aliceRow('220-000001-001', 'Recent none')]);
    setAliceNetVnLink('220-000001-001', null, 'none');
    const recent = getAliceNetStockItem('220-000001-001')!.last_matched_at!;
    // A cutoff older than the row excludes it; a future cutoff includes it.
    expect(countAliceNetNoVndbResult(recent - 1000)).toBe(0);
    expect(countAliceNetNoVndbResult(recent + 1000)).toBe(1);
  });

  it('resetAliceNetAutoMatches clears auto links but keeps manual ones', () => {
    upsertAliceNetStock([aliceRow('230-000001-001', 'Auto'), aliceRow('230-000002-002', 'Manual')]);
    upsertVn({ id: 'v90001', title: 'A' });
    upsertVn({ id: 'v90002', title: 'B' });
    setAliceNetVnLink('230-000001-001', 'v90001', 'auto');
    setAliceNetVnLink('230-000002-002', 'v90002', 'manual');
    expect(resetAliceNetAutoMatches()).toBe(1);
    expect(getAliceNetStockItem('230-000001-001')?.vn_id).toBeNull();
    expect(getAliceNetStockItem('230-000002-002')?.vn_id).toBe('v90002');
  });

  it('clearAliceNetVnLink resets a single row to unprocessed', () => {
    upsertAliceNetStock([aliceRow('240-000001-001', 'X')]);
    upsertVn({ id: 'v90001', title: 'A' });
    setAliceNetVnLink('240-000001-001', 'v90001', 'auto');
    clearAliceNetVnLink('240-000001-001');
    const row = getAliceNetStockItem('240-000001-001');
    expect(row?.vn_id).toBeNull();
    expect(row?.vn_match_source).toBeNull();
  });
});

describe('alicenet download-pending helpers', () => {
  it('lists VN ids to download + items for EGS resolve and counts both pending pools', () => {
    upsertAliceNetStock([aliceRow('300-000001-001', 'Need vn dl'), aliceRow('300-000002-002', 'Need egs resolve')]);
    // Row 1: matched to a VN not yet in the local vn table.
    setAliceNetVnLink('300-000001-001', 'v95001', 'auto');
    // Row 2: matched to a VN that IS local, but lacks an egs link.
    upsertVn({ id: 'v95002', title: 'Local VN' });
    setAliceNetVnLink('300-000002-002', 'v95002', 'auto');

    expect(listAliceNetVnidsToDownload(10)).toEqual(['v95001']);
    expect(listAliceNetItemsForEgsResolve(10)).toEqual([{ code: '300-000002-002', vn_id: 'v95002' }]);
    expect(countAliceNetDownloadPending()).toEqual({ vndb_pending: 1, egs_pending: 1 });
  });
});

describe('alicenet paging + per-VN listing', () => {
  it('paginates joined with collection + clamps the limit, and lists rows for a VN', () => {
    upsertAliceNetStock([aliceRow('400-000001-001', 'Aaa'), aliceRow('400-000002-002', 'Bbb')]);
    upsertVn({ id: 'v90001', title: 'Owned VN' });
    addToCollection('v90001', { status: 'planning' });
    setAliceNetVnLink('400-000001-001', 'v90001', 'auto');

    const page = listAliceNetStockPage(1, 0);
    expect(page).toHaveLength(1);
    expect(page[0].code).toBe('400-000001-001');
    expect(page[0].in_collection).toBe(1);

    const second = listAliceNetStockPage(1, 1);
    expect(second[0].code).toBe('400-000002-002');
    expect(second[0].in_collection).toBe(0);

    expect(listAliceNetStockForVn('v90001').map((r) => r.code)).toEqual(['400-000001-001']);
    // Negative / non-finite limit falls back to the cap (still returns rows).
    expect(listAliceNetStockPage(-5, -1).length).toBeGreaterThan(0);
  });
});

describe('vn stock offers + provider statuses', () => {
  it('replaceVnStockProviderSnapshot writes offers + status and listVnStockOffers orders them', () => {
    upsertVn({ id: 'v90001', title: 'Stocked VN' });
    replaceVnStockProviderSnapshot(
      'v90001',
      'surugaya',
      [
        stockOffer({ provider_offer_id: 'o-out', availability: 'out_of_stock', price: 1000 }),
        stockOffer({ provider_offer_id: 'o-in', availability: 'in_stock', price: 2000 }),
      ],
      { status: 'ok', message: null, fetched_at: Date.now(), offer_count: 2 },
    );
    const offers = listVnStockOffers('v90001');
    expect(offers).toHaveLength(2);
    // in_stock sorts ahead of out_of_stock.
    expect(offers[0].availability).toBe('in_stock');
    const statuses = listVnStockProviderStatuses('v90001');
    expect(statuses).toHaveLength(1);
    expect(statuses[0]).toMatchObject({ provider: 'surugaya', status: 'ok', offer_count: 2 });
  });

  it('a second snapshot for the same provider replaces the prior offers', () => {
    upsertVn({ id: 'v90001', title: 'Replaced VN' });
    replaceVnStockProviderSnapshot('v90001', 'surugaya', [stockOffer({ provider_offer_id: 'first' })], { status: 'ok', message: null, fetched_at: Date.now(), offer_count: 1 });
    replaceVnStockProviderSnapshot('v90001', 'surugaya', [stockOffer({ provider_offer_id: 'second' })], { status: 'ok', message: null, fetched_at: Date.now(), offer_count: 1 });
    const offers = listVnStockOffers('v90001');
    expect(offers).toHaveLength(1);
    expect(offers[0].provider_offer_id).toBe('second');
  });

  it('preserveExistingOffers keeps prior offers when set', () => {
    upsertVn({ id: 'v90001', title: 'Preserve VN' });
    replaceVnStockProviderSnapshot('v90001', 'surugaya', [stockOffer({ provider_offer_id: 'keep' })], { status: 'ok', message: null, fetched_at: Date.now(), offer_count: 1 });
    replaceVnStockProviderSnapshot(
      'v90001',
      'surugaya',
      [stockOffer({ provider_offer_id: 'add' })],
      { status: 'ok', message: null, fetched_at: Date.now(), offer_count: 2 },
      { preserveExistingOffers: true },
    );
    expect(listVnStockOffers('v90001').map((o) => o.provider_offer_id).sort()).toEqual(['add', 'keep']);
  });

  it('clearVnStockCache removes both offers and statuses', () => {
    upsertVn({ id: 'v90001', title: 'Clear VN' });
    replaceVnStockProviderSnapshot('v90001', 'surugaya', [stockOffer()], { status: 'ok', message: null, fetched_at: Date.now(), offer_count: 1 });
    expect(clearVnStockCache('v90001')).toEqual({ offers: 1, statuses: 1 });
    expect(listVnStockOffers('v90001')).toHaveLength(0);
    expect(listVnStockProviderStatuses('v90001')).toHaveLength(0);
  });

  it('listRecentVnStockOffers joins the VN title', () => {
    upsertVn({ id: 'v90001', title: 'Recent VN' });
    replaceVnStockProviderSnapshot('v90001', 'surugaya', [stockOffer()], { status: 'ok', message: null, fetched_at: Date.now(), offer_count: 1 });
    const recent = listRecentVnStockOffers(10);
    expect(recent[0].vn_title).toBe('Recent VN');
  });
});

describe('batchVnStockSummaries (offer-based path)', () => {
  it('returns empty map for no ids and aggregates available + best price otherwise', () => {
    expect(batchVnStockSummaries([]).size).toBe(0);

    upsertVn({ id: 'v90001', title: 'Summ VN' });
    replaceVnStockProviderSnapshot(
      'v90001',
      'surugaya',
      [
        stockOffer({ provider_offer_id: 'a', source: 'direct', price: 5000, availability: 'in_stock' }),
        stockOffer({ provider_offer_id: 'b', source: 'direct', price: 3000, availability: 'limited' }),
        // Excluded: out_of_stock.
        stockOffer({ provider_offer_id: 'c', source: 'direct', price: 100, availability: 'out_of_stock' }),
      ],
      { status: 'ok', message: null, fetched_at: Date.now(), offer_count: 3 },
    );
    const map = batchVnStockSummaries(['v90001', 'v99999']);
    expect(map.get('v90001')).toEqual({ available: 2, best_price: 3000 });
    expect(map.has('v99999')).toBe(false);
  });
});

describe('stock aliases + sources + title-resolution cache', () => {
  it('upserts / lists / deletes search aliases', () => {
    upsertStockAlias('v90001', 'alt query one');
    upsertStockAlias('v90001', 'alt query two');
    expect(listStockAliases('v90001').map((a) => a.alias_term).sort()).toEqual(['alt query one', 'alt query two']);
    deleteStockAlias('v90001', 'alt query one');
    expect(listStockAliases('v90001').map((a) => a.alias_term)).toEqual(['alt query two']);
  });

  it('upserts / lists / deletes user-pinned stock sources', () => {
    const created = upsertStockSource({ vn_id: 'v90001', provider: 'surugaya', url: 'https://shop.test/item/1' });
    expect(created.provider).toBe('surugaya');
    // Conflict on (vn_id, url) updates in place rather than inserting a dup.
    upsertStockSource({ vn_id: 'v90001', provider: 'amiami', url: 'https://shop.test/item/1', product_id: 'PID' });
    const sources = listStockSources('v90001');
    expect(sources).toHaveLength(1);
    expect(sources[0]).toMatchObject({ provider: 'amiami', product_id: 'PID' });

    expect(deleteStockSource('v90001', created.id)).toBe(true);
    expect(deleteStockSource('v90001', 99999)).toBe(false);
    expect(listStockSources('v90001')).toHaveLength(0);
  });

  it('caches and reads back a title resolution', () => {
    expect(getCachedTitleResolution('some query')).toBeNull();
    setCachedTitleResolution('some query', 'v90001', 'Resolved Title');
    expect(getCachedTitleResolution('some query')).toEqual({ vnId: 'v90001', title: 'Resolved Title' });
  });
});

describe('place registry + provider links', () => {
  it('creates, reads, updates, lists, and deletes a place', () => {
    const id = createPlace({ name: 'Shop North', kind: 'shop', address: '1 Test Rd' });
    expect(getPlace(id)).toMatchObject({ name: 'Shop North', kind: 'shop' });
    updatePlace(id, { name: 'Shop North Renamed', notes: 'open weekends' });
    expect(getPlace(id)?.name).toBe('Shop North Renamed');
    expect(listPlaces().map((p) => p.id)).toContain(id);
    deletePlace(id);
    expect(getPlace(id)).toBeNull();
  });

  it('links / unlinks / moves providers and surfaces unassigned + other-place branches', () => {
    const a = createPlace({ name: 'Place A' });
    const b = createPlace({ name: 'Place B' });
    linkProviderToPlace(a, 'branch-tokyo');
    expect(getPlaceProviderMap()['branch-tokyo']).toBe(a);
    expect(listBranchesAtOtherPlaces(b).map((r) => r.provider_label)).toEqual(['branch-tokyo']);

    moveProviderLink(a, b, 'branch-tokyo');
    expect(getPlaceProviderMap()['branch-tokyo']).toBe(b);

    unlinkProviderFromPlace(b, 'branch-tokyo');
    expect(getPlaceProviderMap()['branch-tokyo']).toBeUndefined();
  });

  it('lists VNs and offers at a place and reports unassigned branches', () => {
    const place = createPlace({ name: 'Stocked Place' });
    linkProviderToPlace(place, 'branch-osaka');
    upsertVn({ id: 'v90001', title: 'Place VN' });
    addToCollection('v90001', { status: 'planning' });
    replaceVnStockProviderSnapshot(
      'v90001',
      'surugaya',
      [stockOffer({ provider_offer_id: 'p1', location_branch: 'branch-osaka', availability: 'in_stock', price: 2500 })],
      { status: 'ok', message: null, fetched_at: Date.now(), offer_count: 1 },
    );
    // An offer at a branch not yet linked to any place.
    replaceVnStockProviderSnapshot(
      'v90001',
      'amiami',
      [stockOffer({ provider: 'amiami', provider_offer_id: 'p2', location_branch: 'branch-unlinked', availability: 'in_stock', price: 1000 })],
      { status: 'ok', message: null, fetched_at: Date.now(), offer_count: 1 },
    );

    expect(listVnsAtPlace(place).map((r) => r.vn_id)).toEqual(['v90001']);
    expect(listOffersAtPlace(place).map((r) => r.provider)).toEqual(['surugaya']);
    expect(listPlaceVnsEnhanced(place).map((r) => r.vn_id)).toEqual(['v90001']);
    expect(getPlace(place)?.stock_count).toBe(1);
    expect(listUnassignedBranches()).toContain('branch-unlinked');
    expect(listUnassignedBranches()).not.toContain('branch-osaka');
  });
});
