import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AliceNetStockListQuery } from '@/lib/db';

const mocks = vi.hoisted(() => ({
  backend: { value: 'postgres' as 'sqlite' | 'postgres' },
  clientQuery: vi.fn(),
  postgresQuery: vi.fn(),
  withTransaction: vi.fn(),
  sqlite: {
    clearAliceNetVnLink: vi.fn(),
    countAliceNetDownloadPending: vi.fn(),
    countAliceNetNoVndbNoEgs: vi.fn(),
    countAliceNetNoVndbResult: vi.fn(),
    countAliceNetNoVndbWithEgs: vi.fn(),
    countAliceNetStock: vi.fn(),
    countAliceNetUnmatchedQueue: vi.fn(),
    getAliceNetStockItem: vi.fn(),
    listAliceNetItemsForEgsResolve: vi.fn(),
    listAliceNetMatchedVnIds: vi.fn(),
    listAliceNetNoVndbNoEgs: vi.fn(),
    listAliceNetNoVndbResult: vi.fn(),
    listAliceNetNoVndbWithEgs: vi.fn(),
    listAliceNetStockForVn: vi.fn(),
    listAliceNetUnmatched: vi.fn(),
    listAliceNetVnidsToDownload: vi.fn(),
    queryAliceNetStockPage: vi.fn(),
    resetAliceNetAutoMatches: vi.fn(),
    setAliceNetEgsLink: vi.fn(),
    setAliceNetVnLink: vi.fn(),
    upsertAliceNetStock: vi.fn(),
  },
}));

vi.mock('@/lib/db/postgres-config', () => ({
  readDatabaseConfig: () => mocks.backend.value === 'postgres'
    ? {
      backend: 'postgres',
      url: 'postgresql://localhost/test',
      poolMax: 4,
      idleTimeoutMs: 30_000,
      connectionTimeoutMs: 5_000,
      statementTimeoutMs: 30_000,
      lockTimeoutMs: 5_000,
      sslMode: 'disable',
      applicationName: 'test',
    }
    : { backend: 'sqlite', path: './test.db' },
}));

vi.mock('@/lib/db/postgres', () => ({
  postgresQuery: mocks.postgresQuery,
  withPostgresTransaction: mocks.withTransaction,
}));

vi.mock('@/lib/db', () => mocks.sqlite);

import {
  createPostgresAliceNetRepository,
  getAliceNetRepository,
} from '@/lib/db/repositories/alicenet';

const baseQuery: AliceNetStockListQuery = {
  limit: 96,
  offset: 0,
  filter: 'all',
  sort: 'title',
  group: 'none',
  search: '',
  producer: '',
  yearMin: null,
  yearMax: null,
  priceMin: null,
  priceMax: null,
  wishlistIds: null,
};

describe('PostgreSQL AliceNet repository', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.backend.value = 'postgres';
    mocks.clientQuery.mockResolvedValue({ rows: [], rowCount: 0 });
    mocks.postgresQuery.mockResolvedValue({ rows: [], rowCount: 0 });
    mocks.withTransaction.mockImplementation(async (callback) => callback({ query: mocks.clientQuery }));
  });

  it('full-syncs large and empty snapshots transactionally', async () => {
    const rows = Array.from({ length: 251 }, (_, index) => ({
      code: `100-${String(index).padStart(6, '0')}-001`,
      title: `Title ${index}`,
      jan: index === 0 ? '1234567890123' : null,
      release_date: index === 0 ? '2026-01-01' : null,
      list_price: index === 0 ? '5000' : null,
      sale_price: index === 0 ? '3000' : null,
    }));
    mocks.clientQuery
      .mockResolvedValueOnce({ rows: [{ code: rows[0]?.code }, { code: 'sold-code' }], rowCount: 2 })
      .mockResolvedValue({ rows: [], rowCount: 2 });

    await expect(createPostgresAliceNetRepository().upsertStock(rows)).resolves.toEqual({
      added: 250,
      updated: 1,
      removed: 2,
    });
    expect(mocks.clientQuery.mock.calls.filter(([sql]) => String(sql).includes('INSERT INTO alicenet_stock'))).toHaveLength(2);
    expect(mocks.clientQuery.mock.calls.at(-1)?.[0]).toContain('NOT (code = ANY');

    mocks.clientQuery.mockReset()
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({ rows: [], rowCount: null });
    await expect(createPostgresAliceNetRepository().upsertStock([])).resolves.toEqual({ added: 0, updated: 0, removed: 0 });
    expect(mocks.clientQuery.mock.calls[1]?.[0]).toBe('DELETE FROM alicenet_stock');
  });

  it('builds bounded pages for every filter, sort, group, and optional constraint', async () => {
    const repository = createPostgresAliceNetRepository();
    mocks.postgresQuery
      .mockResolvedValueOnce({ rows: [{ n: 7 }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ code: 'item' }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ id: 'p1', name: 'Producer', count: 1 }], rowCount: 1 });
    await expect(repository.queryPage(baseQuery)).resolves.toEqual({
      items: [{ code: 'item' }],
      total: 7,
      producers: [{ id: 'p1', name: 'Producer', count: 1 }],
    });
    const ungroupedPageSql = String(mocks.postgresQuery.mock.calls[1]?.[0]);
    expect(ungroupedPageSql).toContain('0::BIGINT AS server_group_count');
    expect(ungroupedPageSql).not.toContain('COUNT(*) OVER');
    expect(ungroupedPageSql).toContain('WITH page_rows AS MATERIALIZED');
    expect(ungroupedPageSql.indexOf('LEFT JOIN vn v')).toBeGreaterThan(ungroupedPageSql.indexOf('FROM page_rows k'));

    mocks.postgresQuery.mockReset().mockResolvedValue({ rows: [], rowCount: 0 });
    const filters: AliceNetStockListQuery['filter'][] = ['matched', 'vndb', 'egs_only', 'unmatched', 'none_found', 'collection'];
    for (const filter of filters) await repository.queryPage({ ...baseQuery, filter });
    await repository.queryPage({ ...baseQuery, filter: 'wishlist', wishlistIds: [] });
    await repository.queryPage({ ...baseQuery, filter: 'wishlist', wishlistIds: ['v1'] });

    const sorts: AliceNetStockListQuery['sort'][] = ['release_desc', 'release_asc', 'price_asc', 'price_desc', 'updated_desc', 'match_status'];
    for (const sort of sorts) await repository.queryPage({ ...baseQuery, sort });
    const groups: AliceNetStockListQuery['group'][] = ['match', 'producer', 'year'];
    for (const group of groups) await repository.queryPage({ ...baseQuery, group });

    await repository.queryPage({
      ...baseQuery,
      limit: 999,
      offset: 99_999_999,
      producer: 'egs:AliceSoft',
      yearMin: 1990,
      yearMax: 2030,
      priceMin: 500,
      priceMax: 10_000,
      search: '  A%_\\B  ',
      wishlistIds: ['v1'],
    });
    await repository.queryPage({ ...baseQuery, limit: Number.NaN, offset: -1, producer: 'p1' });

    const sql = mocks.postgresQuery.mock.calls.map(([text]) => String(text)).join('\n');
    expect(sql).toContain("k.egs_brand =");
    expect(sql).toContain('vn_developer_index');
    expect(sql).not.toContain('jsonb_array_elements');
    expect(sql).not.toContain('->>');
    expect(sql).toContain('app_search_normalize');
    expect(sql).toContain('LIKE');
    expect(sql).toContain('LIMIT');
    expect(sql).toContain('COUNT(*) OVER (PARTITION BY');
    expect(mocks.postgresQuery.mock.calls.some(([, values]) => (
      Array.isArray(values) && values.includes('%a\\%\\_\\\\b%')
    ))).toBe(true);
  });

  it('enumerates every matching queue with and without retry cutoffs', async () => {
    const repository = createPostgresAliceNetRepository();
    const listResult = { rows: [{ code: 'queued' }], rowCount: 1 };
    const countResult = { rows: [{ n: 4 }], rowCount: 1 };

    mocks.postgresQuery.mockResolvedValueOnce(listResult);
    await expect(repository.listUnmatched(5)).resolves.toEqual(listResult.rows);
    mocks.postgresQuery.mockResolvedValueOnce(listResult);
    await repository.listUnmatched(5, true, 100.8);
    mocks.postgresQuery.mockResolvedValueOnce(listResult);
    await repository.listUnmatched(5, true, Number.POSITIVE_INFINITY);
    mocks.postgresQuery.mockResolvedValueOnce(countResult);
    await expect(repository.countUnmatched()).resolves.toBe(4);
    mocks.postgresQuery.mockResolvedValueOnce(countResult);
    await repository.countUnmatched(true, 100);

    const listCalls = [
      () => repository.listNoVndb(5),
      () => repository.listNoVndb(5, 100),
      () => repository.listNoVndbWithEgs(5, 100),
      () => repository.listNoVndbNoEgs(5, 100),
    ];
    for (const call of listCalls) {
      mocks.postgresQuery.mockResolvedValueOnce(listResult);
      await call();
    }
    const countCalls = [
      () => repository.countNoVndb(),
      () => repository.countNoVndb(100),
      () => repository.countNoVndbWithEgs(100),
      () => repository.countNoVndbNoEgs(100),
    ];
    for (const call of countCalls) {
      mocks.postgresQuery.mockResolvedValueOnce(countResult);
      await expect(call()).resolves.toBe(4);
    }
    mocks.postgresQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
    await expect(repository.countNoVndbNoEgs()).resolves.toBe(0);

    const sql = mocks.postgresQuery.mock.calls.map(([text]) => String(text)).join('\n');
    expect(sql).toContain('last_matched_at <');
    expect(sql).toContain("vn_match_source = 'none'");
    expect(sql).toContain('egs_id IS NOT NULL');
  });

  it('reads rows and persists VN and EGS match decisions', async () => {
    const repository = createPostgresAliceNetRepository();
    mocks.postgresQuery.mockResolvedValueOnce({ rows: [{ vn_id: 'v1' }, { vn_id: 'v2' }], rowCount: 2 });
    await expect(repository.listMatchedVnIds()).resolves.toEqual(['v1', 'v2']);
    mocks.postgresQuery.mockResolvedValueOnce({ rows: [{ code: 'item' }], rowCount: 1 });
    await expect(repository.getItem('item')).resolves.toEqual({ code: 'item' });
    mocks.postgresQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
    await expect(repository.getItem('missing')).resolves.toBeNull();

    await repository.setVnLink('item', 'V123', 'manual', '[]', 'Search');
    await repository.setVnLink('item', null, 'none');
    await repository.clearVnLink('item');
    mocks.postgresQuery.mockResolvedValueOnce({ rows: [], rowCount: 2 });
    await expect(repository.resetAutoMatches()).resolves.toBe(2);
    mocks.postgresQuery.mockResolvedValueOnce({ rows: [], rowCount: null });
    await expect(repository.resetAutoMatches()).resolves.toBe(0);

    await repository.setEgsLink('item', null, 'auto');
    await repository.setEgsLink('item', 10, 'manual');
    await repository.setEgsLink('item', 11, 'auto', {
      title: 'EGS title',
      brand: 'Brand',
      releaseDate: '2026-01-01',
      imageUrl: 'https://example.test/image.jpg',
      vndbRaw: 'v123',
    });
    await repository.setEgsLink('item', 12, 'auto', {});

    expect(mocks.postgresQuery.mock.calls.some(([, values]) => Array.isArray(values) && values[0] === 'v123')).toBe(true);
  });

  it('returns aggregate, pending, download, and per-VN projections with empty fallbacks', async () => {
    const repository = createPostgresAliceNetRepository();
    mocks.postgresQuery.mockResolvedValueOnce({ rows: [{ total: 10, matched: 6, vndb_matched: 4, egs_only: 2, unprocessed: 3, none_found: 1, in_collection: 2 }] });
    await expect(repository.countStock()).resolves.toEqual({
      total: 10,
      matched: 6,
      vndb_matched: 4,
      egs_only: 2,
      unmatched: 4,
      unprocessed: 3,
      none_found: 1,
      in_collection: 2,
    });
    mocks.postgresQuery.mockResolvedValueOnce({ rows: [] });
    await expect(repository.countStock()).resolves.toEqual({
      total: 0,
      matched: 0,
      vndb_matched: 0,
      egs_only: 0,
      unmatched: 0,
      unprocessed: 0,
      none_found: 0,
      in_collection: 0,
    });
    mocks.postgresQuery.mockResolvedValueOnce({ rows: [{ vn_id: 'v1' }] });
    await expect(repository.listVnIdsToDownload(5)).resolves.toEqual(['v1']);
    mocks.postgresQuery.mockResolvedValueOnce({ rows: [{ code: 'item', vn_id: 'v1' }] });
    await expect(repository.listItemsForEgsResolve(5)).resolves.toEqual([{ code: 'item', vn_id: 'v1' }]);
    mocks.postgresQuery.mockResolvedValueOnce({ rows: [{ vndb_pending: 2, egs_pending: 3 }] });
    await expect(repository.countDownloadPending()).resolves.toEqual({ vndb_pending: 2, egs_pending: 3 });
    mocks.postgresQuery.mockResolvedValueOnce({ rows: [] });
    await expect(repository.countDownloadPending()).resolves.toEqual({ vndb_pending: 0, egs_pending: 0 });
    mocks.postgresQuery.mockResolvedValueOnce({ rows: [{ code: 'item' }] });
    await expect(repository.listForVn('v1')).resolves.toEqual([{ code: 'item' }]);
  });

  it('delegates the complete contract to SQLite and caches the PostgreSQL repository', async () => {
    mocks.backend.value = 'sqlite';
    const marker = { marker: true };
    for (const fn of Object.values(mocks.sqlite)) fn.mockReturnValue(marker);
    const repository = getAliceNetRepository();
    const calls = [
      () => repository.upsertStock([]),
      () => repository.queryPage(baseQuery),
      () => repository.listMatchedVnIds(),
      () => repository.getItem('item'),
      () => repository.listUnmatched(1, true, 100),
      () => repository.countUnmatched(true, 100),
      () => repository.listNoVndb(1, 100),
      () => repository.countNoVndb(100),
      () => repository.listNoVndbWithEgs(1, 100),
      () => repository.countNoVndbWithEgs(100),
      () => repository.listNoVndbNoEgs(1, 100),
      () => repository.countNoVndbNoEgs(100),
      () => repository.setVnLink('item', 'v1', 'manual', '[]', 'search'),
      () => repository.clearVnLink('item'),
      () => repository.resetAutoMatches(),
      () => repository.setEgsLink('item', 1, 'manual', { title: 'Title' }),
      () => repository.countStock(),
      () => repository.listVnIdsToDownload(1),
      () => repository.listItemsForEgsResolve(1),
      () => repository.countDownloadPending(),
      () => repository.listForVn('v1'),
    ];
    for (const call of calls) await call();
    for (const [name, fn] of Object.entries(mocks.sqlite)) expect(fn, name).toHaveBeenCalledOnce();

    mocks.backend.value = 'postgres';
    const postgres = getAliceNetRepository();
    expect(getAliceNetRepository()).toBe(postgres);
  });
});
