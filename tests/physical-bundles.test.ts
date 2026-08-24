import Database from 'better-sqlite3';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import {
  createPhysicalBundle,
  createShelf,
  deletePhysicalBundle,
  getPhysicalBundle,
  listAllOwnedReleases,
  listCollection,
  listPhysicalBundles,
  listShelfSlots,
  listUnplacedOwnedReleases,
  placeShelfDisplayItem,
  placeShelfItem,
  renamePhysicalBundle,
  upsertVn,
} from '@/lib/db';

listCollection({});
const db = new Database(process.env.DB_PATH!);
const vnIds = ['v990201', 'v990202', 'v990203'] as const;
const releaseIds = ['r990201', 'r990202', 'r990203'] as const;

function identity(index: number): { vnId: string; releaseId: string } {
  return { vnId: vnIds[index], releaseId: releaseIds[index] };
}

function seedOwnedEditions(): void {
  vnIds.forEach((vnId, index) => {
    upsertVn({ id: vnId, title: `Synthetic bundle title ${index + 1}` });
    db.prepare(`
      INSERT INTO owned_release (vn_id, release_id, edition_label, added_at)
      VALUES (?, ?, ?, ?)
    `).run(vnId, releaseIds[index], `Edition ${index + 1}`, index + 1);
  });
}

beforeEach(() => {
  db.exec(`
    DELETE FROM physical_bundle;
    DELETE FROM shelf_display_slot;
    DELETE FROM shelf_slot;
    DELETE FROM shelf_unit WHERE name LIKE 'Synthetic bundle shelf%';
    DELETE FROM owned_release WHERE vn_id LIKE 'v99020%';
    DELETE FROM vn WHERE id LIKE 'v99020%';
  `);
  seedOwnedEditions();
});

afterAll(() => db.close());

describe('physical shelf bundles', () => {
  it('shelves several owned releases as one physical anchor and dissolves without data loss', () => {
    const shelf = createShelf({ name: 'Synthetic bundle shelf' });
    placeShelfItem({ shelfId: shelf.id, row: 0, col: 1, ...identity(1) });

    const bundle = createPhysicalBundle({
      name: 'Synthetic trilogy',
      anchor: identity(0),
      members: [identity(0), identity(1)],
    });

    expect(bundle).toMatchObject({
      name: 'Synthetic trilogy',
      anchor_vn_id: vnIds[0],
      anchor_release_id: releaseIds[0],
    });
    expect(bundle.members.map((member) => member.vn_id)).toEqual([vnIds[0], vnIds[1]]);
    expect(listShelfSlots(shelf.id)).toEqual([]);
    expect(listPhysicalBundles()).toHaveLength(1);
    expect(getPhysicalBundle(bundle.id)?.members).toHaveLength(2);

    const pool = listUnplacedOwnedReleases();
    expect(pool.filter((entry) => vnIds.includes(entry.vn_id as typeof vnIds[number]))).toMatchObject([
      { vn_id: vnIds[0], bundle_id: bundle.id, bundle_name: 'Synthetic trilogy', bundle_member_count: 2 },
      { vn_id: vnIds[2], bundle_id: null, bundle_name: null, bundle_member_count: 0 },
    ]);
    expect(listAllOwnedReleases().filter((entry) => vnIds.includes(entry.vn_id as typeof vnIds[number]))).toHaveLength(2);

    expect(() => placeShelfItem({ shelfId: shelf.id, row: 0, col: 0, ...identity(1) }))
      .toThrow('bundle members must be placed through the anchor edition');
    expect(() => placeShelfDisplayItem({ shelfId: shelf.id, afterRow: 0, position: 0, ...identity(1) }))
      .toThrow('bundle members must be placed through the anchor edition');

    placeShelfItem({ shelfId: shelf.id, row: 0, col: 0, ...identity(0) });
    expect(listShelfSlots(shelf.id)[0]).toMatchObject({
      vn_id: vnIds[0],
      bundle_id: bundle.id,
      bundle_name: 'Synthetic trilogy',
      bundle_member_count: 2,
    });

    expect(renamePhysicalBundle(bundle.id, 'Renamed trilogy')?.name).toBe('Renamed trilogy');
    expect(deletePhysicalBundle(bundle.id)).toBe(true);
    expect(deletePhysicalBundle(bundle.id)).toBe(false);
    expect(getPhysicalBundle(bundle.id)).toBeNull();
    expect(listUnplacedOwnedReleases().filter((entry) => vnIds.includes(entry.vn_id as typeof vnIds[number]))).toHaveLength(2);
    expect(listAllOwnedReleases().filter((entry) => vnIds.includes(entry.vn_id as typeof vnIds[number]))).toHaveLength(3);
    expect(listShelfSlots(shelf.id)[0]).toMatchObject({
      vn_id: vnIds[0],
      bundle_id: null,
      bundle_name: null,
      bundle_member_count: 0,
    });
  });

  it('rejects invalid, missing, and overlapping membership atomically', () => {
    expect(() => createPhysicalBundle({ name: '', anchor: identity(0), members: [identity(0), identity(1)] }))
      .toThrow('bundle name required');
    expect(() => createPhysicalBundle({ name: 'One item', anchor: identity(0), members: [identity(0)] }))
      .toThrow('bundle requires at least two editions');
    expect(() => createPhysicalBundle({
      name: 'Missing item',
      anchor: identity(0),
      members: [identity(0), { vnId: 'v990299', releaseId: 'r990299' }],
    })).toThrow('owned edition not found');
    expect(listPhysicalBundles()).toEqual([]);

    const bundle = createPhysicalBundle({
      name: 'First bundle',
      anchor: identity(0),
      members: [identity(0), identity(1)],
    });
    expect(() => createPhysicalBundle({
      name: 'Overlap',
      anchor: identity(1),
      members: [identity(1), identity(2)],
    })).toThrow('edition already belongs to a bundle');
    expect(() => renamePhysicalBundle(bundle.id, '')).toThrow('bundle name required');
    expect(renamePhysicalBundle(999_999, 'Missing')).toBeNull();
  });

  it('adds the anchor when callers omit it from the member list', () => {
    const bundle = createPhysicalBundle({
      name: 'Implicit anchor',
      anchor: identity(0),
      members: [identity(1), identity(2)],
    });
    expect(bundle.members.map((member) => member.vn_id)).toEqual([vnIds[0], vnIds[1], vnIds[2]]);
  });

  it('ignores unrelated bundle summaries while listing one shelf', () => {
    for (const suffix of ['4', '5']) {
      const vnId = `v99020${suffix}`;
      const releaseId = `r99020${suffix}`;
      upsertVn({ id: vnId, title: `Unrelated bundle ${suffix}` });
      db.prepare('INSERT INTO owned_release (vn_id, release_id, added_at) VALUES (?, ?, ?)')
        .run(vnId, releaseId, Number(suffix));
    }
    const shelf = createShelf({ name: 'Synthetic bundle shelf with unrelated bundle' });
    const visible = createPhysicalBundle({
      name: 'Visible bundle',
      anchor: identity(0),
      members: [identity(0), identity(1)],
    });
    createPhysicalBundle({
      name: 'Unrelated bundle',
      anchor: { vnId: 'v990204', releaseId: 'r990204' },
      members: [
        { vnId: 'v990204', releaseId: 'r990204' },
        { vnId: 'v990205', releaseId: 'r990205' },
      ],
    });
    placeShelfItem({ shelfId: shelf.id, row: 0, col: 0, ...identity(0) });

    expect(listShelfSlots(shelf.id)[0]).toMatchObject({ bundle_id: visible.id });
  });
});
