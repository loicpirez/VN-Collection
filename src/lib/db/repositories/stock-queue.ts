import type { QueryResultRow } from 'pg';
import { readDatabaseConfig } from '../postgres-config';
import { postgresQuery } from '../postgres';

/** Local stock-refresh queue scopes backed by application tables. */
export type LocalStockQueueScope = 'collection' | 'reading_queue' | 'recent_stock' | 'recent_checked';

/** One VN identifier and its optional local title in a stock-refresh queue. */
export interface StockQueueEntry {
  vn_id: string;
  title: string | null;
}

/** One page from a local stock-refresh queue. */
export interface StockQueuePage {
  entries: StockQueueEntry[];
  total: number;
}

/** Asynchronous persistence contract for stock-refresh queue enumeration. */
export interface StockQueueRepository {
  /** Read one local queue page in its domain-specific order. */
  list(scope: LocalStockQueueScope, limit: number, offset: number): Promise<StockQueuePage>;
  /** Resolve locally cached titles for externally sourced VN identifiers. */
  titlesFor(vnIds: string[]): Promise<Map<string, string | null>>;
}

interface CountRow extends QueryResultRow {
  count: number;
}

interface QueueRow extends QueryResultRow {
  vn_id: string;
  title: string | null;
}

function postgresScopeSql(scope: LocalStockQueueScope): { count: string; rows: string } {
  if (scope === 'collection') {
    return {
      count: 'SELECT COUNT(*) AS count FROM collection',
      rows: `SELECT c.vn_id, v.title FROM collection c LEFT JOIN vn v ON v.id = c.vn_id
        ORDER BY c.updated_at DESC, c.added_at DESC, c.vn_id LIMIT $1 OFFSET $2`,
    };
  }
  if (scope === 'reading_queue') {
    return {
      count: 'SELECT COUNT(*) AS count FROM reading_queue',
      rows: `SELECT q.vn_id, v.title FROM reading_queue q LEFT JOIN vn v ON v.id = q.vn_id
        ORDER BY q.position ASC, q.vn_id LIMIT $1 OFFSET $2`,
    };
  }
  if (scope === 'recent_stock') return {
    count: 'SELECT COUNT(DISTINCT vn_id) AS count FROM vn_stock_provider_status',
    rows: `SELECT s.vn_id, v.title
      FROM vn_stock_provider_status s LEFT JOIN vn v ON v.id = s.vn_id
      GROUP BY s.vn_id, v.title
      ORDER BY MIN(s.fetched_at) ASC, s.vn_id
      LIMIT $1 OFFSET $2`,
  };
  return {
    count: 'SELECT COUNT(DISTINCT vn_id) AS count FROM vn_stock_provider_status',
    rows: `SELECT s.vn_id, v.title
      FROM vn_stock_provider_status s LEFT JOIN vn v ON v.id = s.vn_id
      GROUP BY s.vn_id, v.title
      ORDER BY MAX(s.fetched_at) DESC, s.vn_id
      LIMIT $1 OFFSET $2`,
  };
}

/** Create the PostgreSQL-backed stock queue repository. */
export function createPostgresStockQueueRepository(): StockQueueRepository {
  return {
    async list(scope, limit, offset) {
      const sql = postgresScopeSql(scope);
      const [countResult, rowsResult] = await Promise.all([
        postgresQuery<CountRow>(sql.count),
        postgresQuery<QueueRow>(sql.rows, [limit, offset]),
      ]);
      return { entries: rowsResult.rows, total: countResult.rows[0]?.count ?? 0 };
    },
    async titlesFor(vnIds) {
      const map = new Map<string, string | null>();
      if (vnIds.length === 0) return map;
      const result = await postgresQuery<{ id: string; title: string } & QueryResultRow>(
        'SELECT id, title FROM vn WHERE id = ANY($1::text[])',
        [vnIds],
      );
      for (const row of result.rows) map.set(row.id, row.title);
      for (const id of vnIds) if (!map.has(id)) map.set(id, null);
      return map;
    },
  };
}

const sqliteRepository: StockQueueRepository = {
  async list(scope, limit, offset) {
    const { db } = await import('@/lib/db');
    if (scope === 'collection') {
      const total = (db.prepare('SELECT COUNT(*) AS count FROM collection').get() as { count: number }).count;
      const entries = db.prepare(`SELECT c.vn_id, v.title FROM collection c LEFT JOIN vn v ON v.id = c.vn_id
        ORDER BY c.updated_at DESC, c.added_at DESC, c.vn_id LIMIT ? OFFSET ?`).all(limit, offset) as StockQueueEntry[];
      return { entries, total };
    }
    if (scope === 'reading_queue') {
      const total = (db.prepare('SELECT COUNT(*) AS count FROM reading_queue').get() as { count: number }).count;
      const entries = db.prepare(`SELECT q.vn_id, v.title FROM reading_queue q LEFT JOIN vn v ON v.id = q.vn_id
        ORDER BY q.position ASC, q.vn_id LIMIT ? OFFSET ?`).all(limit, offset) as StockQueueEntry[];
      return { entries, total };
    }
    const total = (db.prepare('SELECT COUNT(DISTINCT vn_id) AS count FROM vn_stock_provider_status').get() as { count: number }).count;
    const order = scope === 'recent_stock' ? 'MIN(s.fetched_at) ASC' : 'MAX(s.fetched_at) DESC';
    const entries = db.prepare(`SELECT s.vn_id, v.title
      FROM vn_stock_provider_status s LEFT JOIN vn v ON v.id = s.vn_id
      GROUP BY s.vn_id
      ORDER BY ${order}, s.vn_id
      LIMIT ? OFFSET ?`).all(limit, offset) as StockQueueEntry[];
    return { entries, total };
  },
  async titlesFor(vnIds) {
    const map = new Map<string, string | null>();
    if (vnIds.length === 0) return map;
    const { db } = await import('@/lib/db');
    for (let offset = 0; offset < vnIds.length; offset += 500) {
      const chunk = vnIds.slice(offset, offset + 500);
      const placeholders = chunk.map(() => '?').join(',');
      const rows = db.prepare(`SELECT id, title FROM vn WHERE id IN (${placeholders})`).all(...chunk) as { id: string; title: string }[];
      for (const row of rows) map.set(row.id, row.title);
    }
    for (const id of vnIds) if (!map.has(id)) map.set(id, null);
    return map;
  },
};

let postgresRepository: StockQueueRepository | null = null;

/** Return the configured stock-refresh queue repository. */
export function getStockQueueRepository(): StockQueueRepository {
  if (readDatabaseConfig().backend !== 'postgres') return sqliteRepository;
  postgresRepository ??= createPostgresStockQueueRepository();
  return postgresRepository;
}
