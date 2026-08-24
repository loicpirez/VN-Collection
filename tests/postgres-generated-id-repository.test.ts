import type { PoolClient } from 'pg';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  clientQuery: vi.fn(),
  postgresQuery: vi.fn(),
  readConfig: vi.fn(),
  withTransaction: vi.fn(),
  sqlite: {
    addManualActivity: vi.fn(),
    addGameLogEntry: vi.fn(),
    createRoute: vi.fn(),
    createShelf: vi.fn(),
    createPlace: vi.fn(),
    createSeries: vi.fn(),
    createSavedFilter: vi.fn(),
    createUserList: vi.fn(),
  },
}));

vi.mock('@/lib/db/postgres', () => ({
  postgresQuery: mocks.postgresQuery,
  withPostgresTransaction: mocks.withTransaction,
}));

vi.mock('@/lib/db/postgres-config', () => ({
  readDatabaseConfig: mocks.readConfig,
}));

vi.mock('@/lib/db', () => mocks.sqlite);

import {
  createPostgresGeneratedIdRepository,
  getGeneratedIdRepository,
} from '@/lib/db/repositories/generated-id';

function transactionClient(): Pick<PoolClient, 'query'> {
  return { query: mocks.clientQuery } as Pick<PoolClient, 'query'>;
}

describe('PostgreSQL generated identifier repository', () => {
  beforeEach(() => {
    vi.useRealTimers();
    mocks.clientQuery.mockReset().mockResolvedValue({ rows: [], rowCount: 1 });
    mocks.postgresQuery.mockReset().mockResolvedValue({ rows: [], rowCount: 1 });
    mocks.readConfig.mockReset().mockReturnValue({ backend: 'postgres' });
    mocks.withTransaction.mockReset().mockImplementation(
      async (callback: (client: Pick<PoolClient, 'query'>) => Promise<object>) => callback(transactionClient()),
    );
    for (const mock of Object.values(mocks.sqlite)) mock.mockReset();
  });

  it('returns a trimmed manual activity and requires the returned row', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1000);
    mocks.postgresQuery.mockResolvedValueOnce({ rows: [{ id: 11 }], rowCount: 1 });
    const repository = createPostgresGeneratedIdRepository();

    await expect(repository.addManualActivity('v90001', `  ${'x'.repeat(2100)}  `)).resolves.toEqual({
      id: 11,
      vn_id: 'v90001',
      kind: 'manual',
      payload: { text: 'x'.repeat(2000) },
      occurred_at: 1000,
    });
    expect(String(mocks.postgresQuery.mock.calls[0]?.[0])).toContain('RETURNING id');

    mocks.postgresQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
    await expect(repository.addManualActivity('v90001', 'note', 2000)).rejects.toThrow('manual activity insert did not return a row');
  });

  it('validates and creates game-log rows with normalized minutes', async () => {
    const repository = createPostgresGeneratedIdRepository();
    await expect(repository.addGameLogEntry('v90001', '   ')).rejects.toThrow('empty note');

    vi.useFakeTimers();
    vi.setSystemTime(3000);
    mocks.postgresQuery.mockResolvedValueOnce({ rows: [{ id: 12 }], rowCount: 1 });
    await expect(repository.addGameLogEntry('v90001', ` ${'n'.repeat(8100)} `, undefined, 4.6)).resolves.toMatchObject({
      id: 12,
      note: 'n'.repeat(8000),
      logged_at: 3000,
      session_minutes: 5,
      created_at: 3000,
      updated_at: 3000,
    });

    mocks.postgresQuery.mockResolvedValueOnce({ rows: [{ id: 13 }], rowCount: 1 });
    await expect(repository.addGameLogEntry('v90001', 'note', 4000, 0)).resolves.toMatchObject({
      logged_at: 4000,
      session_minutes: null,
    });
  });

  it('creates ordered routes under a per-VN transaction lock', async () => {
    mocks.clientQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('MAX(order_index)')) return { rows: [{ order_index: 4 }] };
      if (sql.includes('INSERT INTO vn_route')) {
        return { rows: [{
          id: 21,
          vn_id: 'v90001',
          name: 'Route A',
          completed: 0,
          completed_date: null,
          order_index: 4,
          notes: null,
          created_at: 10,
          updated_at: 10,
        }] };
      }
      return { rows: [] };
    });
    const repository = createPostgresGeneratedIdRepository();

    await expect(repository.createRoute('v90001', 'Route A')).resolves.toMatchObject({ id: 21, completed: false, order_index: 4 });
    expect(String(mocks.clientQuery.mock.calls[0]?.[0])).toContain('pg_advisory_xact_lock');
    expect(String(mocks.clientQuery.mock.calls[2]?.[0])).toContain('RETURNING id');

    mocks.clientQuery.mockClear();
    mocks.clientQuery.mockImplementation(async (sql: string) => sql.includes('INSERT INTO vn_route')
      ? { rows: [{ id: 22, vn_id: 'v90001', name: 'Route B', completed: 1, completed_date: null, order_index: 9, notes: null, created_at: 10, updated_at: 10 }] }
      : { rows: [] });
    await expect(repository.createRoute('v90001', 'Route B', 9)).resolves.toMatchObject({ completed: true, order_index: 9 });
    expect(mocks.clientQuery.mock.calls.some(([sql]) => String(sql).includes('MAX(order_index)'))).toBe(false);
  });

  it('validates and creates shelves with bounded dimensions and ordering', async () => {
    const repository = createPostgresGeneratedIdRepository();
    await expect(repository.createShelf({ name: '  ' })).rejects.toThrow('shelf name required');

    mocks.clientQuery.mockImplementation(async (sql: string, values?: readonly object[]) => {
      if (sql.includes('MAX(order_index)')) return { rows: [{ order_index: 3 }] };
      if (sql.includes('INSERT INTO shelf_unit')) {
        return { rows: [{ id: 31, name: 'Shelf', cols: values?.[1], rows: values?.[2], order_index: 3, created_at: 10, updated_at: 10 }] };
      }
      return { rows: [] };
    });
    await expect(repository.createShelf({ name: ' Shelf ', cols: Number.POSITIVE_INFINITY, rows: -4 })).resolves.toMatchObject({
      id: 31,
      name: 'Shelf',
      cols: 8,
      rows: 1,
    });

    await expect(repository.createShelf({ name: 'Shelf 2', cols: 300, rows: 4.8 })).resolves.toMatchObject({ cols: 200, rows: 4 });
  });

  it('validates coordinates and returns a generated place id', async () => {
    const repository = createPostgresGeneratedIdRepository();
    await expect(repository.createPlace({ name: 'Shop', lat: Number.NaN })).rejects.toThrow('lat must be a finite number');
    await expect(repository.createPlace({ name: 'Shop', lat: 91 })).rejects.toThrow('lat must be between -90 and 90');
    await expect(repository.createPlace({ name: 'Shop', lng: 181 })).rejects.toThrow('lng must be between -180 and 180');

    mocks.postgresQuery.mockResolvedValueOnce({ rows: [{ id: 41 }], rowCount: 1 });
    await expect(repository.createPlace({ name: 'Shop', lat: null, lng: 139.5 })).resolves.toBe(41);
    expect(mocks.postgresQuery.mock.calls[0]?.[1]).toEqual(['Shop', null, 'shop', null, null, 139.5, null, null, expect.any(Number), expect.any(Number)]);
  });

  it('creates series and ordered saved filters with returned rows', async () => {
    const repository = createPostgresGeneratedIdRepository();
    mocks.postgresQuery.mockResolvedValueOnce({ rows: [{ id: 51, name: 'Series', description: null, cover_path: null, banner_path: null, created_at: 10, updated_at: 10 }], rowCount: 1 });
    await expect(repository.createSeries('Series')).resolves.toMatchObject({ id: 51, description: null });

    mocks.clientQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('MAX(position)')) return { rows: [{ position: 6 }] };
      if (sql.includes('INSERT INTO saved_filter')) return { rows: [{ id: 52, name: 'Filter', params: 'q=x', position: 6, created_at: 10 }] };
      return { rows: [] };
    });
    await expect(repository.createSavedFilter(' Filter ', 'q=x')).resolves.toMatchObject({ id: 52, name: 'Filter', position: 6 });
    expect(String(mocks.clientQuery.mock.calls[0]?.[0])).toContain('pg_advisory_xact_lock');
  });

  it('creates collision-free user-list slugs and validates names', async () => {
    const repository = createPostgresGeneratedIdRepository();
    await expect(repository.createUserList({ name: '   ' })).rejects.toThrow('name required');

    let slugChecks = 0;
    mocks.clientQuery.mockImplementation(async (sql: string, values?: readonly object[]) => {
      if (sql.includes('SELECT id FROM user_list')) {
        slugChecks += 1;
        return { rows: slugChecks === 1 ? [{ id: 1 }] : [] };
      }
      if (sql.includes('INSERT INTO user_list')) {
        return { rows: [{ id: 61, name: 'List Name', slug: values?.[1], description: null, color: null, icon: null, pinned: 0, created_at: 10, updated_at: 10 }] };
      }
      return { rows: [] };
    });
    await expect(repository.createUserList({ name: ' List Name ' })).resolves.toMatchObject({ id: 61, slug: 'list-name-2' });

    slugChecks = 0;
    mocks.clientQuery.mockImplementation(async (sql: string, values?: readonly object[]) => sql.includes('INSERT INTO user_list')
      ? { rows: [{ id: 62, name: '日本語', slug: values?.[1], description: 'D', color: 'red', icon: 'List', pinned: 0, created_at: 10, updated_at: 10 }] }
      : { rows: [] });
    await expect(repository.createUserList({ name: '日本語', description: 'D', color: 'red', icon: 'List' })).resolves.toMatchObject({ slug: 'list' });
  });

  it('delegates every generated-id operation to SQLite when configured', async () => {
    mocks.readConfig.mockReturnValue({ backend: 'sqlite' });
    const results = {
      activity: { id: 1 },
      gameLog: { id: 2 },
      route: { id: 3 },
      shelf: { id: 4 },
      place: 5,
      series: { id: 6 },
      filter: { id: 7 },
      list: { id: 8 },
    };
    mocks.sqlite.addManualActivity.mockReturnValue(results.activity);
    mocks.sqlite.addGameLogEntry.mockReturnValue(results.gameLog);
    mocks.sqlite.createRoute.mockReturnValue(results.route);
    mocks.sqlite.createShelf.mockReturnValue(results.shelf);
    mocks.sqlite.createPlace.mockReturnValue(results.place);
    mocks.sqlite.createSeries.mockReturnValue(results.series);
    mocks.sqlite.createSavedFilter.mockReturnValue(results.filter);
    mocks.sqlite.createUserList.mockReturnValue(results.list);
    const repository = getGeneratedIdRepository();

    await expect(repository.addManualActivity('v90001', 'A', 1)).resolves.toBe(results.activity);
    await expect(repository.addGameLogEntry('v90001', 'G', 2, 3)).resolves.toBe(results.gameLog);
    await expect(repository.createRoute('v90001', 'R')).resolves.toBe(results.route);
    await expect(repository.createRoute('v90001', 'R', 4)).resolves.toBe(results.route);
    await expect(repository.createShelf({ name: 'S' })).resolves.toBe(results.shelf);
    await expect(repository.createPlace({ name: 'P' })).resolves.toBe(5);
    await expect(repository.createSeries('Series', null)).resolves.toBe(results.series);
    await expect(repository.createSavedFilter('F', 'q=x')).resolves.toBe(results.filter);
    await expect(repository.createUserList({ name: 'L' })).resolves.toBe(results.list);
  });

  it('caches the PostgreSQL repository selection', () => {
    const first = getGeneratedIdRepository();
    const second = getGeneratedIdRepository();
    expect(first).toBe(second);
  });
});
