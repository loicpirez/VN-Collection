import type { QueryResultRow } from 'pg';
import { STOCK_PROVIDER_IDS, type StockProviderId } from '@/lib/stock-provider-constants';
import { readDatabaseConfig } from '../postgres-config';
import { postgresQuery } from '../postgres';

/** One provider-level stock freshness diagnostic. */
export interface StockProviderFreshness {
  provider: StockProviderId;
  latest_status_at: number | null;
  status_rows: number;
  last_batch_started_at: number | null;
  updated_after_last_batch: boolean | null;
}

/** Persistence contract for provider-level stock freshness diagnostics. */
export interface StockProviderMaintenanceRepository {
  /** @returns Every canonical live provider with its latest status and selected batch timestamps. */
  listFreshness(): Promise<StockProviderFreshness[]>;
}

interface StatusAggregateRow extends QueryResultRow {
  provider: string;
  latest_status_at: number | null;
  status_rows: number;
}

interface BatchProviderRow extends QueryResultRow {
  provider: string;
  started_at: number;
}

/**
 * Compare provider status writes with the latest completed batch that selected
 * each provider.
 *
 * @param statusRows Aggregated provider status rows.
 * @param batchRows Completed stock batches ordered newest first.
 * @returns Freshness evidence for every canonical provider.
 */
export function summarizeStockProviderFreshness(
  statusRows: StatusAggregateRow[],
  batchRows: BatchProviderRow[],
): StockProviderFreshness[] {
  const statusByProvider = new Map(statusRows.map((row) => [row.provider, row]));
  const lastBatchByProvider = new Map<StockProviderId, number>();
  const allowed = new Set<string>(STOCK_PROVIDER_IDS);
  for (const row of batchRows) {
    if (!allowed.has(row.provider)) continue;
    const provider = row.provider as StockProviderId;
    const startedAt = Number(row.started_at);
    const current = lastBatchByProvider.get(provider);
    if (current === undefined || startedAt > current) lastBatchByProvider.set(provider, startedAt);
  }
  return STOCK_PROVIDER_IDS.map((provider) => {
    const status = statusByProvider.get(provider);
    const latestStatusAt = status?.latest_status_at == null ? null : Number(status.latest_status_at);
    const lastBatchStartedAt = lastBatchByProvider.get(provider) ?? null;
    return {
      provider,
      latest_status_at: latestStatusAt,
      status_rows: status ? Number(status.status_rows) : 0,
      last_batch_started_at: lastBatchStartedAt,
      updated_after_last_batch: lastBatchStartedAt === null
        ? null
        : latestStatusAt !== null && latestStatusAt >= lastBatchStartedAt,
    };
  });
}

async function listPostgresFreshness(): Promise<StockProviderFreshness[]> {
  const [statuses, batches] = await Promise.all([
    postgresQuery<StatusAggregateRow>(`
      SELECT provider, MAX(fetched_at) AS latest_status_at, COUNT(*) AS status_rows
      FROM vn_stock_provider_status GROUP BY provider
    `),
    postgresQuery<BatchProviderRow>(`
      SELECT provider, started_at FROM stock_provider_batch_run
    `),
  ]);
  return summarizeStockProviderFreshness(statuses.rows, batches.rows);
}

async function listSqliteFreshness(): Promise<StockProviderFreshness[]> {
  const { db } = await import('@/lib/db');
  const statuses = db.prepare(`
    SELECT provider, MAX(fetched_at) AS latest_status_at, COUNT(*) AS status_rows
    FROM vn_stock_provider_status GROUP BY provider
  `).all() as StatusAggregateRow[];
  const batches = db.prepare(`
    SELECT provider, started_at FROM stock_provider_batch_run
  `).all() as BatchProviderRow[];
  return summarizeStockProviderFreshness(statuses, batches);
}

/** @returns A repository backed by the configured SQLite or PostgreSQL database. */
export function getStockProviderMaintenanceRepository(): StockProviderMaintenanceRepository {
  return {
    listFreshness: readDatabaseConfig().backend === 'postgres'
      ? listPostgresFreshness
      : listSqliteFreshness,
  };
}
