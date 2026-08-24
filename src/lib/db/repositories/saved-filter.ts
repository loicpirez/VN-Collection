import type { QueryResultRow } from 'pg';
import type { SavedFilter } from '@/lib/db';
import { readDatabaseConfig } from '../postgres-config';
import { postgresQuery, withPostgresTransaction } from '../postgres';

interface SavedFilterRow extends QueryResultRow, SavedFilter {}

/** Persistence boundary for ordered saved library filters. */
export interface SavedFilterRepository {
  /** List saved filters in the operator's chosen order. */
  list(): Promise<SavedFilter[]>;
  /** Delete one saved filter and report whether it existed. */
  delete(id: number): Promise<boolean>;
  /** Persist a partial or complete saved-filter ordering. */
  reorder(ids: readonly number[]): Promise<void>;
}

/** Create the PostgreSQL-backed saved-filter repository. */
export function createPostgresSavedFilterRepository(): SavedFilterRepository {
  return {
    async list() {
      const result = await postgresQuery<SavedFilterRow>(`
        SELECT id, name, params, position, created_at
        FROM saved_filter ORDER BY position, id LIMIT 500
      `);
      return result.rows;
    },
    async delete(id) {
      return (await postgresQuery('DELETE FROM saved_filter WHERE id = $1', [id])).rowCount === 1;
    },
    async reorder(ids) {
      await withPostgresTransaction(async (client) => {
        for (const [index, id] of ids.entries()) {
          await client.query('UPDATE saved_filter SET position = $1 WHERE id = $2', [index + 1, id]);
        }
      });
    },
  };
}

const sqliteRepository: SavedFilterRepository = {
  async list() {
    return (await import('@/lib/db')).listSavedFilters();
  },
  async delete(id) {
    return (await import('@/lib/db')).deleteSavedFilter(id);
  },
  async reorder(ids) {
    (await import('@/lib/db')).reorderSavedFilters([...ids]);
  },
};

let postgresRepository: SavedFilterRepository | null = null;

/** Return the saved-filter repository selected by the configured backend. */
export function getSavedFilterRepository(): SavedFilterRepository {
  if (readDatabaseConfig().backend !== 'postgres') return sqliteRepository;
  postgresRepository ??= createPostgresSavedFilterRepository();
  return postgresRepository;
}
