import type { QueryResultRow } from 'pg';
import type { SchemaEgsSummary, SchemaEgsTableSummary } from '@/lib/schema-egs';
import { readDatabaseConfig } from '../postgres-config';
import { postgresQuery } from '../postgres';

/** Read-only persistence boundary for EGS schema diagnostics. */
export interface EgsSchemaRepository {
  /** Aggregate EGS row counts, freshness, fallback state, and account presence. */
  summary(): Promise<SchemaEgsSummary>;
}

interface SummaryRow extends QueryResultRow {
  egs_game_count: number;
  egs_game_last: number | null;
  cache_count: number;
  cache_last: number | null;
  vn_egs_count: number;
  vn_egs_last: number | null;
  egs_vn_count: number;
  egs_vn_last: number | null;
  stale_while_error: boolean;
  egs_username_set: boolean;
}

function toSummary(row: SummaryRow): SchemaEgsSummary {
  const tables: SchemaEgsTableSummary[] = [
    { key: 'egs_game', rowCount: row.egs_game_count, lastFetchedAt: row.egs_game_last },
    { key: 'vndb_cache_egs', rowCount: row.cache_count, lastFetchedAt: row.cache_last },
    { key: 'vn_egs_link', rowCount: row.vn_egs_count, lastFetchedAt: row.vn_egs_last },
    { key: 'egs_vn_link', rowCount: row.egs_vn_count, lastFetchedAt: row.egs_vn_last },
  ];
  return {
    tables,
    staleWhileError: row.stale_while_error,
    egsUsernameSet: row.egs_username_set,
  };
}

/** Create the PostgreSQL-backed EGS schema diagnostics repository. */
export function createPostgresEgsSchemaRepository(): EgsSchemaRepository {
  return {
    async summary() {
      const result = await postgresQuery<SummaryRow>(`
        SELECT
          (SELECT COUNT(*) FROM egs_game) AS egs_game_count,
          (SELECT MAX(fetched_at) FROM egs_game) AS egs_game_last,
          (SELECT COUNT(*) FROM vndb_cache WHERE cache_key LIKE 'egs:%') AS cache_count,
          (SELECT MAX(fetched_at) FROM vndb_cache WHERE cache_key LIKE 'egs:%') AS cache_last,
          (SELECT COUNT(*) FROM vn_egs_link) AS vn_egs_count,
          (SELECT MAX(updated_at) FROM vn_egs_link) AS vn_egs_last,
          (SELECT COUNT(*) FROM egs_vn_link) AS egs_vn_count,
          (SELECT MAX(updated_at) FROM egs_vn_link) AS egs_vn_last,
          EXISTS (
            SELECT 1 FROM vndb_cache
            WHERE cache_key LIKE 'egs:%' AND body LIKE '%"staleWhileError":true%'
          ) AS stale_while_error,
          EXISTS (
            SELECT 1 FROM app_setting
            WHERE key = 'egs_username' AND value IS NOT NULL AND value <> ''
          ) AS egs_username_set
      `);
      const row = result.rows[0];
      if (!row) throw new Error('EGS schema summary query returned no row');
      return toSummary(row);
    },
  };
}

const sqliteRepository: EgsSchemaRepository = {
  async summary() {
    const { db } = await import('@/lib/db');
    const egsGame = db.prepare('SELECT COUNT(*) AS n, MAX(fetched_at) AS last FROM egs_game')
      .get() as { n: number; last: number | null };
    const cache = db.prepare(
      "SELECT COUNT(*) AS n, MAX(fetched_at) AS last FROM vndb_cache WHERE cache_key LIKE 'egs:%'",
    ).get() as { n: number; last: number | null };
    const vnEgs = db.prepare('SELECT COUNT(*) AS n, MAX(updated_at) AS last FROM vn_egs_link')
      .get() as { n: number; last: number | null };
    const egsVn = db.prepare('SELECT COUNT(*) AS n, MAX(updated_at) AS last FROM egs_vn_link')
      .get() as { n: number; last: number | null };
    const stale = db.prepare(
      "SELECT 1 FROM vndb_cache WHERE cache_key LIKE 'egs:%' AND body LIKE '%\"staleWhileError\":true%' LIMIT 1",
    ).get();
    const username = db.prepare(
      "SELECT value FROM app_setting WHERE key = 'egs_username' AND value IS NOT NULL AND value <> ''",
    ).get();
    return toSummary({
      egs_game_count: egsGame.n,
      egs_game_last: egsGame.last ?? null,
      cache_count: cache.n,
      cache_last: cache.last ?? null,
      vn_egs_count: vnEgs.n,
      vn_egs_last: vnEgs.last ?? null,
      egs_vn_count: egsVn.n,
      egs_vn_last: egsVn.last ?? null,
      stale_while_error: !!stale,
      egs_username_set: !!username,
    });
  },
};

let postgresRepository: EgsSchemaRepository | null = null;

/** Return the EGS schema diagnostics repository selected by the configured backend. */
export function getEgsSchemaRepository(): EgsSchemaRepository {
  if (readDatabaseConfig().backend !== 'postgres') return sqliteRepository;
  postgresRepository ??= createPostgresEgsSchemaRepository();
  return postgresRepository;
}
