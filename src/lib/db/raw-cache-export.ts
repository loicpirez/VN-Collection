import type { QueryResult, QueryResultRow } from 'pg';
import { readDatabaseConfig } from './postgres-config';
import { getPostgresPool } from './postgres';

const CURSOR_BATCH_SIZE = 250;

interface RawCacheRow extends QueryResultRow {
  cache_key: string;
  body: string;
  etag: string | null;
  last_modified: string | null;
  fetched_at: number;
  expires_at: number;
}

interface CountRow extends QueryResultRow {
  count: number;
}

/** Minimal PostgreSQL client required by the raw cache exporter. */
export interface RawCacheExportClient {
  /** Execute one snapshot or cursor query. */
  query<Row extends QueryResultRow>(text: string): Promise<QueryResult<Row>>;
  /** Return the checked-out connection. */
  release(): void;
}

/** Minimal PostgreSQL pool required by the raw cache exporter. */
export interface RawCacheExportPool {
  /** Acquire one client for the snapshot lifetime. */
  connect(): Promise<RawCacheExportClient>;
}

/** Stream metadata returned to the raw-cache download route. */
export interface RawCacheExportDownload {
  /** Valid JSON document streamed with constant application memory. */
  stream: ReadableStream<Uint8Array>;
  /** Suggested attachment filename. */
  filename: string;
}

function header(exportedAt: number, count: number): string {
  return `{\n  "exported_at": ${exportedAt},\n  "entry_count": ${count},\n  "entries": [\n`;
}

function serializeRow(row: RawCacheRow): string {
  let body: unknown;
  try {
    body = JSON.parse(row.body) as unknown;
  } catch {
    body = row.body;
  }
  return JSON.stringify({
    cache_key: row.cache_key,
    etag: row.etag,
    last_modified: row.last_modified,
    fetched_at: row.fetched_at,
    expires_at: row.expires_at,
    body,
  });
}

function streamGenerator(
  iterator: AsyncGenerator<Uint8Array>,
  cleanup: () => Promise<void>,
): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const next = await iterator.next();
        if (next.done) controller.close();
        else controller.enqueue(next.value);
      } catch (error) {
        controller.error(error);
      }
    },
    async cancel() {
      await iterator.return(undefined);
      await cleanup();
    },
  });
}

/** Create a repeatable-read PostgreSQL cache export backed by a server cursor. */
export async function createPostgresRawCacheExport(
  pool: RawCacheExportPool = getPostgresPool(),
): Promise<RawCacheExportDownload> {
  const client = await pool.connect();
  const exportedAt = Date.now();
  const encoder = new TextEncoder();
  let cursorOpen = false;
  let transactionOpen = false;
  let released = false;
  const cleanup = async (): Promise<void> => {
    if (released) return;
    if (cursorOpen) {
      try {
        await client.query('CLOSE raw_cache_export_cursor');
      } catch {
        // Rollback below releases cursor state when explicit close fails.
      }
      cursorOpen = false;
    }
    if (transactionOpen) {
      try {
        await client.query('ROLLBACK');
      } catch {
        // Connection release remains mandatory after a failed rollback.
      }
      transactionOpen = false;
    }
    released = true;
    client.release();
  };

  try {
    await client.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
    transactionOpen = true;
    const countResult = await client.query<CountRow>('SELECT COUNT(*)::BIGINT AS count FROM vndb_cache');
    const count = countResult.rows[0]?.count ?? 0;
    await client.query(`
      DECLARE raw_cache_export_cursor NO SCROLL CURSOR FOR
      SELECT cache_key, body, etag, last_modified, fetched_at, expires_at
      FROM vndb_cache ORDER BY cache_key COLLATE "C"
    `);
    cursorOpen = true;

    async function* records(): AsyncGenerator<Uint8Array> {
      let first = true;
      try {
        yield encoder.encode(header(exportedAt, count));
        while (true) {
          const batch = await client.query<RawCacheRow>(
            `FETCH FORWARD ${CURSOR_BATCH_SIZE} FROM raw_cache_export_cursor`,
          );
          if (batch.rows.length === 0) break;
          for (const row of batch.rows) {
            const prefix = first ? '    ' : ',\n    ';
            first = false;
            yield encoder.encode(`${prefix}${serializeRow(row)}`);
          }
        }
        yield encoder.encode('\n  ]\n}\n');
        await client.query('CLOSE raw_cache_export_cursor');
        cursorOpen = false;
        await client.query('COMMIT');
        transactionOpen = false;
        released = true;
        client.release();
      } finally {
        await cleanup();
      }
    }

    return {
      stream: streamGenerator(records(), cleanup),
      filename: `vndb-raw-${new Date(exportedAt).toISOString().slice(0, 10)}.json`,
    };
  } catch (error) {
    await cleanup();
    throw error;
  }
}

/** Create a bounded-memory SQLite cache export using a row iterator. */
export async function createSqliteRawCacheExport(): Promise<RawCacheExportDownload> {
  const { db } = await import('@/lib/db');
  const exportedAt = Date.now();
  const encoder = new TextEncoder();
  const count = (db.prepare('SELECT COUNT(*) AS count FROM vndb_cache').get() as { count: number }).count;
  let iterator: IterableIterator<RawCacheRow> | null = null;
  const cleanup = async (): Promise<void> => {
    if (!iterator || typeof iterator.return !== 'function') return;
    const current = iterator;
    const finish = iterator.return;
    iterator = null;
    finish.call(current, undefined);
  };

  async function* records(): AsyncGenerator<Uint8Array> {
    let first = true;
    try {
      yield encoder.encode(header(exportedAt, count));
      iterator = db.prepare(`
        SELECT cache_key, body, etag, last_modified, fetched_at, expires_at
        FROM vndb_cache ORDER BY cache_key
      `).iterate() as IterableIterator<RawCacheRow>;
      while (iterator) {
        const next = iterator.next();
        if (next.done) {
          iterator = null;
          break;
        }
        const prefix = first ? '    ' : ',\n    ';
        first = false;
        yield encoder.encode(`${prefix}${serializeRow(next.value)}`);
      }
      yield encoder.encode('\n  ]\n}\n');
    } finally {
      await cleanup();
    }
  }

  return {
    stream: streamGenerator(records(), cleanup),
    filename: `vndb-raw-${new Date(exportedAt).toISOString().slice(0, 10)}.json`,
  };
}

/** Create the raw cache export selected by the configured database backend. */
export async function createRawCacheExport(): Promise<RawCacheExportDownload> {
  return readDatabaseConfig().backend === 'postgres'
    ? createPostgresRawCacheExport()
    : createSqliteRawCacheExport();
}
