import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CacheRow } from '@/lib/db/repositories/cache';

const mocks = vi.hoisted(() => ({
  clientQuery: vi.fn(),
  postgresQuery: vi.fn(),
  transaction: vi.fn(),
  readConfig: vi.fn(),
  getCacheRow: vi.fn(),
  getCacheRows: vi.fn(),
  putCacheRow: vi.fn(),
  touchCacheRow: vi.fn(),
  deleteCacheKey: vi.fn(),
  pruneExpiredCache: vi.fn(),
  clearCache: vi.fn(),
  deleteCacheByPathPrefix: vi.fn(),
  getCacheFreshness: vi.fn(),
  cacheStats: vi.fn(),
  getDbStatus: vi.fn(),
  prepare: vi.fn(),
  statementRun: vi.fn(),
  sqliteTransaction: vi.fn(),
}));

vi.mock('@/lib/db/postgres', () => ({
  postgresQuery: mocks.postgresQuery,
  withPostgresTransaction: mocks.transaction,
}));
vi.mock('@/lib/db/postgres-config', () => ({ readDatabaseConfig: mocks.readConfig }));
vi.mock('@/lib/db', () => ({
  getCacheRow: mocks.getCacheRow,
  getCacheRows: mocks.getCacheRows,
  putCacheRow: mocks.putCacheRow,
  touchCacheRow: mocks.touchCacheRow,
  deleteCacheKey: mocks.deleteCacheKey,
  pruneExpiredCache: mocks.pruneExpiredCache,
  clearCache: mocks.clearCache,
  deleteCacheByPathPrefix: mocks.deleteCacheByPathPrefix,
  getCacheFreshness: mocks.getCacheFreshness,
  cacheStats: mocks.cacheStats,
  getDbStatus: mocks.getDbStatus,
  db: {
    prepare: mocks.prepare,
    transaction: mocks.sqliteTransaction,
  },
}));

import {
  createPostgresCacheRepository,
  getCacheRepository,
} from '@/lib/db/repositories/cache';

const cacheRow: CacheRow = {
  cache_key: 'POST /vn|fixture',
  body: '{}',
  etag: null,
  last_modified: null,
  fetched_at: 100,
  expires_at: 200,
};

describe('cache repository', () => {
  const originalToken = process.env.VNDB_TOKEN;

  beforeEach(() => {
    vi.useRealTimers();
    delete process.env.VNDB_TOKEN;
    mocks.clientQuery.mockReset().mockResolvedValue({ rows: [], rowCount: 0 });
    mocks.postgresQuery.mockReset().mockResolvedValue({ rows: [], rowCount: 0 });
    mocks.transaction.mockReset().mockImplementation(async (callback) => callback({ query: mocks.clientQuery }));
    mocks.readConfig.mockReset().mockReturnValue({ backend: 'postgres' });
    mocks.statementRun.mockReset().mockReturnValue({ changes: 0 });
    mocks.prepare.mockReset().mockReturnValue({ run: mocks.statementRun });
    mocks.sqliteTransaction.mockReset().mockImplementation((callback) => callback);
    for (const mock of [
      mocks.getCacheRow,
      mocks.getCacheRows,
      mocks.putCacheRow,
      mocks.touchCacheRow,
      mocks.deleteCacheKey,
      mocks.pruneExpiredCache,
      mocks.clearCache,
      mocks.deleteCacheByPathPrefix,
      mocks.getCacheFreshness,
      mocks.cacheStats,
      mocks.getDbStatus,
    ]) mock.mockReset();
  });

  afterEach(() => {
    if (originalToken === undefined) delete process.env.VNDB_TOKEN;
    else process.env.VNDB_TOKEN = originalToken;
  });

  it('reads, writes, touches, and deletes PostgreSQL cache rows', async () => {
    const repository = createPostgresCacheRepository();
    mocks.postgresQuery
      .mockResolvedValueOnce({ rows: [cacheRow] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [cacheRow] });

    await expect(repository.get(cacheRow.cache_key)).resolves.toBe(cacheRow);
    await expect(repository.get('missing')).resolves.toBeNull();
    await expect(repository.getMany([])).resolves.toEqual(new Map());
    await expect(repository.getMany([cacheRow.cache_key])).resolves.toEqual(new Map([[cacheRow.cache_key, cacheRow]]));
    await repository.put(cacheRow);
    await repository.touch(cacheRow.cache_key, 300, 400);
    await repository.deleteKey(cacheRow.cache_key);

    expect(mocks.postgresQuery).toHaveBeenCalledWith(expect.stringContaining('ON CONFLICT(cache_key)'), [
      cacheRow.cache_key, '{}', null, null, 100, 200,
    ]);
    expect(mocks.postgresQuery).toHaveBeenCalledWith(
      'UPDATE vndb_cache SET fetched_at = $1, expires_at = $2 WHERE cache_key = $3',
      [300, 400, cacheRow.cache_key],
    );
  });

  it('returns affected counts and rejects wildcard cache prefixes', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(500);
    const repository = createPostgresCacheRepository();
    mocks.postgresQuery
      .mockResolvedValueOnce({ rows: [], rowCount: 2 })
      .mockResolvedValueOnce({ rows: [], rowCount: null })
      .mockResolvedValueOnce({ rows: [], rowCount: 3 })
      .mockResolvedValueOnce({ rows: [], rowCount: null });

    await expect(repository.pruneExpired()).resolves.toBe(2);
    await expect(repository.clear()).resolves.toBe(0);
    await expect(repository.deleteByPathPrefix('POST /vn')).resolves.toBe(3);
    await expect(repository.deleteByPathPrefix('POST /release')).resolves.toBe(0);
    await expect(repository.deleteByPathPrefix('bad%prefix')).rejects.toThrow('LIKE metacharacters');
    await expect(repository.deleteByPathPrefix('bad_prefix')).rejects.toThrow('LIKE metacharacters');
    await expect(repository.deleteByPathPrefix('bad\\prefix')).rejects.toThrow('LIKE metacharacters');
    expect(mocks.postgresQuery.mock.calls[0]?.[1]).toEqual([500]);
  });

  it('deletes intentional patterns atomically and reports freshness', async () => {
    const repository = createPostgresCacheRepository();
    await expect(repository.deleteByPatterns([])).resolves.toBe(0);
    expect(mocks.transaction).not.toHaveBeenCalled();

    mocks.clientQuery
      .mockResolvedValueOnce({ rows: [], rowCount: 4 })
      .mockResolvedValueOnce({ rows: [], rowCount: null });
    await expect(repository.deleteByPatterns(['a%', 'b%'])).resolves.toBe(4);
    await expect(repository.deleteByPatterns(['c%'])).resolves.toBe(0);
    expect(String(mocks.clientQuery.mock.calls[0]?.[0])).toContain('cache_key LIKE $1 OR cache_key LIKE $2');

    await expect(repository.freshness([])).resolves.toBeNull();
    mocks.postgresQuery
      .mockResolvedValueOnce({ rows: [{ newest: 700 }] })
      .mockResolvedValueOnce({ rows: [] });
    const patterns = Array.from({ length: 40 }, (_value, index) => `p${index}%`);
    await expect(repository.freshness(patterns)).resolves.toBe(700);
    await expect(repository.freshness(['missing%'])).resolves.toBeNull();
    expect(mocks.postgresQuery.mock.calls.at(-2)?.[1]).toHaveLength(32);
  });

  it('builds PostgreSQL cache statistics with populated and empty summaries', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(800);
    const repository = createPostgresCacheRepository();
    mocks.postgresQuery
      .mockResolvedValueOnce({ rows: [{ total: 5, fresh: 3, bytes: 120, oldest: 10, newest: 20 }] })
      .mockResolvedValueOnce({ rows: [{ path: 'POST /vn', n: 5 }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    await expect(repository.stats()).resolves.toEqual({
      total: 5,
      fresh: 3,
      stale: 2,
      bytes: 120,
      oldest: 10,
      newest: 20,
      by_path: [{ path: 'POST /vn', n: 5 }],
    });
    await expect(repository.stats()).resolves.toEqual({
      total: 0,
      fresh: 0,
      stale: 0,
      bytes: 0,
      oldest: null,
      newest: null,
      by_path: [],
    });
    expect(mocks.postgresQuery.mock.calls[0]?.[1]).toEqual([800]);
  });

  it('reports PostgreSQL database status and every token source', async () => {
    const repository = createPostgresCacheRepository();
    let summaryCalls = 0;
    mocks.postgresQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('AS matched')) {
        summaryCalls += 1;
        if (summaryCalls === 1) {
          return { rows: [{ matched: 2, unmatched: 1, cache_total: 4, cache_fresh: 3, cache_stale: 1, has_token: 1 }] };
        }
        return { rows: [] };
      }
      return sql.includes('FROM vn') ? { rows: [{ count: 9 }] } : { rows: [] };
    });

    await expect(repository.databaseStatus()).resolves.toMatchObject({
      db_path: 'PostgreSQL',
      egs_matched: 2,
      cache_total: 4,
      vndb_token: 'db',
      rows: expect.arrayContaining([{ table: 'vn', count: 9 }, { table: 'collection', count: 0 }]),
    });

    process.env.VNDB_TOKEN = 'test-token';
    await expect(repository.databaseStatus()).resolves.toMatchObject({
      egs_matched: 0,
      cache_total: 0,
      vndb_token: 'env',
    });

    delete process.env.VNDB_TOKEN;
    await expect(repository.databaseStatus()).resolves.toMatchObject({ vndb_token: 'none' });
  });

  it('delegates every SQLite operation through the selected repository', async () => {
    mocks.readConfig.mockReturnValue({ backend: 'sqlite' });
    mocks.getCacheRow.mockReturnValue(cacheRow);
    mocks.getCacheRows.mockReturnValue(new Map([[cacheRow.cache_key, cacheRow]]));
    mocks.pruneExpiredCache.mockReturnValue(1);
    mocks.clearCache.mockReturnValue(2);
    mocks.deleteCacheByPathPrefix.mockReturnValue(3);
    mocks.getCacheFreshness.mockReturnValue(4);
    mocks.cacheStats.mockReturnValue({ total: 1 });
    mocks.getDbStatus.mockReturnValue({ db_path: 'sqlite' });
    mocks.statementRun
      .mockReturnValueOnce({ changes: 2 })
      .mockReturnValueOnce({ changes: 3 });
    const repository = getCacheRepository();

    await expect(repository.get('key')).resolves.toBe(cacheRow);
    await expect(repository.getMany(['key'])).resolves.toBeInstanceOf(Map);
    await repository.put(cacheRow);
    await repository.touch('key', 1, 2);
    await repository.deleteKey('key');
    await expect(repository.pruneExpired()).resolves.toBe(1);
    await expect(repository.clear()).resolves.toBe(2);
    await expect(repository.deleteByPathPrefix('literal')).resolves.toBe(3);
    await expect(repository.deleteByPathPrefix('bad%')).rejects.toThrow('LIKE metacharacters');
    await expect(repository.deleteByPatterns([])).resolves.toBe(0);
    await expect(repository.deleteByPatterns(['a%', 'b%'])).resolves.toBe(5);
    await expect(repository.freshness(['a%'])).resolves.toBe(4);
    await expect(repository.stats()).resolves.toEqual({ total: 1 });
    await expect(repository.databaseStatus()).resolves.toEqual({ db_path: 'sqlite' });
    expect(mocks.sqliteTransaction).toHaveBeenCalledOnce();
  });

  it('caches the selected PostgreSQL repository', () => {
    const first = getCacheRepository();
    expect(getCacheRepository()).toBe(first);
  });
});
