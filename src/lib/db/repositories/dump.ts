import type { QueryResultRow } from 'pg';
import type { DumpStatusEntry, DumpSummary } from '@/lib/db';
import { readDatabaseConfig } from '../postgres-config';
import { postgresQuery } from '../postgres';

/** Read model used by the dump-progress page. */
export interface DumpRepository {
  /** Return collection-wide dump progress counters. */
  summary(): Promise<DumpSummary>;
  /** Return per-VN dump progress in the established work-first order. */
  listStatus(): Promise<DumpStatusEntry[]>;
  /** Return VN ids represented by a regular or face-out shelf slot. */
  listShelfVnIds(): Promise<Set<string>>;
}

interface DumpStatusRow extends QueryResultRow {
  vn_id: string;
  vn_title: string;
  vn_image_thumb: string | null;
  vn_image_url: string | null;
  vn_local_image_thumb: string | null;
  vn_image_sexual: number | null;
  coll_dumped: number;
  dumped_ignored: number;
  total_editions: number;
  dumped_editions: number;
}

interface DumpTotalsRow extends QueryResultRow {
  total_vns: number;
  total_editions: number;
  dumped_editions: number;
  coll_dumped_no_editions: number;
  fully_dumped_vns: number;
}

interface ShelfVnRow extends QueryResultRow {
  vn_id: string;
}

function statusEntry(row: DumpStatusRow): DumpStatusEntry {
  return {
    vn_id: row.vn_id,
    vn_title: row.vn_title,
    vn_image_thumb: row.vn_image_thumb,
    vn_image_url: row.vn_image_url,
    vn_local_image_thumb: row.vn_local_image_thumb,
    vn_image_sexual: row.vn_image_sexual,
    total_editions: row.total_editions,
    dumped_editions: row.dumped_editions,
    collection_dumped: Boolean(row.coll_dumped),
    dumped_ignored: Boolean(row.dumped_ignored),
  };
}

function statusBucket(entry: DumpStatusEntry): number {
  const done = entry.total_editions > 0 && entry.dumped_editions === entry.total_editions;
  if (entry.dumped_editions > 0 && !done) return 0;
  return done ? 2 : 1;
}

function sortStatus(entries: DumpStatusEntry[]): DumpStatusEntry[] {
  return entries.sort((left, right) => {
    const bucketDifference = statusBucket(left) - statusBucket(right);
    return bucketDifference !== 0
      ? bucketDifference
      : left.vn_title.localeCompare(right.vn_title);
  });
}

function summaryFromTotals(totals: DumpTotalsRow): DumpSummary {
  const numerator = totals.dumped_editions + totals.coll_dumped_no_editions;
  const denominator = totals.total_editions + totals.coll_dumped_no_editions;
  return {
    totalVns: totals.total_vns,
    totalEditions: totals.total_editions,
    dumpedEditions: totals.dumped_editions,
    fullyDumpedVns: totals.fully_dumped_vns,
    editionPct: denominator === 0
      ? 0
      : Math.min(100, Math.round((numerator / denominator) * 100)),
  };
}

/** Create the PostgreSQL-backed dump-progress repository. */
export function createPostgresDumpRepository(): DumpRepository {
  return {
    async summary() {
      const result = await postgresQuery<DumpTotalsRow>(`
        SELECT
          (SELECT COUNT(*)::int FROM collection WHERE dumped_ignored = 0) AS total_vns,
          (SELECT COUNT(*)::int FROM owned_release owned
            JOIN collection coll ON coll.vn_id = owned.vn_id
            WHERE coll.dumped_ignored = 0
          ) AS total_editions,
          (SELECT COUNT(*)::int FROM owned_release owned
            JOIN collection coll ON coll.vn_id = owned.vn_id
            WHERE owned.dumped = 1 AND coll.dumped_ignored = 0
          ) AS dumped_editions,
          (SELECT COUNT(*)::int FROM collection coll
            WHERE coll.dumped = 1
              AND coll.dumped_ignored = 0
              AND NOT EXISTS (
                SELECT 1 FROM owned_release owned WHERE owned.vn_id = coll.vn_id
              )
          ) AS coll_dumped_no_editions,
          (SELECT COUNT(*)::int FROM (
            SELECT owned.vn_id FROM owned_release owned
            JOIN collection coll ON coll.vn_id = owned.vn_id
            WHERE coll.dumped_ignored = 0
            GROUP BY owned.vn_id
            HAVING COUNT(*) FILTER (WHERE owned.dumped <> 1) = 0
            UNION
            SELECT vn_id FROM collection WHERE dumped = 1 AND dumped_ignored = 0
          ) fully_dumped) AS fully_dumped_vns
      `);
      const totals = result.rows[0];
      if (!totals) throw new Error('dump summary query returned no row');
      return summaryFromTotals(totals);
    },
    async listStatus() {
      const result = await postgresQuery<DumpStatusRow>(`
        SELECT
          vn.id AS vn_id,
          vn.title AS vn_title,
          vn.image_thumb AS vn_image_thumb,
          vn.image_url AS vn_image_url,
          vn.local_image_thumb AS vn_local_image_thumb,
          vn.image_sexual AS vn_image_sexual,
          coll.dumped AS coll_dumped,
          coll.dumped_ignored,
          COALESCE(editions.total_editions, 0)::int AS total_editions,
          COALESCE(editions.dumped_editions, 0)::int AS dumped_editions
        FROM collection coll
        JOIN vn ON vn.id = coll.vn_id
        LEFT JOIN (
          SELECT vn_id,
            COUNT(*)::int AS total_editions,
            COUNT(*) FILTER (WHERE dumped = 1)::int AS dumped_editions
          FROM owned_release
          GROUP BY vn_id
        ) editions ON editions.vn_id = vn.id
        ORDER BY vn.title COLLATE "C" ASC
        LIMIT 10000
      `);
      return sortStatus(result.rows.map(statusEntry));
    },
    async listShelfVnIds() {
      const result = await postgresQuery<ShelfVnRow>(`
        SELECT vn_id FROM shelf_slot
        UNION
        SELECT vn_id FROM shelf_display_slot
      `);
      return new Set(result.rows.map((row) => row.vn_id));
    },
  };
}

const sqliteRepository: DumpRepository = {
  async summary() {
    return (await import('@/lib/db')).getDumpSummary();
  },
  async listStatus() {
    return (await import('@/lib/db')).listDumpStatus();
  },
  async listShelfVnIds() {
    return (await import('@/lib/db')).listVnIdsOnShelf();
  },
};

let postgresRepository: DumpRepository | null = null;

/** Return the dump-progress repository selected by the configured backend. */
export function getDumpRepository(): DumpRepository {
  if (readDatabaseConfig().backend !== 'postgres') return sqliteRepository;
  postgresRepository ??= createPostgresDumpRepository();
  return postgresRepository;
}
