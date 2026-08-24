import type { QueryResultRow } from 'pg';
import { readDatabaseConfig } from '../postgres-config';
import { postgresQuery, withPostgresTransaction } from '../postgres';

/** Persisted upstream cache row. */
export interface CacheRow {
  cache_key: string;
  body: string;
  etag: string | null;
  last_modified: string | null;
  fetched_at: number;
  expires_at: number;
}

/** Aggregate cache diagnostics shown by the data-management UI. */
export interface CacheStat {
  total: number;
  fresh: number;
  stale: number;
  bytes: number;
  oldest: number | null;
  newest: number | null;
  by_path: Array<{ path: string; n: number }>;
}

/** Provider-neutral database status shown by the data-management UI. */
export interface DatabaseStatus {
  db_path: string;
  rows: Array<{ table: string; count: number }>;
  egs_matched: number;
  egs_unmatched: number;
  cache_total: number;
  cache_fresh: number;
  cache_stale: number;
  vndb_token: 'db' | 'env' | 'none';
}

/** Asynchronous persistence contract for VNDB cache rows and diagnostics. */
export interface CacheRepository {
  /** Read one cache row. */
  get(key: string): Promise<CacheRow | null>;
  /** Read a bounded set of cache rows keyed by cache key. */
  getMany(keys: readonly string[]): Promise<Map<string, CacheRow>>;
  /** Insert or replace one cache row. */
  put(row: CacheRow): Promise<void>;
  /** Refresh one cache row's timestamps. */
  touch(key: string, fetchedAt: number, expiresAt: number): Promise<void>;
  /** Delete one exact cache row. */
  deleteKey(key: string): Promise<void>;
  /** Delete expired rows and return the affected count. */
  pruneExpired(): Promise<number>;
  /** Delete all rows and return the affected count. */
  clear(): Promise<number>;
  /** Delete rows matching one literal cache-key prefix. */
  deleteByPathPrefix(pathPrefix: string): Promise<number>;
  /** Delete rows matching the supplied intentional LIKE patterns atomically. */
  deleteByPatterns(patterns: readonly string[]): Promise<number>;
  /** Return the newest matching cache timestamp. */
  freshness(patterns: readonly string[]): Promise<number | null>;
  /** Return aggregate cache diagnostics. */
  stats(): Promise<CacheStat>;
  /** Return provider-neutral database and cache diagnostics. */
  databaseStatus(): Promise<DatabaseStatus>;
}

interface CountRow extends QueryResultRow {
  count: number;
}

interface CacheSummaryRow extends QueryResultRow {
  total: number;
  fresh: number;
  bytes: number;
  oldest: number | null;
  newest: number | null;
}

interface DatabaseSummaryRow extends QueryResultRow {
  matched: number;
  unmatched: number;
  cache_total: number;
  cache_fresh: number;
  cache_stale: number;
  has_token: number;
}

const STATUS_TABLES = [
  'vn',
  'collection',
  'producer',
  'series',
  'series_vn',
  'owned_release',
  'vn_route',
  'character_image',
  'egs_game',
  'vndb_cache',
  'app_setting',
] as const;

function assertLiteralPrefix(pathPrefix: string): void {
  if (/[%_\\]/.test(pathPrefix)) {
    throw new Error('deleteCacheByPathPrefix: pathPrefix must not contain LIKE metacharacters');
  }
}

/** Create the PostgreSQL-backed cache repository. */
export function createPostgresCacheRepository(): CacheRepository {
  return {
    async get(key) {
      const result = await postgresQuery<CacheRow & QueryResultRow>(`
        SELECT cache_key, body, etag, last_modified, fetched_at, expires_at
        FROM vndb_cache WHERE cache_key = $1
      `, [key]);
      return result.rows[0] ?? null;
    },
    async getMany(keys) {
      if (keys.length === 0) return new Map();
      const result = await postgresQuery<CacheRow & QueryResultRow>(`
        SELECT cache_key, body, etag, last_modified, fetched_at, expires_at
        FROM vndb_cache WHERE cache_key = ANY($1::text[])
      `, [keys]);
      return new Map(result.rows.map((row) => [row.cache_key, row]));
    },
    async put(row) {
      await postgresQuery(`
        INSERT INTO vndb_cache (cache_key, body, etag, last_modified, fetched_at, expires_at)
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT(cache_key) DO UPDATE SET
          body = EXCLUDED.body,
          etag = EXCLUDED.etag,
          last_modified = EXCLUDED.last_modified,
          fetched_at = EXCLUDED.fetched_at,
          expires_at = EXCLUDED.expires_at
      `, [row.cache_key, row.body, row.etag, row.last_modified, row.fetched_at, row.expires_at]);
    },
    async touch(key, fetchedAt, expiresAt) {
      await postgresQuery(
        'UPDATE vndb_cache SET fetched_at = $1, expires_at = $2 WHERE cache_key = $3',
        [fetchedAt, expiresAt, key],
      );
    },
    async deleteKey(key) {
      await postgresQuery('DELETE FROM vndb_cache WHERE cache_key = $1', [key]);
    },
    async pruneExpired() {
      const result = await postgresQuery('DELETE FROM vndb_cache WHERE expires_at < $1', [Date.now()]);
      return result.rowCount ?? 0;
    },
    async clear() {
      const result = await postgresQuery('DELETE FROM vndb_cache');
      return result.rowCount ?? 0;
    },
    async deleteByPathPrefix(pathPrefix) {
      assertLiteralPrefix(pathPrefix);
      const result = await postgresQuery(
        "DELETE FROM vndb_cache WHERE cache_key LIKE $1 ESCAPE '\\'",
        [`${pathPrefix}|%`],
      );
      return result.rowCount ?? 0;
    },
    async deleteByPatterns(patterns) {
      if (patterns.length === 0) return 0;
      return withPostgresTransaction(async (client) => {
        const result = await client.query(
          `DELETE FROM vndb_cache WHERE ${patterns.map((_pattern, index) => `cache_key LIKE $${index + 1}`).join(' OR ')}`,
          [...patterns],
        );
        return result.rowCount ?? 0;
      });
    },
    async freshness(patterns) {
      if (patterns.length === 0) return null;
      const capped = patterns.slice(0, 32);
      const result = await postgresQuery<{ newest: number | null } & QueryResultRow>(
        `SELECT MAX(fetched_at) AS newest FROM vndb_cache WHERE ${capped.map((_pattern, index) => `cache_key LIKE $${index + 1}`).join(' OR ')}`,
        capped,
      );
      return result.rows[0]?.newest ?? null;
    },
    async stats() {
      const now = Date.now();
      const [summary, paths] = await Promise.all([
        postgresQuery<CacheSummaryRow>(`
          SELECT COUNT(*) AS total,
            COUNT(*) FILTER (WHERE expires_at >= $1) AS fresh,
            COALESCE(SUM(OCTET_LENGTH(body)), 0)::BIGINT AS bytes,
            MIN(fetched_at) AS oldest,
            MAX(fetched_at) AS newest
          FROM vndb_cache
        `, [now]),
        postgresQuery<{ path: string; n: number } & QueryResultRow>(`
          SELECT SPLIT_PART(cache_key, '|', 1) AS path, COUNT(*) AS n
          FROM vndb_cache
          GROUP BY path
          ORDER BY n DESC, path COLLATE "C"
          LIMIT 200
        `),
      ]);
      const row = summary.rows[0] ?? { total: 0, fresh: 0, bytes: 0, oldest: null, newest: null };
      return {
        total: row.total,
        fresh: row.fresh,
        stale: row.total - row.fresh,
        bytes: row.bytes,
        oldest: row.oldest,
        newest: row.newest,
        by_path: paths.rows,
      };
    },
    async databaseStatus() {
      const now = Date.now();
      const [counts, summary] = await Promise.all([
        Promise.all(STATUS_TABLES.map(async (table) => {
          const result = await postgresQuery<CountRow>(`SELECT COUNT(*) AS count FROM ${table}`);
          return { table, count: result.rows[0]?.count ?? 0 };
        })),
        postgresQuery<DatabaseSummaryRow>(`
          SELECT
            (SELECT COUNT(*) FROM egs_game WHERE egs_id IS NOT NULL) AS matched,
            (SELECT COUNT(*) FROM egs_game WHERE egs_id IS NULL) AS unmatched,
            (SELECT COUNT(*) FROM vndb_cache) AS cache_total,
            (SELECT COUNT(*) FROM vndb_cache WHERE expires_at >= $1) AS cache_fresh,
            (SELECT COUNT(*) FROM vndb_cache WHERE expires_at < $1) AS cache_stale,
            (SELECT COUNT(*) FROM app_setting WHERE key = 'vndb_token' AND value IS NOT NULL AND value <> '') AS has_token
        `, [now]),
      ]);
      const row = summary.rows[0] ?? {
        matched: 0,
        unmatched: 0,
        cache_total: 0,
        cache_fresh: 0,
        cache_stale: 0,
        has_token: 0,
      };
      return {
        db_path: 'PostgreSQL',
        rows: counts,
        egs_matched: row.matched,
        egs_unmatched: row.unmatched,
        cache_total: row.cache_total,
        cache_fresh: row.cache_fresh,
        cache_stale: row.cache_stale,
        vndb_token: row.has_token > 0 ? 'db' : process.env.VNDB_TOKEN ? 'env' : 'none',
      };
    },
  };
}

const sqliteRepository: CacheRepository = {
  async get(key) {
    return (await import('@/lib/db')).getCacheRow(key);
  },
  async getMany(keys) {
    return (await import('@/lib/db')).getCacheRows(keys);
  },
  async put(row) {
    (await import('@/lib/db')).putCacheRow(row);
  },
  async touch(key, fetchedAt, expiresAt) {
    (await import('@/lib/db')).touchCacheRow(key, fetchedAt, expiresAt);
  },
  async deleteKey(key) {
    (await import('@/lib/db')).deleteCacheKey(key);
  },
  async pruneExpired() {
    return (await import('@/lib/db')).pruneExpiredCache();
  },
  async clear() {
    return (await import('@/lib/db')).clearCache();
  },
  async deleteByPathPrefix(pathPrefix) {
    assertLiteralPrefix(pathPrefix);
    return (await import('@/lib/db')).deleteCacheByPathPrefix(pathPrefix);
  },
  async deleteByPatterns(patterns) {
    if (patterns.length === 0) return 0;
    const { db } = await import('@/lib/db');
    const statement = db.prepare('DELETE FROM vndb_cache WHERE cache_key LIKE ?');
    let deleted = 0;
    db.transaction(() => {
      for (const pattern of patterns) deleted += statement.run(pattern).changes;
    })();
    return deleted;
  },
  async freshness(patterns) {
    return (await import('@/lib/db')).getCacheFreshness([...patterns]);
  },
  async stats() {
    return (await import('@/lib/db')).cacheStats();
  },
  async databaseStatus() {
    return (await import('@/lib/db')).getDbStatus();
  },
};

let postgresRepository: CacheRepository | null = null;

/** Return the cache repository selected by the configured backend. */
export function getCacheRepository(): CacheRepository {
  if (readDatabaseConfig().backend !== 'postgres') return sqliteRepository;
  postgresRepository ??= createPostgresCacheRepository();
  return postgresRepository;
}
