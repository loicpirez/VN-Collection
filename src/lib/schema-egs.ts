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

import { db } from './db';

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
export function getSchemaEgsSummary(): SchemaEgsSummary {
  const tables: SchemaEgsTableSummary[] = [];

  // egs_game — one row per VN ↔ EGS mapping (including the "no
  // match" sentinel rows). `fetched_at` is set on every refresh.
  const eg = db
    .prepare('SELECT COUNT(*) AS n, MAX(fetched_at) AS last FROM egs_game')
    .get() as { n: number; last: number | null };
  tables.push({ key: 'egs_game', rowCount: eg.n, lastFetchedAt: eg.last ?? null });

  // vndb_cache rows scoped to EGS prefixes — covers the cover-
  // resolver (egs:cover-resolved:*) plus any future egs:* namespaces.
  const cache = db
    .prepare("SELECT COUNT(*) AS n, MAX(fetched_at) AS last FROM vndb_cache WHERE cache_key LIKE 'egs:%'")
    .get() as { n: number; last: number | null };
  tables.push({ key: 'vndb_cache_egs', rowCount: cache.n, lastFetchedAt: cache.last ?? null });

  // Manual VN → EGS override table. `updated_at` doubles as "last
  // touch" here — there's no separate fetched_at column.
  const vnEgs = db
    .prepare('SELECT COUNT(*) AS n, MAX(updated_at) AS last FROM vn_egs_link')
    .get() as { n: number; last: number | null };
  tables.push({ key: 'vn_egs_link', rowCount: vnEgs.n, lastFetchedAt: vnEgs.last ?? null });

  // Manual EGS → VNDB override table — symmetric to the above.
  const egsVn = db
    .prepare('SELECT COUNT(*) AS n, MAX(updated_at) AS last FROM egs_vn_link')
    .get() as { n: number; last: number | null };
  tables.push({ key: 'egs_vn_link', rowCount: egsVn.n, lastFetchedAt: egsVn.last ?? null });

  // Stale-while-error detection: any cache row whose body carries
  // the `staleWhileError` JSON flag. The flag is written by the
  // `egs_*` fetch helpers when the upstream call failed and the
  // cached body was served as fallback.
  const stale = db
    .prepare(
      "SELECT 1 FROM vndb_cache WHERE cache_key LIKE 'egs:%' AND body LIKE '%\"staleWhileError\":true%' LIMIT 1",
    )
    .get();

  const username = db
    .prepare("SELECT value FROM app_setting WHERE key = 'egs_username'")
    .get() as { value: string | null } | undefined;

  return {
    tables,
    staleWhileError: !!stale,
    egsUsernameSet: !!username?.value,
  };
}
