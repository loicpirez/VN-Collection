import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  clientQuery: vi.fn(),
  postgresQuery: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock('@/lib/db/postgres', () => ({
  postgresQuery: mocks.postgresQuery,
  withPostgresTransaction: mocks.transaction,
}));

import { createPostgresShelfRepository } from '@/lib/db/repositories/shelf';

const shelf = {
  id: 1,
  name: 'Shelf',
  cols: 3,
  rows: 2,
  order_index: 0,
  created_at: 1,
  updated_at: 1,
};

function visualRow(overrides: Record<string, string | number | null> = {}) {
  return {
    vn_id: 'v90001',
    release_id: 'r90001',
    notes: null,
    location: 'unknown',
    physical_location: null,
    box_type: 'none',
    edition_label: null,
    condition: null,
    price_paid: null,
    currency: null,
    acquired_date: null,
    owned_platform: null,
    dumped: 0,
    added_at: 1,
    vn_title: 'Title',
    vn_image_thumb: null,
    vn_image_url: null,
    vn_local_image_thumb: null,
    vn_image_sexual: null,
    vn_release_images: null,
    vn_platforms: null,
    vn_languages: null,
    vn_released: null,
    rel_title: null,
    rel_platforms: null,
    rel_languages: null,
    rel_released: null,
    rel_resolution: null,
    rel_minage: null,
    rel_patch: null,
    rel_freeware: null,
    rel_official: null,
    rel_has_ero: null,
    bundle_id: null,
    bundle_name: null,
    bundle_member_count: null,
    ...overrides,
  };
}

function placementImplementation(options: {
  shelf?: typeof shelf | null;
  owned?: boolean;
  bundle?: { anchor_vn_id: string; anchor_release_id: string } | null;
  prior?: { shelf_id: number; shelf_name: string; row: number; col: number } | null;
  occupant?: { vn_id: string; release_id: string } | null;
}) {
  return async (sql: string) => {
    if (sql.includes('FROM shelf_unit WHERE')) return { rows: options.shelf === null ? [] : [options.shelf ?? shelf], rowCount: 1 };
    if (sql.includes('SELECT 1 AS exists FROM owned_release')) return { rows: options.owned === false ? [] : [{ exists: 1 }], rowCount: 1 };
    if (sql.includes('FROM physical_bundle_member member')) return { rows: options.bundle ? [options.bundle] : [], rowCount: 1 };
    if (sql.includes('FROM shelf_slot slot JOIN shelf_unit') && sql.includes('FOR UPDATE')) {
      return { rows: options.prior ? [options.prior] : [], rowCount: 1 };
    }
    if (sql.includes('WHERE shelf_id = $1 AND row = $2 AND col = $3 FOR UPDATE')) {
      return { rows: options.occupant ? [options.occupant] : [], rowCount: 1 };
    }
    return { rows: [], rowCount: 1 };
  };
}

describe('PostgreSQL shelf branch behavior', () => {
  beforeEach(() => {
    vi.useRealTimers();
    mocks.clientQuery.mockReset().mockResolvedValue({ rows: [], rowCount: 1 });
    mocks.postgresQuery.mockReset().mockResolvedValue({ rows: [], rowCount: 0 });
    mocks.transaction.mockReset().mockImplementation(async (callback) => callback({ query: mocks.clientQuery }));
  });

  it('reads, validates names, and resizes with bounded dimensions', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(100);
    const repository = createPostgresShelfRepository();
    mocks.postgresQuery
      .mockResolvedValueOnce({ rows: [shelf], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({ rows: [shelf], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 });

    await expect(repository.get(1)).resolves.toBe(shelf);
    await expect(repository.get(2)).resolves.toBeNull();
    await expect(repository.rename(1, ' Renamed ')).resolves.toBe(shelf);
    await expect(repository.rename(2, 'Missing')).resolves.toBeNull();
    await expect(repository.rename(1, '   ')).rejects.toThrow('shelf name required');

    mocks.clientQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM shelf_unit WHERE')) return { rows: [shelf], rowCount: 1 };
      if (sql.includes('SELECT vn_id, release_id, row, col')) return { rows: [{ vn_id: 'v1', release_id: 'r1', row: 1, col: 2 }], rowCount: 1 };
      if (sql.includes('SELECT vn_id, release_id, after_row')) return { rows: [{ vn_id: 'v2', release_id: 'r2', row: 2, col: 1 }], rowCount: 1 };
      if (sql.includes('UPDATE shelf_unit SET cols')) return { rows: [{ ...shelf, cols: 3, rows: 2 }], rowCount: 1 };
      return { rows: [], rowCount: 1 };
    });
    await expect(repository.resize(1, Number.NaN, Number.POSITIVE_INFINITY)).resolves.toEqual({
      shelf: { ...shelf, cols: 3, rows: 2 },
      evicted: [
        { vn_id: 'v1', release_id: 'r1', row: 1, col: 2 },
        { vn_id: 'v2', release_id: 'r2', row: 2, col: 1 },
      ],
    });

    mocks.clientQuery.mockImplementation(async (sql: string) => sql.includes('FROM shelf_unit WHERE')
      ? { rows: [], rowCount: 0 }
      : { rows: [], rowCount: 1 });
    await expect(repository.resize(2, 4, 4)).resolves.toBeNull();
  });

  it('maps release artwork fallbacks, language validation, and bundle defaults', async () => {
    const front = [{ release_id: 'r90001', release_title: 'Front', type: 'pkgfront', url: 'front.jpg', thumbnail: 'front-thumb.jpg', local: 'front-local.jpg', local_thumb: 'front-local-thumb.jpg', sexual: 1 }];
    const side = [{ release_id: 'r90002', release_title: 'Side', type: 'pkgside', url: 'side.jpg', local: 'side-local.jpg' }];
    const content = [{ release_id: 'r90003', release_title: 'Content', type: 'pkgcontent', url: 'content.jpg', thumbnail: 'content-thumb.jpg' }];
    const first = [{ release_id: 'r90004', release_title: 'Back', type: 'pkgback', url: 'back.jpg' }];
    const rows = [
      visualRow({ release_id: 'r90001', vn_release_images: JSON.stringify(front), rel_languages: '[{"lang":"ja"},{"lang":4},null,[]]', bundle_id: 2, bundle_name: 'Bundle', bundle_member_count: null }),
      visualRow({ release_id: 'r90002', vn_release_images: JSON.stringify(side), rel_official: 0 }),
      visualRow({ release_id: 'r90003', vn_release_images: JSON.stringify(content) }),
      visualRow({ release_id: 'r90004', vn_release_images: JSON.stringify(first) }),
      visualRow({ release_id: 'r90005', vn_release_images: 'invalid', rel_languages: 'invalid' }),
    ];
    mocks.postgresQuery
      .mockResolvedValueOnce({ rows })
      .mockResolvedValueOnce({ rows: [rows[0]] });
    const repository = createPostgresShelfRepository();

    const mapped = await repository.listAllOwned();
    expect(mapped[0]).toMatchObject({
      rel_image_thumb: 'front-thumb.jpg', rel_image_url: 'front.jpg',
      rel_local_image_thumb: 'front-local-thumb.jpg', rel_image_sexual: 1,
      rel_languages: ['ja'], bundle_member_count: 0,
    });
    expect(mapped[1]).toMatchObject({ rel_image_thumb: 'side.jpg', rel_local_image_thumb: 'side-local.jpg', rel_official: false });
    expect(mapped[2]?.rel_image_thumb).toBe('content-thumb.jpg');
    expect(mapped[3]?.rel_image_thumb).toBe('back.jpg');
    expect(mapped[4]).toMatchObject({ rel_image_thumb: null, rel_image_url: null, rel_official: true });
    await expect(repository.listUnplaced()).resolves.toHaveLength(1);
  });

  it('maps regular and display slots', async () => {
    const row = visualRow({
      shelf_id: 1, row: 0, col: 1, after_row: 1, position: 2, placed_at: 50,
    });
    mocks.postgresQuery
      .mockResolvedValueOnce({ rows: [row] })
      .mockResolvedValueOnce({ rows: [row] });
    const repository = createPostgresShelfRepository();

    await expect(repository.listSlots(1)).resolves.toEqual([expect.objectContaining({ shelf_id: 1, row: 0, col: 1 })]);
    await expect(repository.listDisplaySlots(1)).resolves.toEqual([
      expect.objectContaining({ shelf_id: 1, after_row: 1, position: 2, placed_at: 50 }),
    ]);
  });

  it('rejects malformed and out-of-bounds regular placements', async () => {
    const repository = createPostgresShelfRepository();
    const input = { shelfId: 1, row: 0, col: 0, vnId: 'v90001', releaseId: 'r90001' };
    await expect(repository.placeItem({ ...input, shelfId: 1.2 })).rejects.toThrow('shelf id must be integer');
    await expect(repository.placeItem({ ...input, row: 0.5 })).rejects.toThrow('row/col must be integers');
    await expect(repository.placeItem({ ...input, col: 0.5 })).rejects.toThrow('row/col must be integers');

    for (const [options, expected] of [
      [{ shelf: null }, 'shelf not found'],
      [{ shelf, owned: true }, 'row out of bounds'],
      [{ shelf, owned: true }, 'col out of bounds'],
      [{ shelf, owned: false }, 'owned edition not found'],
    ] as const) {
      mocks.clientQuery.mockImplementation(placementImplementation(options));
      const invalid = expected.startsWith('row') ? { ...input, row: -1 }
        : expected.startsWith('col') ? { ...input, col: 3 }
          : input;
      await expect(repository.placeItem(invalid)).rejects.toThrow(expected);
    }

    mocks.clientQuery.mockImplementation(placementImplementation({
      shelf,
      owned: true,
      bundle: { anchor_vn_id: 'v90002', anchor_release_id: 'r90002' },
    }));
    await expect(repository.placeItem(input)).rejects.toThrow('bundle members must be placed through the anchor edition');
  });

  it('handles same-cell placement, empty destinations, and swaps', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(200);
    const repository = createPostgresShelfRepository();
    const input = { shelfId: 1, row: 0, col: 0, vnId: 'v90001', releaseId: 'r90001' };

    mocks.clientQuery.mockImplementation(placementImplementation({ shelf, owned: true, occupant: { vn_id: 'v90001', release_id: 'r90001' } }));
    await expect(repository.placeItem(input)).resolves.toEqual({ swapped: null });

    mocks.clientQuery.mockImplementation(placementImplementation({ shelf, owned: true }));
    await expect(repository.placeItem(input)).resolves.toEqual({ swapped: null });

    mocks.clientQuery.mockImplementation(placementImplementation({
      shelf,
      owned: true,
      occupant: { vn_id: 'v90002', release_id: 'r90002' },
    }));
    await expect(repository.placeItem(input)).resolves.toEqual({ swapped: null });

    mocks.clientQuery.mockImplementation(placementImplementation({
      shelf,
      owned: true,
      prior: { shelf_id: 2, shelf_name: 'Other', row: 1, col: 2 },
      occupant: { vn_id: 'v90002', release_id: 'r90002' },
    }));
    await expect(repository.placeItem(input)).resolves.toEqual({
      swapped: { vn_id: 'v90002', release_id: 'r90002', row: 1, col: 2 },
    });
  });

  it('validates and writes display placements', async () => {
    const repository = createPostgresShelfRepository();
    const input = { shelfId: 1, afterRow: 1, position: 0, vnId: 'v90001', releaseId: 'r90001' };
    await expect(repository.placeDisplayItem({ ...input, shelfId: 1.2 })).rejects.toThrow('shelf id must be integer');
    await expect(repository.placeDisplayItem({ ...input, afterRow: 0.5 })).rejects.toThrow('after_row/position must be integers');
    await expect(repository.placeDisplayItem({ ...input, position: 0.5 })).rejects.toThrow('after_row/position must be integers');

    for (const [options, invalid, expected] of [
      [{ shelf: null }, input, 'shelf not found'],
      [{ shelf }, { ...input, afterRow: -1 }, 'after_row out of bounds'],
      [{ shelf }, { ...input, position: 3 }, 'position out of bounds'],
      [{ shelf, owned: false }, input, 'owned edition not found'],
    ] as const) {
      mocks.clientQuery.mockImplementation(placementImplementation(options));
      await expect(repository.placeDisplayItem(invalid)).rejects.toThrow(expected);
    }

    mocks.clientQuery.mockImplementation(placementImplementation({ shelf, owned: true }));
    await expect(repository.placeDisplayItem(input)).resolves.toBeUndefined();
  });

  it('handles placement removal and location variants', async () => {
    const repository = createPostgresShelfRepository();
    mocks.clientQuery
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: null })
      .mockResolvedValueOnce({ rows: [], rowCount: null });
    await expect(repository.removePlacement('v1', 'r1')).resolves.toBe(true);
    await expect(repository.removePlacement('v2', 'r2')).resolves.toBe(true);
    await expect(repository.removePlacement('v3', 'r3')).resolves.toBe(false);

    mocks.postgresQuery
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({ rows: [{ shelf_id: 1, shelf_name: 'Shelf', row: 0, col: 0 }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ shelf_id: 1, shelf_name: 'Shelf', after_row: 1, position: 2 }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });
    await expect(repository.removeDisplayPlacement('v1', 'r1')).resolves.toBe(true);
    await expect(repository.removeDisplayPlacement('v1', 'r1')).resolves.toBe(false);
    await expect(repository.getPlacement('v1', 'r1')).resolves.toMatchObject({ kind: 'cell' });
    await expect(repository.getPlacement('v2', 'r2')).resolves.toMatchObject({ kind: 'display' });
    await expect(repository.getPlacement('v3', 'r3')).resolves.toBeNull();
  });

  it('lists bundle members, empty bundles, and missing bundles', async () => {
    const repository = createPostgresShelfRepository();
    const bundle = { id: 1, name: 'Bundle', anchor_vn_id: 'v1', anchor_release_id: 'r1', created_at: 1, updated_at: 1 };
    mocks.postgresQuery
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [bundle, { ...bundle, id: 2 }] })
      .mockResolvedValueOnce({ rows: [
        { bundle_id: 1, vn_id: 'v1', release_id: 'r1', vn_title: 'One', edition_label: null, position: 0 },
        { bundle_id: 1, vn_id: 'v2', release_id: 'r2', vn_title: 'Two', edition_label: 'Second', position: 1 },
      ] })
      .mockResolvedValueOnce({ rows: [] });

    await expect(repository.listBundles()).resolves.toEqual([]);
    const bundles = await repository.listBundles();
    expect(bundles[0]?.members).toHaveLength(2);
    expect(bundles[1]?.members).toEqual([]);
    await expect(repository.getBundle(99)).resolves.toBeNull();
  });

  it('validates bundle creation ownership and existing membership', async () => {
    const repository = createPostgresShelfRepository();
    const anchor = { vnId: 'v1', releaseId: 'r1' };
    await expect(repository.createBundle({ name: ' ', anchor, members: [anchor, { vnId: 'v2', releaseId: 'r2' }] }))
      .rejects.toThrow('bundle name required');
    await expect(repository.createBundle({ name: 'One', anchor, members: [anchor, anchor] }))
      .rejects.toThrow('bundle requires at least two editions');

    mocks.clientQuery.mockImplementation(async (sql: string) => sql.includes('SELECT 1 AS exists FROM owned_release')
      ? { rows: [], rowCount: 0 }
      : { rows: [], rowCount: 1 });
    await expect(repository.createBundle({ name: 'Missing', anchor, members: [{ vnId: 'v2', releaseId: 'r2' }] }))
      .rejects.toThrow('owned edition not found');

    mocks.clientQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('SELECT 1 AS exists FROM owned_release')) return { rows: [{ exists: 1 }], rowCount: 1 };
      if (sql.includes('SELECT 1 AS exists FROM physical_bundle_member')) return { rows: [{ exists: 1 }], rowCount: 1 };
      return { rows: [], rowCount: 1 };
    });
    await expect(repository.createBundle({ name: 'Existing', anchor, members: [anchor, { vnId: 'v2', releaseId: 'r2' }] }))
      .rejects.toThrow('edition already belongs to a bundle');
  });

  it('creates, renames, and deletes bundles through all result branches', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(300);
    const repository = createPostgresShelfRepository();
    const anchor = { vnId: 'v1', releaseId: 'r1' };
    const member = { vnId: 'v2', releaseId: 'r2' };
    mocks.clientQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('SELECT 1 AS exists FROM owned_release')) return { rows: [{ exists: 1 }], rowCount: 1 };
      if (sql.includes('SELECT 1 AS exists FROM physical_bundle_member')) return { rows: [], rowCount: 0 };
      if (sql.includes('INSERT INTO physical_bundle\n')) return { rows: [{ id: 5 }], rowCount: 1 };
      return { rows: [], rowCount: 1 };
    });
    const bundle = { id: 5, name: 'Created', anchor_vn_id: 'v1', anchor_release_id: 'r1', created_at: 300, updated_at: 300 };
    mocks.postgresQuery
      .mockResolvedValueOnce({ rows: [bundle] })
      .mockResolvedValueOnce({ rows: [
        { bundle_id: 5, vn_id: 'v1', release_id: 'r1', vn_title: 'One', edition_label: null, position: 0 },
        { bundle_id: 5, vn_id: 'v2', release_id: 'r2', vn_title: 'Two', edition_label: null, position: 1 },
      ] });
    await expect(repository.createBundle({ name: ' Created ', anchor, members: [member] })).resolves.toMatchObject({ id: 5, members: expect.any(Array) });
    expect(mocks.clientQuery.mock.calls.filter(([sql]) => String(sql).startsWith('DELETE FROM shelf_'))).toHaveLength(2);

    await expect(repository.renameBundle(5, ' ')).rejects.toThrow('bundle name required');
    mocks.postgresQuery
      .mockResolvedValueOnce({ rows: [], rowCount: null })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [bundle] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 });
    await expect(repository.renameBundle(5, 'A')).resolves.toBeNull();
    await expect(repository.renameBundle(5, 'B')).resolves.toBeNull();
    await expect(repository.renameBundle(5, 'C')).resolves.toMatchObject({ id: 5 });
    await expect(repository.deleteBundle(5)).resolves.toBe(true);
    await expect(repository.deleteBundle(5)).resolves.toBe(false);
  });
});
