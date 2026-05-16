import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
// DB_PATH is pinned to a per-worker temp file in tests/setup.ts, which
// vitest runs BEFORE this module is loaded. Without that, the real
// data/collection.db would be opened by the lib/db import below.
import {
  createShelf,
  deleteShelf,
  getShelfPlacementForEdition,
  listAllOwnedReleases,
  listShelfDisplaySlots,
  listShelfSlots,
  listShelves,
  listUnplacedOwnedReleases,
  placeShelfDisplayItem,
  placeShelfItem,
  removeShelfDisplayPlacement,
  removeShelfPlacement,
  renameShelf,
  resizeShelf,
} from '@/lib/db';

// Force lib/db to bootstrap the schema before we open our own raw
// connection. The lib/db `db` export is a lazy Proxy now (audit
// `db perf C-1` fix); without this nudge the file is empty until
// the first real DB call inside one of the lib helpers.
listShelves();
const db = new Database(process.env.DB_PATH!);

function ensureVnAndOwned(vnId: string, releaseId: string, title = vnId): void {
  const now = Date.now();
  db.prepare(
    'INSERT OR IGNORE INTO vn (id, title, fetched_at) VALUES (?, ?, ?)',
  ).run(vnId, title, now);
  db.prepare(
    `INSERT OR IGNORE INTO owned_release (vn_id, release_id, added_at)
     VALUES (?, ?, ?)`,
  ).run(vnId, releaseId, now);
}

function clear(): void {
  db.exec(
    'DELETE FROM shelf_display_slot; DELETE FROM shelf_slot; DELETE FROM shelf_unit; DELETE FROM owned_release; DELETE FROM vn;',
  );
}

beforeAll(() => {
  // The bootstrap in lib/db runs on import — verify the tables exist.
  const rows = db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('shelf_unit', 'shelf_slot', 'shelf_display_slot', 'owned_release', 'vn')",
    )
    .all() as Array<{ name: string }>;
  expect(rows.map((r) => r.name).sort()).toEqual([
    'owned_release',
    'shelf_display_slot',
    'shelf_slot',
    'shelf_unit',
    'vn',
  ]);
});

beforeEach(() => {
  clear();
});

describe('shelf CRUD', () => {
  it('creates with clamped defaults and ascending order_index', () => {
    const a = createShelf({ name: 'Left bookcase' });
    const b = createShelf({ name: 'Right bookcase', cols: 12, rows: 3 });
    const list = listShelves();
    expect(list).toHaveLength(2);
    expect(list[0].id).toBe(a.id);
    expect(list[1].id).toBe(b.id);
    expect(list[1].cols).toBe(12);
    expect(list[1].rows).toBe(3);
    expect(list[1].placed_count).toBe(0);
  });

  it('clamps cols/rows to the SHELF_MIN..SHELF_MAX range', () => {
    const undersize = createShelf({ name: 'A', cols: 0, rows: -5 });
    const oversize = createShelf({ name: 'B', cols: 99999, rows: 99999 });
    expect(undersize.cols).toBeGreaterThanOrEqual(1);
    expect(undersize.rows).toBeGreaterThanOrEqual(1);
    expect(oversize.cols).toBeLessThanOrEqual(200);
    expect(oversize.rows).toBeLessThanOrEqual(200);
  });

  it('rejects empty names', () => {
    expect(() => createShelf({ name: '   ' })).toThrow(/name required/);
  });

  it('renames and deletes', () => {
    const s = createShelf({ name: 'Old' });
    const renamed = renameShelf(s.id, 'New');
    expect(renamed?.name).toBe('New');
    expect(deleteShelf(s.id)).toBe(true);
    expect(deleteShelf(s.id)).toBe(false);
    expect(listShelves()).toEqual([]);
  });
});

describe('placeShelfItem', () => {
  it('places onto an empty slot', () => {
    const shelf = createShelf({ name: 'A', cols: 3, rows: 2 });
    ensureVnAndOwned('v1', 'r1');
    placeShelfItem({ shelfId: shelf.id, row: 0, col: 0, vnId: 'v1', releaseId: 'r1' });
    const slots = listShelfSlots(shelf.id);
    expect(slots).toHaveLength(1);
    expect(slots[0]).toMatchObject({ vn_id: 'v1', release_id: 'r1', row: 0, col: 0 });
  });

  it('moves an existing placement to a new slot (no swap)', () => {
    const shelf = createShelf({ name: 'A', cols: 3, rows: 2 });
    ensureVnAndOwned('v1', 'r1');
    placeShelfItem({ shelfId: shelf.id, row: 0, col: 0, vnId: 'v1', releaseId: 'r1' });
    const res = placeShelfItem({ shelfId: shelf.id, row: 1, col: 2, vnId: 'v1', releaseId: 'r1' });
    expect(res.swapped).toBeNull();
    const slots = listShelfSlots(shelf.id);
    expect(slots).toHaveLength(1);
    expect(slots[0]).toMatchObject({ row: 1, col: 2 });
  });

  it('swaps two items when both are placed', () => {
    const shelf = createShelf({ name: 'A', cols: 3, rows: 2 });
    ensureVnAndOwned('v1', 'r1');
    ensureVnAndOwned('v2', 'r2');
    placeShelfItem({ shelfId: shelf.id, row: 0, col: 0, vnId: 'v1', releaseId: 'r1' });
    placeShelfItem({ shelfId: shelf.id, row: 1, col: 1, vnId: 'v2', releaseId: 'r2' });
    const res = placeShelfItem({ shelfId: shelf.id, row: 1, col: 1, vnId: 'v1', releaseId: 'r1' });
    expect(res.swapped).toEqual({ vn_id: 'v2', release_id: 'r2', row: 0, col: 0 });
    const slots = listShelfSlots(shelf.id);
    expect(slots).toHaveLength(2);
    const byKey = new Map(slots.map((s) => [`${s.row}:${s.col}`, s.vn_id]));
    expect(byKey.get('0:0')).toBe('v2');
    expect(byKey.get('1:1')).toBe('v1');
  });

  it('evicts a pool-sourced placement onto an occupied cell back to the pool', () => {
    const shelf = createShelf({ name: 'A', cols: 3, rows: 2 });
    ensureVnAndOwned('v1', 'r1');
    ensureVnAndOwned('v2', 'r2');
    placeShelfItem({ shelfId: shelf.id, row: 0, col: 0, vnId: 'v1', releaseId: 'r1' });
    // v2 came from the pool — no prior slot — so dropping onto v1's cell
    // should kick v1 out.
    placeShelfItem({ shelfId: shelf.id, row: 0, col: 0, vnId: 'v2', releaseId: 'r2' });
    const slots = listShelfSlots(shelf.id);
    expect(slots).toHaveLength(1);
    expect(slots[0]).toMatchObject({ vn_id: 'v2', row: 0, col: 0 });
    const unplaced = listUnplacedOwnedReleases();
    expect(unplaced.map((u) => u.vn_id)).toContain('v1');
  });

  it('rejects out-of-bounds row/col', () => {
    const shelf = createShelf({ name: 'A', cols: 2, rows: 2 });
    ensureVnAndOwned('v1', 'r1');
    expect(() =>
      placeShelfItem({ shelfId: shelf.id, row: 5, col: 0, vnId: 'v1', releaseId: 'r1' }),
    ).toThrow(/row out of bounds/);
    expect(() =>
      placeShelfItem({ shelfId: shelf.id, row: 0, col: 5, vnId: 'v1', releaseId: 'r1' }),
    ).toThrow(/col out of bounds/);
  });

  it('rejects placement of a non-owned edition', () => {
    const shelf = createShelf({ name: 'A', cols: 2, rows: 2 });
    expect(() =>
      placeShelfItem({ shelfId: shelf.id, row: 0, col: 0, vnId: 'v999', releaseId: 'r999' }),
    ).toThrow(/owned edition not found/);
  });

  it('rejects non-integer row/col/shelfId', () => {
    const shelf = createShelf({ name: 'A', cols: 2, rows: 2 });
    ensureVnAndOwned('v1', 'r1');
    expect(() =>
      placeShelfItem({ shelfId: shelf.id, row: NaN, col: 0, vnId: 'v1', releaseId: 'r1' }),
    ).toThrow(/integers/);
    expect(() =>
      placeShelfItem({ shelfId: shelf.id, row: 1.5, col: 0, vnId: 'v1', releaseId: 'r1' }),
    ).toThrow(/integers/);
    expect(() =>
      placeShelfItem({ shelfId: NaN, row: 0, col: 0, vnId: 'v1', releaseId: 'r1' }),
    ).toThrow(/integer/);
  });

  it('places a synthetic release id (used by EGS-only VNs)', () => {
    const shelf = createShelf({ name: 'A', cols: 2, rows: 2 });
    // Synthetic release ids contain a colon — the only release shape
    // for VNs that have no VNDB release row. Regression test for the
    // drag-id delimiter collision (DnD ids switched to `|`).
    ensureVnAndOwned('v42', 'synthetic:v42');
    placeShelfItem({
      shelfId: shelf.id,
      row: 0,
      col: 1,
      vnId: 'v42',
      releaseId: 'synthetic:v42',
    });
    const slots = listShelfSlots(shelf.id);
    expect(slots).toHaveLength(1);
    expect(slots[0].release_id).toBe('synthetic:v42');
  });
});

describe('resizeShelf', () => {
  it('returns evicted slots when shrinking past placed items', () => {
    const shelf = createShelf({ name: 'A', cols: 4, rows: 4 });
    ensureVnAndOwned('v1', 'r1');
    ensureVnAndOwned('v2', 'r2');
    placeShelfItem({ shelfId: shelf.id, row: 3, col: 3, vnId: 'v1', releaseId: 'r1' });
    placeShelfItem({ shelfId: shelf.id, row: 0, col: 0, vnId: 'v2', releaseId: 'r2' });
    const r = resizeShelf(shelf.id, 2, 2);
    expect(r?.shelf.cols).toBe(2);
    expect(r?.shelf.rows).toBe(2);
    expect(r?.evicted).toHaveLength(1);
    expect(r?.evicted[0]).toMatchObject({ vn_id: 'v1', row: 3, col: 3 });
    const slots = listShelfSlots(shelf.id);
    expect(slots).toHaveLength(1);
    expect(slots[0].vn_id).toBe('v2');
    expect(listUnplacedOwnedReleases().map((u) => u.vn_id)).toContain('v1');
  });

  it('no eviction when growing', () => {
    const shelf = createShelf({ name: 'A', cols: 2, rows: 2 });
    ensureVnAndOwned('v1', 'r1');
    placeShelfItem({ shelfId: shelf.id, row: 1, col: 1, vnId: 'v1', releaseId: 'r1' });
    const r = resizeShelf(shelf.id, 6, 8);
    expect(r?.evicted).toEqual([]);
    expect(r?.shelf.cols).toBe(6);
    expect(r?.shelf.rows).toBe(8);
  });
});

describe('placement lookup + unplace', () => {
  it('returns the shelf/row/col for a placed edition', () => {
    const shelf = createShelf({ name: 'A' });
    ensureVnAndOwned('v1', 'r1');
    placeShelfItem({ shelfId: shelf.id, row: 2, col: 3, vnId: 'v1', releaseId: 'r1' });
    const where = getShelfPlacementForEdition('v1', 'r1');
    expect(where).toMatchObject({ kind: 'cell', shelf_id: shelf.id, row: 2, col: 3, shelf_name: 'A' });
  });

  it('unplaces and returns the edition to the pool', () => {
    const shelf = createShelf({ name: 'A' });
    ensureVnAndOwned('v1', 'r1');
    placeShelfItem({ shelfId: shelf.id, row: 0, col: 0, vnId: 'v1', releaseId: 'r1' });
    expect(removeShelfPlacement('v1', 'r1')).toBe(true);
    expect(listShelfSlots(shelf.id)).toEqual([]);
    expect(getShelfPlacementForEdition('v1', 'r1')).toBeNull();
    expect(listUnplacedOwnedReleases().map((u) => u.vn_id)).toContain('v1');
  });
});

describe('front-display slots', () => {
  it('places an edition into a front-display slot', () => {
    const shelf = createShelf({ name: 'A', cols: 4, rows: 3 });
    ensureVnAndOwned('v1', 'r1');
    placeShelfDisplayItem({ shelfId: shelf.id, afterRow: 1, position: 0, vnId: 'v1', releaseId: 'r1' });
    const slots = listShelfDisplaySlots(shelf.id);
    expect(slots).toHaveLength(1);
    expect(slots[0]).toMatchObject({ vn_id: 'v1', release_id: 'r1', after_row: 1, position: 0 });
  });

  it('rejects out-of-bounds after_row / position', () => {
    const shelf = createShelf({ name: 'A', cols: 4, rows: 3 });
    ensureVnAndOwned('v1', 'r1');
    // after_row may be 0..rows inclusive (so "after the last row" is
    // shelf.rows). Anything else is rejected.
    expect(() =>
      placeShelfDisplayItem({ shelfId: shelf.id, afterRow: -1, position: 0, vnId: 'v1', releaseId: 'r1' }),
    ).toThrow(/after_row/);
    expect(() =>
      placeShelfDisplayItem({ shelfId: shelf.id, afterRow: shelf.rows + 1, position: 0, vnId: 'v1', releaseId: 'r1' }),
    ).toThrow(/after_row/);
    expect(() =>
      placeShelfDisplayItem({ shelfId: shelf.id, afterRow: 0, position: shelf.cols, vnId: 'v1', releaseId: 'r1' }),
    ).toThrow(/position/);
  });

  it('moving from a cell to a display slot removes the cell placement', () => {
    const shelf = createShelf({ name: 'A', cols: 4, rows: 3 });
    ensureVnAndOwned('v1', 'r1');
    placeShelfItem({ shelfId: shelf.id, row: 0, col: 0, vnId: 'v1', releaseId: 'r1' });
    expect(listShelfSlots(shelf.id)).toHaveLength(1);
    placeShelfDisplayItem({ shelfId: shelf.id, afterRow: 1, position: 1, vnId: 'v1', releaseId: 'r1' });
    // The cell row must be gone — no double-placement allowed.
    expect(listShelfSlots(shelf.id)).toEqual([]);
    expect(listShelfDisplaySlots(shelf.id)).toHaveLength(1);
  });

  it('moving from a display slot to a cell removes the display placement', () => {
    const shelf = createShelf({ name: 'A', cols: 4, rows: 3 });
    ensureVnAndOwned('v1', 'r1');
    placeShelfDisplayItem({ shelfId: shelf.id, afterRow: 0, position: 0, vnId: 'v1', releaseId: 'r1' });
    placeShelfItem({ shelfId: shelf.id, row: 2, col: 2, vnId: 'v1', releaseId: 'r1' });
    expect(listShelfDisplaySlots(shelf.id)).toEqual([]);
    expect(listShelfSlots(shelf.id)).toHaveLength(1);
  });

  it('evicts a previous occupant of the same display slot back to the pool', () => {
    const shelf = createShelf({ name: 'A', cols: 4, rows: 3 });
    ensureVnAndOwned('v1', 'r1');
    ensureVnAndOwned('v2', 'r2');
    placeShelfDisplayItem({ shelfId: shelf.id, afterRow: 1, position: 1, vnId: 'v1', releaseId: 'r1' });
    placeShelfDisplayItem({ shelfId: shelf.id, afterRow: 1, position: 1, vnId: 'v2', releaseId: 'r2' });
    const slots = listShelfDisplaySlots(shelf.id);
    expect(slots).toHaveLength(1);
    expect(slots[0].vn_id).toBe('v2');
    expect(listUnplacedOwnedReleases().map((u) => u.vn_id)).toContain('v1');
  });

  it('removeShelfDisplayPlacement returns the edition to the unplaced pool', () => {
    const shelf = createShelf({ name: 'A', cols: 4, rows: 3 });
    ensureVnAndOwned('v1', 'r1');
    placeShelfDisplayItem({ shelfId: shelf.id, afterRow: 0, position: 0, vnId: 'v1', releaseId: 'r1' });
    expect(removeShelfDisplayPlacement('v1', 'r1')).toBe(true);
    expect(listShelfDisplaySlots(shelf.id)).toEqual([]);
    expect(listUnplacedOwnedReleases().map((u) => u.vn_id)).toContain('v1');
  });

  it('removeShelfPlacement covers both kinds (cell and display)', () => {
    const shelf = createShelf({ name: 'A', cols: 4, rows: 3 });
    ensureVnAndOwned('v1', 'r1');
    placeShelfDisplayItem({ shelfId: shelf.id, afterRow: 1, position: 0, vnId: 'v1', releaseId: 'r1' });
    expect(removeShelfPlacement('v1', 'r1')).toBe(true);
    expect(getShelfPlacementForEdition('v1', 'r1')).toBeNull();
  });

  it('getShelfPlacementForEdition returns the display placement when applicable', () => {
    const shelf = createShelf({ name: 'A', cols: 4, rows: 3 });
    ensureVnAndOwned('v1', 'r1');
    placeShelfDisplayItem({ shelfId: shelf.id, afterRow: 2, position: 1, vnId: 'v1', releaseId: 'r1' });
    const where = getShelfPlacementForEdition('v1', 'r1');
    expect(where).toMatchObject({
      kind: 'display',
      shelf_id: shelf.id,
      shelf_name: 'A',
      after_row: 2,
      position: 1,
    });
  });

  it('listShelves counts display slots as placed editions', () => {
    const shelf = createShelf({ name: 'A', cols: 4, rows: 3 });
    ensureVnAndOwned('v1', 'r1');
    placeShelfDisplayItem({ shelfId: shelf.id, afterRow: 2, position: 1, vnId: 'v1', releaseId: 'r1' });
    const listed = listShelves().find((s) => s.id === shelf.id);
    expect(listed?.placed_count).toBe(1);
  });

  it('resize evicts out-of-bounds display slots back to the pool', () => {
    const shelf = createShelf({ name: 'A', cols: 4, rows: 3 });
    ensureVnAndOwned('v1', 'r1');
    ensureVnAndOwned('v2', 'r2');
    placeShelfDisplayItem({ shelfId: shelf.id, afterRow: 3, position: 0, vnId: 'v1', releaseId: 'r1' });
    placeShelfDisplayItem({ shelfId: shelf.id, afterRow: 1, position: 3, vnId: 'v2', releaseId: 'r2' });
    const resized = resizeShelf(shelf.id, 2, 2);
    expect(resized?.evicted.map((e) => e.vn_id).sort()).toEqual(['v1', 'v2']);
    expect(listShelfDisplaySlots(shelf.id)).toEqual([]);
    expect(listUnplacedOwnedReleases().map((u) => u.vn_id).sort()).toEqual(['v1', 'v2']);
  });

  it('listUnplacedOwnedReleases returns one entry per distinct (vn_id, release_id)', () => {
    // Regression: a user with two owned editions of the same VN
    // must see two pool cards, each tied to its own release_id.
    // The popover then reads release-specific fields off the
    // entry — no "all editions" aggregation. We seed two editions
    // with different release ids + distinguishing fields and
    // assert the helper returns each as a separate entry that
    // carries its own platform/release/etc fields.
    const shelf = createShelf({ name: 'A', cols: 2, rows: 2 });
    // Seed the VN with platforms + languages + released so the
    // ShelfEntry shape includes the popover's release-side fields.
    db.prepare(
      `INSERT OR REPLACE INTO vn (id, title, platforms, languages, released, fetched_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run('v90201', 'v90201', JSON.stringify(['win']), JSON.stringify(['ja']), '2024-01-15', Date.now());
    // Two distinct owned editions with different release ids.
    db.prepare(
      `INSERT INTO owned_release
         (vn_id, release_id, edition_label, condition, box_type,
          physical_location, dumped, added_at)
       VALUES
         (?, ?, ?, ?, ?, ?, ?, ?),
         (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      'v90201', 'r902011', 'Box', 'sealed', 'large',  JSON.stringify(['Shelf A']), 0, Date.now(),
      'v90201', 'r902012', 'DL',  'good',   'none',   JSON.stringify([]),          1, Date.now(),
    );
    void shelf;
    const unplaced = listUnplacedOwnedReleases().filter((e) => e.vn_id === 'v90201');
    expect(unplaced).toHaveLength(2);
    const byReleaseId = new Map(unplaced.map((e) => [e.release_id, e]));
    const a = byReleaseId.get('r902011')!;
    const b = byReleaseId.get('r902012')!;
    expect(a).toBeDefined();
    expect(b).toBeDefined();
    // Each entry carries its OWN release-side fields, not an aggregate.
    expect(a.edition_label).toBe('Box');
    expect(a.condition).toBe('sealed');
    expect(a.box_type).toBe('large');
    expect(a.physical_location).toEqual(['Shelf A']);
    expect(a.dumped).toBe(false);
    expect(b.edition_label).toBe('DL');
    expect(b.condition).toBe('good');
    expect(b.box_type).toBe('none');
    expect(b.physical_location).toEqual([]);
    expect(b.dumped).toBe(true);
    // VN-side fields are shared (they really are VN-level on VNDB).
    expect(a.vn_platforms).toEqual(['win']);
    expect(b.vn_platforms).toEqual(['win']);
    expect(a.vn_languages).toEqual(['ja']);
    expect(a.vn_released).toBe('2024-01-15');
  });

  it('listAllOwnedReleases counts placed editions for the /shelf header', () => {
    // Regression: the /shelf page header summary reads
    // `items.length` and `itemBuckets.size` from
    // listAllOwnedReleases() across every view. A previous
    // optimisation early-returned [] in spatial view, which
    // made the user-visible counter say "0 éditions · 0 VN
    // uniques" even when editions were placed on shelves.
    // The header must show the real counts regardless of view.
    const shelf = createShelf({ name: 'A', cols: 4, rows: 3 });
    ensureVnAndOwned('v1', 'r1');
    ensureVnAndOwned('v1', 'r2', 'v1'); // same VN, second edition
    ensureVnAndOwned('v2', 'r3');
    placeShelfItem({ shelfId: shelf.id, row: 0, col: 0, vnId: 'v1', releaseId: 'r1' });
    placeShelfItem({ shelfId: shelf.id, row: 0, col: 1, vnId: 'v2', releaseId: 'r3' });
    // v1/r2 stays in the unplaced pool.
    const all = listAllOwnedReleases();
    expect(all).toHaveLength(3);
    expect(new Set(all.map((e) => e.vn_id))).toEqual(new Set(['v1', 'v2']));
    // The placed-vs-unplaced split is internal — the header
    // counter is meant to be a holistic "you own N editions"
    // number that does not vanish when the user is on the
    // spatial view.
  });
});
