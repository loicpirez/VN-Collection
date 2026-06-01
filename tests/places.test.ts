/**
 * Contract tests for the place_registry layer in src/lib/db.ts.
 *
 * Covered:
 *   - createPlace / getPlace / listPlaces / updatePlace / deletePlace
 *   - linkProviderToPlace / unlinkProviderFromPlace duplicate-safety
 *   - moveProviderLink atomicity
 *   - getPlaceProviderMap shape
 *   - listUnassignedBranches covers both location_branch and location_label
 *     and excludes the online sentinel
 *   - listVnsAtPlace joins on both location_branch and location_label
 *   - listBranchesAtOtherPlaces excludes the focused place
 *   - kind column default + persistence
 *   - ON DELETE CASCADE on place_provider_link
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  db,
  createPlace,
  deletePlace,
  getPlace,
  getPlaceProviderMap,
  linkProviderToPlace,
  listBranchesAtOtherPlaces,
  listPlaces,
  listUnassignedBranches,
  listVnsAtPlace,
  moveProviderLink,
  unlinkProviderFromPlace,
  updatePlace,
} from '@/lib/db';

const PLACE_NAME_PREFIX = '__test_place_';
const VN_ID_A = 'v90001';
const VN_ID_B = 'v90002';

function resetFixtures(): void {
  db.prepare(`DELETE FROM place_provider_link WHERE place_id IN (SELECT id FROM place_registry WHERE name LIKE '${PLACE_NAME_PREFIX}%')`).run();
  db.prepare(`DELETE FROM place_registry WHERE name LIKE '${PLACE_NAME_PREFIX}%'`).run();
  db.prepare(`DELETE FROM vn_stock_offer WHERE vn_id IN (?, ?)`).run(VN_ID_A, VN_ID_B);
  db.prepare(`DELETE FROM vn WHERE id IN (?, ?)`).run(VN_ID_A, VN_ID_B);
}

function seedVn(id: string, title: string): void {
  db.prepare(`INSERT OR IGNORE INTO vn (id, title, fetched_at) VALUES (?, ?, ?)`).run(id, title, Date.now());
}

function seedOffer(opts: {
  vnId: string;
  provider: string;
  offerId: string;
  branch: string | null;
  label: string | null;
  availability?: 'in_stock' | 'limited' | 'out_of_stock';
  price?: number | null;
  updatedAt?: number;
}): void {
  const now = opts.updatedAt ?? Date.now();
  db.prepare(`
    INSERT OR REPLACE INTO vn_stock_offer (
      vn_id, provider, provider_offer_id, source, title, url, price, currency,
      availability, location_label, location_branch, fetched_at, updated_at
    ) VALUES (?, ?, ?, 'direct', 'test', 'https://example.test', ?, 'JPY', ?, ?, ?, ?, ?)
  `).run(
    opts.vnId,
    opts.provider,
    opts.offerId,
    opts.price ?? null,
    opts.availability ?? 'in_stock',
    opts.label,
    opts.branch,
    now,
    now,
  );
}

describe('place_registry — CRUD', () => {
  beforeEach(resetFixtures);
  afterEach(resetFixtures);

  it('createPlace defaults kind to shop and persists every payload field', () => {
    const id = createPlace({
      name: `${PLACE_NAME_PREFIX}A`,
      name_ja: 'テストA',
      address: '東京都千代田区',
      lat: 35.6,
      lng: 139.7,
      url: 'https://shop.test',
      notes: 'notes',
    });
    expect(id).toBeGreaterThan(0);
    const row = getPlace(id);
    expect(row).not.toBeNull();
    expect(row!.name).toBe(`${PLACE_NAME_PREFIX}A`);
    expect(row!.name_ja).toBe('テストA');
    expect(row!.kind).toBe('shop');
    expect(row!.lat).toBe(35.6);
    expect(row!.lng).toBe(139.7);
    expect(row!.url).toBe('https://shop.test');
    expect(row!.address).toBe('東京都千代田区');
    expect(row!.notes).toBe('notes');
    expect(row!.provider_labels).toEqual([]);
    expect(row!.stock_count).toBe(0);
  });

  it('createPlace stores explicit kind values', () => {
    const chainId = createPlace({ name: `${PLACE_NAME_PREFIX}chain`, kind: 'chain' });
    const storageId = createPlace({ name: `${PLACE_NAME_PREFIX}storage`, kind: 'storage' });
    expect(getPlace(chainId)!.kind).toBe('chain');
    expect(getPlace(storageId)!.kind).toBe('storage');
  });

  it('updatePlace mutates only provided fields and bumps updated_at', () => {
    const id = createPlace({ name: `${PLACE_NAME_PREFIX}upd`, address: 'old' });
    const before = getPlace(id)!;
    const beforeUpdated = before.updated_at;
    // sleep barrier so updated_at increments
    const target = beforeUpdated + 5;
    while (Date.now() <= target) { /* spin briefly */ }
    updatePlace(id, { kind: 'chain', address: 'new' });
    const after = getPlace(id)!;
    expect(after.kind).toBe('chain');
    expect(after.address).toBe('new');
    expect(after.name).toBe(`${PLACE_NAME_PREFIX}upd`);
    expect(after.updated_at).toBeGreaterThan(beforeUpdated);
  });

  it('deletePlace removes the row and cascades the link table', () => {
    const id = createPlace({ name: `${PLACE_NAME_PREFIX}del` });
    linkProviderToPlace(id, 'BranchX');
    expect(getPlace(id)!.provider_labels).toEqual(['BranchX']);
    deletePlace(id);
    expect(getPlace(id)).toBeNull();
    const orphans = db.prepare(`SELECT COUNT(*) AS n FROM place_provider_link WHERE place_id = ?`).get(id) as { n: number };
    expect(orphans.n).toBe(0);
  });

  it('listPlaces returns places sorted by name and includes provider_labels', () => {
    createPlace({ name: `${PLACE_NAME_PREFIX}b` });
    createPlace({ name: `${PLACE_NAME_PREFIX}a` });
    const all = listPlaces().filter((p) => p.name.startsWith(PLACE_NAME_PREFIX));
    expect(all.map((p) => p.name)).toEqual([`${PLACE_NAME_PREFIX}a`, `${PLACE_NAME_PREFIX}b`]);
    expect(all.every((p) => Array.isArray(p.provider_labels))).toBe(true);
  });
});

describe('place_provider_link', () => {
  beforeEach(resetFixtures);
  afterEach(resetFixtures);

  it('linkProviderToPlace is idempotent (INSERT OR IGNORE)', () => {
    const id = createPlace({ name: `${PLACE_NAME_PREFIX}dup` });
    linkProviderToPlace(id, 'BranchA');
    linkProviderToPlace(id, 'BranchA');
    linkProviderToPlace(id, 'BranchA');
    expect(getPlace(id)!.provider_labels).toEqual(['BranchA']);
  });

  it('unlinkProviderFromPlace removes only the matching row', () => {
    const id = createPlace({ name: `${PLACE_NAME_PREFIX}ul` });
    linkProviderToPlace(id, 'BranchA');
    linkProviderToPlace(id, 'BranchB');
    unlinkProviderFromPlace(id, 'BranchA');
    expect(getPlace(id)!.provider_labels).toEqual(['BranchB']);
  });

  it('moveProviderLink atomically deletes the source link and inserts at destination', () => {
    const fromId = createPlace({ name: `${PLACE_NAME_PREFIX}from` });
    const toId = createPlace({ name: `${PLACE_NAME_PREFIX}to` });
    linkProviderToPlace(fromId, 'BranchA');
    moveProviderLink(fromId, toId, 'BranchA');
    expect(getPlace(fromId)!.provider_labels).toEqual([]);
    expect(getPlace(toId)!.provider_labels).toEqual(['BranchA']);
  });

  it('moveProviderLink does not duplicate when destination already linked', () => {
    const fromId = createPlace({ name: `${PLACE_NAME_PREFIX}from2` });
    const toId = createPlace({ name: `${PLACE_NAME_PREFIX}to2` });
    linkProviderToPlace(fromId, 'BranchA');
    linkProviderToPlace(toId, 'BranchA');
    moveProviderLink(fromId, toId, 'BranchA');
    expect(getPlace(fromId)!.provider_labels).toEqual([]);
    expect(getPlace(toId)!.provider_labels).toEqual(['BranchA']);
  });

  it('getPlaceProviderMap returns label → place_id mapping', () => {
    const id = createPlace({ name: `${PLACE_NAME_PREFIX}map` });
    linkProviderToPlace(id, 'BranchA');
    linkProviderToPlace(id, 'BranchB');
    const map = getPlaceProviderMap();
    expect(map.BranchA).toBe(id);
    expect(map.BranchB).toBe(id);
  });
});

describe('listUnassignedBranches', () => {
  beforeEach(resetFixtures);
  afterEach(resetFixtures);

  it('covers location_branch values that are not linked anywhere', () => {
    seedVn(VN_ID_A, 'Game A');
    seedOffer({ vnId: VN_ID_A, provider: 'p1', offerId: 'o1', branch: 'StandaloneBranch', label: 'StandaloneBranch' });
    const result = listUnassignedBranches();
    expect(result).toContain('StandaloneBranch');
  });

  it('covers location_label values when location_branch is null', () => {
    seedVn(VN_ID_A, 'Game A');
    seedOffer({ vnId: VN_ID_A, provider: 'p1', offerId: 'o2', branch: null, label: 'LabelOnly' });
    expect(listUnassignedBranches()).toContain('LabelOnly');
  });

  it('excludes the __online_stock__ sentinel', () => {
    seedVn(VN_ID_A, 'Game A');
    seedOffer({ vnId: VN_ID_A, provider: 'p1', offerId: 'o3', branch: null, label: '__online_stock__' });
    expect(listUnassignedBranches()).not.toContain('__online_stock__');
  });

  it('excludes branches that are already linked to any place', () => {
    seedVn(VN_ID_A, 'Game A');
    seedOffer({ vnId: VN_ID_A, provider: 'p1', offerId: 'o4', branch: 'AssignedBranch', label: 'AssignedBranch' });
    const id = createPlace({ name: `${PLACE_NAME_PREFIX}holder` });
    linkProviderToPlace(id, 'AssignedBranch');
    expect(listUnassignedBranches()).not.toContain('AssignedBranch');
  });
});

describe('listVnsAtPlace', () => {
  beforeEach(resetFixtures);
  afterEach(resetFixtures);

  it('returns VNs whose location_branch matches a linked label', () => {
    seedVn(VN_ID_A, 'Game A');
    seedOffer({ vnId: VN_ID_A, provider: 'p1', offerId: 'o1', branch: 'BranchA', label: 'BranchA', price: 1000 });
    const id = createPlace({ name: `${PLACE_NAME_PREFIX}match` });
    linkProviderToPlace(id, 'BranchA');
    const vns = listVnsAtPlace(id);
    expect(vns).toHaveLength(1);
    expect(vns[0].vn_id).toBe(VN_ID_A);
    expect(vns[0].min_price).toBe(1000);
    expect(vns[0].offer_count).toBe(1);
    expect(vns[0].max_updated_at).toBeGreaterThan(0);
  });

  it('returns VNs whose location_label matches when location_branch is null', () => {
    seedVn(VN_ID_A, 'Game A');
    seedOffer({ vnId: VN_ID_A, provider: 'p1', offerId: 'o1', branch: null, label: 'LabelOnly', price: 800 });
    const id = createPlace({ name: `${PLACE_NAME_PREFIX}label` });
    linkProviderToPlace(id, 'LabelOnly');
    const vns = listVnsAtPlace(id);
    expect(vns).toHaveLength(1);
    expect(vns[0].min_price).toBe(800);
  });

  it('aggregates min_price and offer_count across multiple offers for the same VN', () => {
    seedVn(VN_ID_A, 'Game A');
    seedOffer({ vnId: VN_ID_A, provider: 'p1', offerId: 'a', branch: 'BranchA', label: 'BranchA', price: 1500 });
    seedOffer({ vnId: VN_ID_A, provider: 'p2', offerId: 'b', branch: 'BranchA', label: 'BranchA', price: 1200 });
    const id = createPlace({ name: `${PLACE_NAME_PREFIX}agg` });
    linkProviderToPlace(id, 'BranchA');
    const vns = listVnsAtPlace(id);
    expect(vns).toHaveLength(1);
    expect(vns[0].min_price).toBe(1200);
    expect(vns[0].offer_count).toBe(2);
  });

  it('excludes offers that are out of stock', () => {
    seedVn(VN_ID_A, 'Game A');
    seedOffer({
      vnId: VN_ID_A, provider: 'p1', offerId: 'oos', branch: 'BranchA', label: 'BranchA',
      availability: 'out_of_stock', price: 500,
    });
    const id = createPlace({ name: `${PLACE_NAME_PREFIX}oos` });
    linkProviderToPlace(id, 'BranchA');
    expect(listVnsAtPlace(id)).toHaveLength(0);
  });
});

describe('stock_count subquery in listPlaces/getPlace', () => {
  beforeEach(resetFixtures);
  afterEach(resetFixtures);

  it('counts distinct VNs in stock at a place via location_branch OR location_label', () => {
    seedVn(VN_ID_A, 'Game A');
    seedVn(VN_ID_B, 'Game B');
    seedOffer({ vnId: VN_ID_A, provider: 'p1', offerId: 'a', branch: 'BranchA', label: 'BranchA' });
    seedOffer({ vnId: VN_ID_B, provider: 'p2', offerId: 'b', branch: null, label: 'BranchA' });
    const id = createPlace({ name: `${PLACE_NAME_PREFIX}sc` });
    linkProviderToPlace(id, 'BranchA');
    expect(getPlace(id)!.stock_count).toBe(2);
    expect(listPlaces().find((place) => place.id === id)!.stock_count).toBe(2);
  });
});

describe('listBranchesAtOtherPlaces', () => {
  beforeEach(resetFixtures);
  afterEach(resetFixtures);

  it('returns branches linked to places other than the focused one', () => {
    const a = createPlace({ name: `${PLACE_NAME_PREFIX}A` });
    const b = createPlace({ name: `${PLACE_NAME_PREFIX}B` });
    linkProviderToPlace(a, 'BranchA');
    linkProviderToPlace(b, 'BranchB');
    const seenFromA = listBranchesAtOtherPlaces(a);
    expect(seenFromA.find((r) => r.provider_label === 'BranchB')).toBeTruthy();
    expect(seenFromA.find((r) => r.provider_label === 'BranchA')).toBeFalsy();
  });
});
