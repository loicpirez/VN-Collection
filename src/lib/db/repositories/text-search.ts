import type { QueryResultRow } from 'pg';
import { buildTextSearchSnippet, type TextSearchHit, type TextSearchSource } from '@/lib/text-search';
import { readDatabaseConfig } from '../postgres-config';
import { postgresQuery } from '../postgres';
import { postgresContainsPattern } from '../postgres-search';

interface PostgresTextSearchRow extends QueryResultRow {
  vn_id: string;
  title: string;
  source: TextSearchSource;
  text: string;
}

/** Asynchronous persistence contract for collection textual search. */
export interface TextSearchRepository {
  /** Search notes, custom descriptions, and quotes for a substring. */
  search(query: string, limit?: number): Promise<TextSearchHit[]>;
}

function boundedLimit(limit: number): number {
  return Number.isFinite(limit) && limit > 0 ? Math.min(200, Math.floor(limit)) : 50;
}

/** Create the PostgreSQL-backed textual-search repository. */
export function createPostgresTextSearchRepository(): TextSearchRepository {
  return {
    async search(query, limit = 50) {
      const trimmed = query.trim();
      if (trimmed.length < 2) return [];
      const result = await postgresQuery<PostgresTextSearchRow>(`
        WITH textual_hits AS (
          SELECT c.vn_id, v.title, 'notes'::TEXT AS source, c.notes AS text, 0 AS source_order
          FROM collection c
          JOIN vn v ON v.id = c.vn_id
          WHERE c.notes IS NOT NULL
            AND app_search_normalize(c.notes) LIKE $1 ESCAPE '\\'
          UNION ALL
          SELECT c.vn_id, v.title, 'custom_description'::TEXT AS source, c.custom_description AS text, 1 AS source_order
          FROM collection c
          JOIN vn v ON v.id = c.vn_id
          WHERE c.custom_description IS NOT NULL
            AND app_search_normalize(c.custom_description) LIKE $1 ESCAPE '\\'
          UNION ALL
          SELECT q.vn_id, v.title, 'quote'::TEXT AS source, q.quote AS text, 2 AS source_order
          FROM vn_quote q
          JOIN vn v ON v.id = q.vn_id
          WHERE app_search_normalize(q.quote) LIKE $1 ESCAPE '\\'
        )
        SELECT vn_id, title, source, text
        FROM textual_hits
        ORDER BY source_order, app_search_normalize(title) COLLATE "C", vn_id
        LIMIT $2
      `, [postgresContainsPattern(trimmed), boundedLimit(limit)]);
      return result.rows.map((row) => ({
        vn_id: row.vn_id,
        title: row.title,
        source: row.source,
        snippet: buildTextSearchSnippet(row.text, trimmed),
      }));
    },
  };
}

const sqliteRepository: TextSearchRepository = {
  async search(query, limit) {
    return (await import('@/lib/db')).searchTextual(query, limit);
  },
};

let postgresRepository: TextSearchRepository | null = null;

/** Return the textual-search repository selected by the configured backend. */
export function getTextSearchRepository(): TextSearchRepository {
  if (readDatabaseConfig().backend !== 'postgres') return sqliteRepository;
  postgresRepository ??= createPostgresTextSearchRepository();
  return postgresRepository;
}
