import 'server-only';
import type { QueryResultRow } from 'pg';
import { readDatabaseConfig } from '../postgres-config';
import { postgresQuery } from '../postgres';

interface TitleReadingRow extends QueryResultRow {
  vn_id: string;
  reading: string;
}

/** Batch-read cached EGS furigana, including titles outside the collection. */
export async function loadTitleReadings(ids: readonly string[]): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();
  if (readDatabaseConfig().backend === 'postgres') {
    const result = await postgresQuery<TitleReadingRow>(`
      SELECT vn_id, gamename_furigana AS reading FROM egs_game
      WHERE vn_id = ANY($1::text[]) AND NULLIF(TRIM(gamename_furigana), '') IS NOT NULL
    `, [ids]);
    return new Map(result.rows.map((row) => [row.vn_id, row.reading]));
  }
  const { db } = await import('@/lib/db');
  const placeholders = ids.map(() => '?').join(',');
  const rows = db.prepare(`
    SELECT vn_id, gamename_furigana AS reading FROM egs_game
    WHERE vn_id IN (${placeholders})
      AND NULLIF(TRIM(gamename_furigana), '') IS NOT NULL
  `).all(...ids) as TitleReadingRow[];
  return new Map(rows.map((row) => [row.vn_id, row.reading]));
}
