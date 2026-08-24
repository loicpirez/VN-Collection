/**
 * Read-only aggregator for the EGS section of `/schema`.
 *
 * Returns row counts + most-recent `fetched_at` for every EGS-related
 * surface: the materialised `egs_game` table, the manual override
 * tables, the EGS-prefixed rows in `vndb_cache`, and the `egs_username`
 * `app_setting` row. Kept side-effect-free so the schema page can call
 * it during SSR without dragging in a DB write path.
 *
 * Schema browsing is the only consumer today; the test suite pins the
 * shape so regressions surface immediately.
 */

import { getEgsSchemaRepository } from './db/repositories/egs-schema';

export interface SchemaEgsTableSummary {
  /** Stable key used by the i18n dictionary; also the table identifier. */
  key:
    | 'egs_game'
    | 'vndb_cache_egs'
    | 'vn_egs_link'
    | 'egs_vn_link';
  rowCount: number;
  /** Most recent `fetched_at` epoch ms; `null` when the table is empty. */
  lastFetchedAt: number | null;
}

export interface SchemaEgsSummary {
  tables: SchemaEgsTableSummary[];
  /** True when any EGS cache row carries a stale-while-error flag. */
  staleWhileError: boolean;
  /** Whether `app_setting.egs_username` is set (no value echoed). */
  egsUsernameSet: boolean;
}

/**
 * Build the EGS schema summary. Resilient to a fresh DB where any of
 * the four tables might be empty — every counter is `0` and the
 * fetched-at column is `null` rather than throwing.
 */
export async function getSchemaEgsSummary(): Promise<SchemaEgsSummary> {
  return getEgsSchemaRepository().summary();
}
