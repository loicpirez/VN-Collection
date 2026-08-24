import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  clientQuery: vi.fn(),
  postgresQuery: vi.fn(),
  transaction: vi.fn(),
  readConfig: vi.fn(),
  getOwned: vi.fn(),
  listOwned: vi.fn(),
  listWithShelf: vi.fn(),
  markOwned: vi.fn(),
  updateOwned: vi.fn(),
  unmarkOwned: vi.fn(),
  setAspect: vi.fn(),
  upsertResolution: vi.fn(),
  sqliteTransaction: vi.fn(),
}));

vi.mock('@/lib/db/postgres', () => ({
  postgresQuery: mocks.postgresQuery,
  withPostgresTransaction: mocks.transaction,
}));
vi.mock('@/lib/db/postgres-config', () => ({ readDatabaseConfig: mocks.readConfig }));
vi.mock('@/lib/db', () => ({
  getOwnedRelease: mocks.getOwned,
  listOwnedReleasesForVn: mocks.listOwned,
  listOwnedReleasesWithShelfForVn: mocks.listWithShelf,
  markReleaseOwned: mocks.markOwned,
  updateOwnedRelease: mocks.updateOwned,
  unmarkReleaseOwned: mocks.unmarkOwned,
  setOwnedReleaseAspectOverride: mocks.setAspect,
  upsertReleaseResolutionCache: mocks.upsertResolution,
  db: { transaction: mocks.sqliteTransaction },
}));

import {
  createPostgresOwnedReleaseRepository,
  getOwnedReleaseRepository,
} from '@/lib/db/repositories/owned-release';

function ownedRow(overrides: Record<string, string | number | null> = {}) {
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
    added_at: 100,
    ...overrides,
  };
}

function shelfRow(overrides: Record<string, string | number | null> = {}) {
  return {
    ...ownedRow(),
    shelf_id: null,
    shelf_row: null,
    shelf_col: null,
    shelf_name: null,
    display_shelf_id: null,
    display_after_row: null,
    display_position: null,
    display_shelf_name: null,
    override_width: null,
    override_height: null,
    override_aspect: null,
    override_note: null,
    cache_width: null,
    cache_height: null,
    cache_raw: null,
    cache_aspect: null,
    rel_platforms: null,
    ...overrides,
  };
}

describe('owned-release repository', () => {
  beforeEach(() => {
    vi.useRealTimers();
    mocks.clientQuery.mockReset().mockResolvedValue({ rows: [], rowCount: 1 });
    mocks.postgresQuery.mockReset().mockResolvedValue({ rows: [], rowCount: 0 });
    mocks.transaction.mockReset().mockImplementation(async (callback) => callback({ query: mocks.clientQuery }));
    mocks.readConfig.mockReset().mockReturnValue({ backend: 'postgres' });
    mocks.sqliteTransaction.mockReset().mockImplementation((callback) => callback);
    for (const mock of [
      mocks.getOwned,
      mocks.listOwned,
      mocks.listWithShelf,
      mocks.markOwned,
      mocks.updateOwned,
      mocks.unmarkOwned,
      mocks.setAspect,
      mocks.upsertResolution,
    ]) mock.mockReset();
  });

  it('reads and maps owned editions', async () => {
    const row = ownedRow({ physical_location: '["Shelf A"]', dumped: 1 });
    mocks.postgresQuery
      .mockResolvedValueOnce({ rows: [row], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({ rows: [row, ownedRow({ release_id: 'r90002' })], rowCount: 2 });
    const repository = createPostgresOwnedReleaseRepository();

    await expect(repository.get('v90001', 'r90001')).resolves.toMatchObject({
      physical_location: ['Shelf A'],
      dumped: true,
    });
    await expect(repository.get('v90001', 'r90003')).resolves.toBeNull();
    await expect(repository.listForVn('v90001')).resolves.toHaveLength(2);
  });

  it('maps cell, display, absent shelf, and aspect provenance branches', async () => {
    mocks.postgresQuery.mockResolvedValueOnce({
      rows: [
        shelfRow({
          release_id: 'r90001', shelf_id: 1, shelf_row: 2, shelf_col: 3, shelf_name: 'Main',
          override_width: 800, override_height: 600, override_aspect: '4:3', override_note: 'Manual',
          rel_platforms: '["win",4]',
        }),
        shelfRow({
          release_id: 'r90002', display_shelf_id: 2, display_after_row: 1,
          display_position: 4, display_shelf_name: 'Display', cache_width: 1920,
          cache_height: 1080, cache_raw: '1920x1080', cache_aspect: '16:9',
        }),
        shelfRow({ release_id: 'r90003', shelf_id: 1, cache_aspect: 'unknown', cache_raw: 'bad' }),
        shelfRow({ release_id: 'r90004', shelf_id: 1, shelf_row: 2 }),
        shelfRow({ release_id: 'r90005', shelf_id: 1, shelf_row: 2, shelf_col: 3 }),
        shelfRow({ release_id: 'r90006', display_shelf_id: 2 }),
        shelfRow({ release_id: 'r90007', display_shelf_id: 2, display_after_row: 1 }),
        shelfRow({ release_id: 'r90008', display_shelf_id: 2, display_after_row: 1, display_position: 3 }),
        shelfRow({ release_id: 'r90009', cache_aspect: 'invalid', rel_platforms: 'invalid' }),
      ],
      rowCount: 9,
    });

    const rows = await createPostgresOwnedReleaseRepository().listWithShelfForVn('v90001');
    expect(rows[0]).toMatchObject({
      rel_platforms: ['win'],
      shelf: { kind: 'cell', id: 1, row: 2, col: 3 },
      aspect: { source: 'manual', aspect_key: '4:3' },
    });
    expect(rows[1]).toMatchObject({
      shelf: { kind: 'display', id: 2, afterRow: 1, position: 4 },
      aspect: { source: 'vndb', aspect_key: '16:9' },
    });
    expect(rows.slice(2).every((row) => row.shelf === null)).toBe(true);
    expect(rows[2]?.aspect).toMatchObject({ source: 'unknown', raw_resolution: 'bad' });
    expect(rows[8]?.rel_platforms).toEqual([]);
  });

  it('creates default and complete editions and rebuilds physical places', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1000);
    const repository = createPostgresOwnedReleaseRepository();
    mocks.clientQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('FOR UPDATE')) return { rows: [], rowCount: 0 };
      if (sql.includes('FROM collection WHERE')) return { rows: [{ physical_location: '["Shelf A"]' }], rowCount: 1 };
      if (sql.includes('FROM owned_release WHERE') && sql.includes('physical_location')) {
        return { rows: [{ physical_location: 'Shelf B, Shelf A' }], rowCount: 1 };
      }
      return { rows: [], rowCount: 1 };
    });

    await repository.mark('v90001', 'r90001');
    const firstInsert = mocks.clientQuery.mock.calls.find(([sql]) => String(sql).includes('INSERT INTO owned_release ('));
    expect(firstInsert?.[1]).toEqual([
      'v90001', 'r90001', null, 'unknown', null, 'none', null, null, null, null,
      null, null, null, 0, 1000,
    ]);
    expect(mocks.clientQuery.mock.calls.some(([sql]) => String(sql).includes('UPDATE owned_release SET owned_platform'))).toBe(true);
    expect(mocks.clientQuery.mock.calls.filter(([sql]) => String(sql).includes('INSERT INTO collection_place_index'))
      .map((call) => call[1]?.[1])).toEqual(['Shelf A', 'Shelf B']);

    mocks.clientQuery.mockClear();
    await repository.mark('v90001', 'r90002', {
      notes: 'Notes', location: 'jp', physical_location: ['Cabinet'], box_type: 'dvd',
      edition_label: 'Limited', condition: 'good', price_paid: 1200, currency: 'JPY',
      acquired_date: '2026-01-02', purchase_place: 'Shop', owned_platform: 'win', dumped: true,
    });
    const secondInsert = mocks.clientQuery.mock.calls.find(([sql]) => String(sql).includes('INSERT INTO owned_release ('));
    expect(secondInsert?.[1]?.slice(2, 14)).toEqual([
      'Notes', 'jp', '["Cabinet"]', 'dvd', 'Limited', 'good', 1200, 'JPY',
      '2026-01-02', 'Shop', 'win', 1,
    ]);
    expect(mocks.clientQuery.mock.calls.some(([sql]) => String(sql).includes('UPDATE owned_release SET owned_platform'))).toBe(false);
  });

  it('updates complete patches, existing marks, and empty patches', async () => {
    const repository = createPostgresOwnedReleaseRepository();
    mocks.clientQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('FOR UPDATE')) return { rows: [{ exists: 1 }], rowCount: 1 };
      return { rows: [], rowCount: 1 };
    });
    const patch = {
      notes: null, location: 'en', physical_location: [], box_type: 'case', edition_label: null,
      condition: null, price_paid: null, currency: null, acquired_date: null,
      purchase_place: null, owned_platform: null, dumped: false,
    };

    await repository.mark('v90001', 'r90001', patch);
    await repository.update('v90001', 'r90001', patch);
    const updates = mocks.clientQuery.mock.calls.filter(([sql]) => String(sql).startsWith('UPDATE owned_release SET'));
    expect(updates).toHaveLength(2);
    expect(updates[0]?.[1]?.slice(0, 12)).toEqual([
      null, 'en', null, 'case', null, null, null, null, null, null, null, 0,
    ]);

    mocks.clientQuery.mockClear();
    await repository.update('v90001', 'r90001', {});
    await repository.updateWithAspect('v90001', 'r90001', {}, undefined);
    expect(mocks.clientQuery).not.toHaveBeenCalled();
  });

  it('sets, derives, clears, and validates aspect overrides', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(2000);
    const repository = createPostgresOwnedReleaseRepository();
    mocks.clientQuery.mockImplementation(async (sql: string) => sql.includes('SELECT 1 AS exists')
      ? { rows: [{ exists: 1 }], rowCount: 1 }
      : { rows: [], rowCount: 1 });

    await repository.setAspectOverride('v90001', 'r90001', { width: 800.4, height: 600.4, note: ' Source ' });
    await repository.setAspectOverride('v90001', 'r90001', { aspectKey: '16:10', note: '   ' });
    await repository.setAspectOverride('v90001', 'r90001', { aspectKey: 'unknown' });
    await repository.setAspectOverride('v90001', 'r90001', null);
    const inserts = mocks.clientQuery.mock.calls.filter(([sql]) => String(sql).includes('INSERT INTO owned_release_aspect_override'));
    expect(inserts[0]?.[1]).toEqual(['v90001', 'r90001', 800, 600, '4:3', 'Source', 2000]);
    expect(inserts[1]?.[1]).toEqual(['v90001', 'r90001', null, null, '16:10', null, 2000]);
    expect(mocks.clientQuery.mock.calls.filter(([sql]) => String(sql).startsWith('DELETE FROM owned_release_aspect_override'))).toHaveLength(2);

    mocks.clientQuery.mockImplementation(async (sql: string) => sql.includes('SELECT 1 AS exists')
      ? { rows: [], rowCount: 0 }
      : { rows: [], rowCount: 1 });
    await expect(repository.setAspectOverride('v90001', 'r90002', { aspectKey: '4:3' }))
      .rejects.toThrow('owned edition not found');
  });

  it('updates aspect state atomically and rebuilds places after removal', async () => {
    const repository = createPostgresOwnedReleaseRepository();
    mocks.clientQuery.mockImplementation(async (sql: string) => sql.includes('SELECT 1 AS exists')
      ? { rows: [{ exists: 1 }], rowCount: 1 }
      : { rows: [], rowCount: 1 });

    await repository.updateWithAspect('v90001', 'r90001', { notes: 'Updated' }, null);
    await repository.remove('v90001', 'r90001');
    expect(mocks.clientQuery.mock.calls.some(([sql]) => String(sql).startsWith('DELETE FROM owned_release WHERE'))).toBe(true);
    expect(mocks.clientQuery.mock.calls.some(([sql]) => String(sql).startsWith('DELETE FROM collection_place_index'))).toBe(true);
  });

  it('normalizes every release-resolution cache input shape', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(3000);
    const repository = createPostgresOwnedReleaseRepository();

    await repository.upsertResolutionCache({ releaseId: 'r90001', vnId: 'v90001', resolution: '1280x720', fetchedAt: 10 });
    await repository.upsertResolutionCache({ releaseId: 'r90002', resolution: [800, 600] });
    await repository.upsertResolutionCache({ releaseId: 'r90003', resolution: null });
    await repository.upsertResolutionCache({ releaseId: 'r90004', resolution: { width: 1 } });
    expect(mocks.postgresQuery.mock.calls.map((call) => call[1])).toEqual([
      ['r90001', 'v90001', 1280, 720, '1280x720', '16:9', 10],
      ['r90002', null, 800, 600, '800x600', '4:3', 3000],
      ['r90003', null, null, null, null, 'unknown', 3000],
      ['r90004', null, null, null, '{"width":1}', 'unknown', 3000],
    ]);
  });

  it('delegates every SQLite operation and caches PostgreSQL selection', async () => {
    mocks.readConfig.mockReturnValue({ backend: 'sqlite' });
    mocks.getOwned.mockReturnValue({ release_id: 'r90001' });
    mocks.listOwned.mockReturnValue([{ release_id: 'r90001' }]);
    mocks.listWithShelf.mockReturnValue([{ release_id: 'r90001', shelf: null }]);
    const sqlite = getOwnedReleaseRepository();

    await expect(sqlite.get('v90001', 'r90001')).resolves.toEqual({ release_id: 'r90001' });
    await expect(sqlite.listForVn('v90001')).resolves.toHaveLength(1);
    await expect(sqlite.listWithShelfForVn('v90001')).resolves.toHaveLength(1);
    await sqlite.mark('v90001', 'r90001');
    await sqlite.update('v90001', 'r90001', { notes: 'N' });
    await sqlite.updateWithAspect('v90001', 'r90001', { notes: 'N' }, undefined);
    await sqlite.updateWithAspect('v90001', 'r90001', {}, null);
    await sqlite.remove('v90001', 'r90001');
    await sqlite.setAspectOverride('v90001', 'r90001', null);
    await sqlite.upsertResolutionCache({ releaseId: 'r90001', resolution: null });
    expect(mocks.setAspect).toHaveBeenCalledWith({ vnId: 'v90001', releaseId: 'r90001', aspectKey: 'unknown' });

    mocks.readConfig.mockReturnValue({ backend: 'postgres' });
    const first = getOwnedReleaseRepository();
    expect(getOwnedReleaseRepository()).toBe(first);
  });
});
