import type { QueryResultRow } from 'pg';
import { readDatabaseConfig } from '../postgres-config';
import { postgresQuery, withPostgresTransaction } from '../postgres';

/** One ordered reading-queue entry. */
export interface ReadingQueueEntry {
  vn_id: string;
  position: number;
  added_at: number;
}

/** Asynchronous persistence contract for the reading queue. */
export interface ReadingQueueRepository {
  /** List the queue in operator-defined order. */
  list(): Promise<ReadingQueueEntry[]>;
  /** Add one VN idempotently at the end of the queue. */
  add(vnId: string): Promise<ReadingQueueEntry>;
  /** Remove one VN and report whether a row existed. */
  remove(vnId: string): Promise<boolean>;
  /** Persist the supplied VN order atomically. */
  reorder(vnIds: readonly string[]): Promise<void>;
}

function requireEntry(entry: ReadingQueueEntry | undefined): ReadingQueueEntry {
  if (!entry) throw new Error('reading queue insert did not return a row');
  return entry;
}

/** Create the PostgreSQL-backed reading-queue repository. */
export function createPostgresReadingQueueRepository(): ReadingQueueRepository {
  return {
    async list() {
      const result = await postgresQuery<ReadingQueueEntry & QueryResultRow>(`
        SELECT vn_id, position, added_at FROM reading_queue
        ORDER BY position, added_at, vn_id LIMIT 1000
      `);
      return result.rows;
    },
    async add(vnId) {
      return withPostgresTransaction(async (client) => {
        const normalized = vnId.toLowerCase();
        await client.query("SELECT pg_advisory_xact_lock(hashtextextended('reading_queue:position', 0))");
        const existing = await client.query<ReadingQueueEntry & QueryResultRow>(`
          SELECT vn_id, position, added_at FROM reading_queue WHERE vn_id = $1
        `, [normalized]);
        if (existing.rows[0]) return existing.rows[0];
        const result = await client.query<ReadingQueueEntry & QueryResultRow>(`
          INSERT INTO reading_queue (vn_id, position, added_at)
          VALUES (
            $1,
            (SELECT COALESCE(MAX(position), 0) + 1 FROM reading_queue),
            $2
          )
          RETURNING vn_id, position, added_at
        `, [normalized, Date.now()]);
        return requireEntry(result.rows[0]);
      });
    },
    async remove(vnId) {
      const result = await postgresQuery('DELETE FROM reading_queue WHERE vn_id = $1', [vnId.toLowerCase()]);
      return (result.rowCount ?? 0) > 0;
    },
    async reorder(vnIds) {
      if (vnIds.length === 0) return;
      await withPostgresTransaction(async (client) => {
        await client.query("SELECT pg_advisory_xact_lock(hashtextextended('reading_queue:position', 0))");
        for (const [index, vnId] of vnIds.entries()) {
          await client.query('UPDATE reading_queue SET position = $1 WHERE vn_id = $2', [index + 1, vnId.toLowerCase()]);
        }
      });
    },
  };
}

const sqliteRepository: ReadingQueueRepository = {
  async list() {
    return (await import('@/lib/db')).listReadingQueue();
  },
  async add(vnId) {
    return (await import('@/lib/db')).addToReadingQueue(vnId);
  },
  async remove(vnId) {
    return (await import('@/lib/db')).removeFromReadingQueue(vnId);
  },
  async reorder(vnIds) {
    (await import('@/lib/db')).reorderReadingQueue([...vnIds]);
  },
};

let postgresRepository: ReadingQueueRepository | null = null;

/** Return the reading-queue repository selected by the configured backend. */
export function getReadingQueueRepository(): ReadingQueueRepository {
  if (readDatabaseConfig().backend !== 'postgres') return sqliteRepository;
  postgresRepository ??= createPostgresReadingQueueRepository();
  return postgresRepository;
}
