import type { QueryResultRow } from 'pg';
import { parseJsonArray } from '@/lib/json-shape';
import { isPersistedExtlinks, isPersistedTitles } from '@/lib/vn-persisted-json-shape';
import type { StockTitleContext } from '@/lib/stock-query';
import type { CollectionItem, EgsLite, SeriesLite, VnRow } from '@/lib/types';
import { readDatabaseConfig } from '../postgres-config';
import { postgresQuery } from '../postgres';
import { postgresContainsPattern } from '../postgres-search';
import {
  mapCollectionItemRow,
  type CollectionItemDatabaseRow,
} from '../collection-item-mapper';

/** Minimal VN projection required by the stock discovery pipeline. */
export type StockVnContext = StockTitleContext & Pick<VnRow, 'extlinks'>;

/** Lightweight local cover projection used by discovery pages. */
export interface LocalVnCoverRow {
  id: string;
  image_url: string | null;
  image_thumb: string | null;
  image_sexual: number | null;
  local_image: string | null;
  local_image_thumb: string | null;
}

/** Asynchronous persistence contract for stock-specific VN metadata. */
export interface VnReadRepository {
  /** Return one fully decoded VN with optional collection, series, and EGS data. */
  getCollectionItem(vnId: string): Promise<CollectionItem | null>;
  /** Report whether a cached VN is a synthetic EGS-only row. */
  isEgsOnly(vnId: string): Promise<boolean>;
  /** Return the title and external-link context used for stock discovery. */
  getStockContext(vnId: string): Promise<StockVnContext | null>;
  /** Find one locally cached VN by a case-insensitive title fragment. */
  findTitleMatch(query: string): Promise<{ vnId: string; title: string } | null>;
  /** Return local and remote cover paths for a set of VN identifiers. */
  getCovers(vnIds: readonly string[]): Promise<LocalVnCoverRow[]>;
}

interface PostgresStockVnRow extends QueryResultRow {
  title: string;
  alttitle: string | null;
  titles: string | null;
  extlinks: string | null;
}

interface PostgresSeriesRow extends SeriesLite, QueryResultRow {}

interface PostgresEgsLiteRow extends QueryResultRow {
  egs_id: number | null;
  median: number | null;
  average: number | null;
  count: number | null;
  playtime_median_minutes: number | null;
  source: EgsLite['source'];
  okazu: number | null;
  erogame: number | null;
}

function decodeTitles(raw: string | null): VnRow['titles'] {
  const value = parseJsonArray(raw);
  return isPersistedTitles(value) ? value : [];
}

function decodeExtlinks(raw: string | null): VnRow['extlinks'] {
  const value = parseJsonArray(raw);
  return isPersistedExtlinks(value) ? value : [];
}

/** Create the PostgreSQL-backed stock VN reader. */
export function createPostgresVnReadRepository(): VnReadRepository {
  return {
    async getCollectionItem(vnId) {
      const result = await postgresQuery<CollectionItemDatabaseRow & QueryResultRow>(`
        SELECT v.*, c.status, c.user_rating, c.playtime_minutes, c.started_date,
          c.finished_date, c.notes, c.favorite, c.location, c.edition_type,
          c.edition_label, c.physical_location, c.box_type, c.download_url,
          c.dumped, c.dumped_ignored, c.custom_description, c.added_at, c.updated_at
        FROM vn v LEFT JOIN collection c ON c.vn_id = v.id
        WHERE v.id = $1
      `, [vnId]);
      const item = mapCollectionItemRow(result.rows[0]);
      if (!item) return null;
      const [series, egsResult] = await Promise.all([
        postgresQuery<PostgresSeriesRow>(`
          SELECT series.id, series.name
          FROM series JOIN series_vn ON series_vn.series_id = series.id
          WHERE series_vn.vn_id = $1
          ORDER BY series_vn.order_index, series.name, series.id
        `, [vnId]),
        postgresQuery<PostgresEgsLiteRow>(`
          SELECT egs_id, median, average, count, playtime_median_minutes,
            source, okazu, erogame
          FROM egs_game WHERE vn_id = $1
        `, [vnId]),
      ]);
      item.series = series.rows;
      const egs = egsResult.rows[0];
      item.egs = egs ? {
        egs_id: egs.egs_id,
        median: egs.median,
        average: egs.average,
        count: egs.count,
        playtime_median_minutes: egs.playtime_median_minutes,
        source: egs.source,
        okazu: egs.okazu == null ? null : Boolean(egs.okazu),
        erogame: egs.erogame == null ? null : Boolean(egs.erogame),
      } : null;
      return item;
    },
    async isEgsOnly(vnId) {
      const result = await postgresQuery<{ egs_only: number } & QueryResultRow>(
        'SELECT egs_only FROM vn WHERE id = $1',
        [vnId],
      );
      return Boolean(result.rows[0]?.egs_only);
    },
    async getStockContext(vnId) {
      const result = await postgresQuery<PostgresStockVnRow>(
        'SELECT title, alttitle, titles, extlinks FROM vn WHERE id = $1 LIMIT 1',
        [vnId],
      );
      const row = result.rows[0];
      if (!row) return null;
      return {
        title: row.title,
        alttitle: row.alttitle,
        titles: decodeTitles(row.titles),
        extlinks: decodeExtlinks(row.extlinks),
      };
    },
    async findTitleMatch(query) {
      const result = await postgresQuery<{ id: string; title: string } & QueryResultRow>(`
        SELECT id, title FROM vn
        WHERE app_search_normalize(title) LIKE $1 ESCAPE '\\'
          OR app_search_normalize(alttitle) LIKE $1 ESCAPE '\\'
        ORDER BY app_search_normalize(title) COLLATE "C", id
        LIMIT 1
      `, [postgresContainsPattern(query)]);
      const row = result.rows[0];
      return row ? { vnId: row.id, title: row.title } : null;
    },
    async getCovers(vnIds) {
      if (vnIds.length === 0) return [];
      const result = await postgresQuery<LocalVnCoverRow & QueryResultRow>(`
        SELECT id, image_url, image_thumb, image_sexual, local_image, local_image_thumb
        FROM vn WHERE id = ANY($1::text[])
      `, [vnIds]);
      return result.rows;
    },
  };
}

const sqliteRepository: VnReadRepository = {
  async getCollectionItem(vnId) {
    return (await import('@/lib/db')).getCollectionItem(vnId);
  },
  async isEgsOnly(vnId) {
    return (await import('@/lib/db')).isEgsOnly(vnId);
  },
  async getStockContext(vnId) {
    const row = (await import('@/lib/db')).getCollectionItem(vnId);
    if (!row) return null;
    return {
      title: row.title,
      alttitle: row.alttitle,
      titles: row.titles,
      extlinks: row.extlinks,
    };
  },
  async findTitleMatch(query) {
    const escaped = query.replace(/[%_]/g, '\\$&');
    const like = `%${escaped}%`;
    const row = (await import('@/lib/db')).db
      .prepare(`SELECT id, title FROM vn WHERE title LIKE ? ESCAPE '\\' OR alttitle LIKE ? ESCAPE '\\' ORDER BY title COLLATE NOCASE LIMIT 1`)
      .get(like, like) as { id: string; title: string } | undefined;
    return row ? { vnId: row.id, title: row.title } : null;
  },
  async getCovers(vnIds) {
    if (vnIds.length === 0) return [];
    const { db } = await import('@/lib/db');
    const rows: LocalVnCoverRow[] = [];
    for (let offset = 0; offset < vnIds.length; offset += 500) {
      const chunk = vnIds.slice(offset, offset + 500);
      rows.push(...db.prepare(`
        SELECT id, image_url, image_thumb, image_sexual, local_image, local_image_thumb
        FROM vn WHERE id IN (${chunk.map(() => '?').join(',')})
      `).all(...chunk) as LocalVnCoverRow[]);
    }
    return rows;
  },
};

let postgresRepository: VnReadRepository | null = null;

/** Return the configured stock VN reader. */
export function getVnReadRepository(): VnReadRepository {
  if (readDatabaseConfig().backend !== 'postgres') return sqliteRepository;
  postgresRepository ??= createPostgresVnReadRepository();
  return postgresRepository;
}
