import type { QueryResultRow } from 'pg';
import type { DuplicateGroup, StaleVn } from '@/lib/db';
import { readDatabaseConfig } from '../postgres-config';
import { postgresQuery } from '../postgres';

const FIND_DUPLICATES_LIMIT = 20_000;

interface TitleRow extends QueryResultRow {
  id: string;
  title: string;
}

interface StaleStorageRow extends QueryResultRow {
  id: string;
  title: string;
  fetched_at: number;
  has_cover: number;
  has_egs: number;
}

/** Read-only persistence boundary for collection maintenance diagnostics. */
export interface MaintenanceRepository {
  /** Find locally mirrored VNs whose normalized titles collide. */
  findDuplicates(): Promise<DuplicateGroup[]>;
  /** Find stale or cover-less VN rows, oldest first. */
  findStaleVns(thresholdMs?: number): Promise<StaleVn[]>;
}

function normalizeTitle(title: string): string {
  return title.toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function duplicateGroups(rows: readonly TitleRow[]): DuplicateGroup[] {
  const groups = new Map<string, string[]>();
  for (const row of rows) {
    const normalized = normalizeTitle(row.title);
    if (normalized.length < 4) continue;
    const ids = groups.get(normalized) ?? [];
    ids.push(row.id);
    groups.set(normalized, ids);
  }
  return [...groups.entries()]
    .filter((entry) => entry[1].length > 1)
    .map(([prefix, ids]) => ({ prefix, ids }));
}

function staleRows(rows: readonly StaleStorageRow[]): StaleVn[] {
  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    fetched_at: row.fetched_at,
    has_cover: Boolean(row.has_cover),
    has_egs: Boolean(row.has_egs),
  }));
}

/** Create the PostgreSQL-backed maintenance repository. */
export function createPostgresMaintenanceRepository(): MaintenanceRepository {
  return {
    async findDuplicates() {
      const result = await postgresQuery<TitleRow>(`
        SELECT id, title FROM vn ORDER BY id COLLATE "C" LIMIT $1
      `, [FIND_DUPLICATES_LIMIT]);
      return duplicateGroups(result.rows);
    },
    async findStaleVns(thresholdMs = 30 * 86_400 * 1000) {
      const cutoff = Date.now() - thresholdMs;
      const result = await postgresQuery<StaleStorageRow>(`
        SELECT vn.id, vn.title, vn.fetched_at,
          CASE WHEN vn.local_image IS NULL AND vn.image_url IS NULL AND vn.custom_cover IS NULL
            THEN 0 ELSE 1 END AS has_cover,
          CASE WHEN egs_game.egs_id IS NULL THEN 0 ELSE 1 END AS has_egs
        FROM vn
        LEFT JOIN egs_game ON egs_game.vn_id = vn.id
        WHERE vn.fetched_at < $1
          OR (vn.local_image IS NULL AND vn.image_url IS NULL AND vn.custom_cover IS NULL)
        ORDER BY vn.fetched_at, vn.id COLLATE "C"
        LIMIT 200
      `, [cutoff]);
      return staleRows(result.rows);
    },
  };
}

const sqliteRepository: MaintenanceRepository = {
  async findDuplicates() {
    return (await import('@/lib/db')).findDuplicates();
  },
  async findStaleVns(thresholdMs) {
    const legacy = await import('@/lib/db');
    return thresholdMs === undefined ? legacy.findStaleVns() : legacy.findStaleVns(thresholdMs);
  },
};

let postgresRepository: MaintenanceRepository | null = null;

/** Return the maintenance repository selected by the configured backend. */
export function getMaintenanceRepository(): MaintenanceRepository {
  if (readDatabaseConfig().backend !== 'postgres') return sqliteRepository;
  postgresRepository ??= createPostgresMaintenanceRepository();
  return postgresRepository;
}
