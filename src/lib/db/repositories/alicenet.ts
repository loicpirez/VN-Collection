import type { QueryResultRow } from 'pg';
import type {
  AliceNetProducerFacet,
  AliceNetStockListQuery,
  AliceNetStockListResult,
  AliceNetStockListRow,
  AliceNetStockRow,
  AliceNetStockRowWithEgs,
} from '@/lib/db';
import { readDatabaseConfig } from '../postgres-config';
import { postgresQuery, withPostgresTransaction } from '../postgres';
import { postgresContainsPattern } from '../postgres-search';

/** Optional EGS metadata persisted beside an AliceNet match. */
export interface AliceNetEgsMeta {
  title?: string | null;
  brand?: string | null;
  releaseDate?: string | null;
  imageUrl?: string | null;
  vndbRaw?: string | null;
}

/** AliceNet match-status counters rendered by the shop page. */
export interface AliceNetStockStats {
  total: number;
  matched: number;
  vndb_matched: number;
  egs_only: number;
  unmatched: number;
  unprocessed: number;
  none_found: number;
  in_collection: number;
}

/** Asynchronous persistence contract for the complete AliceNet stock domain. */
export interface AliceNetRepository {
  upsertStock(rows: Pick<AliceNetStockRow, 'code' | 'title' | 'jan' | 'release_date' | 'list_price' | 'sale_price'>[]): Promise<{ added: number; updated: number; removed: number }>;
  queryPage(query: AliceNetStockListQuery): Promise<AliceNetStockListResult>;
  listMatchedVnIds(): Promise<string[]>;
  getItem(code: string): Promise<AliceNetStockRow | null>;
  listUnmatched(limit: number, retryNone?: boolean, retryBefore?: number): Promise<AliceNetStockRow[]>;
  countUnmatched(retryNone?: boolean, retryBefore?: number): Promise<number>;
  listNoVndb(limit: number, retryBefore?: number): Promise<AliceNetStockRow[]>;
  countNoVndb(retryBefore?: number): Promise<number>;
  listNoVndbWithEgs(limit: number, retryBefore?: number): Promise<AliceNetStockRowWithEgs[]>;
  countNoVndbWithEgs(retryBefore?: number): Promise<number>;
  listNoVndbNoEgs(limit: number, retryBefore?: number): Promise<AliceNetStockRow[]>;
  countNoVndbNoEgs(retryBefore?: number): Promise<number>;
  setVnLink(code: string, vnId: string | null, source: 'manual' | 'none' | 'auto', candidates?: string | null, searchTitle?: string | null): Promise<void>;
  clearVnLink(code: string): Promise<void>;
  resetAutoMatches(): Promise<number>;
  setEgsLink(code: string, egsId: number | null, source: 'auto' | 'manual', meta?: AliceNetEgsMeta): Promise<void>;
  countStock(): Promise<AliceNetStockStats>;
  listVnIdsToDownload(limit: number): Promise<string[]>;
  listItemsForEgsResolve(limit: number): Promise<{ code: string; vn_id: string }[]>;
  countDownloadPending(): Promise<{ vndb_pending: number; egs_pending: number }>;
  listForVn(vnId: string): Promise<AliceNetStockRow[]>;
}

type PgAliceNetRow = AliceNetStockRow & QueryResultRow;
type PgAliceNetListRow = AliceNetStockListRow & QueryResultRow;
interface CountRow extends QueryResultRow { n: number }

const FIRST_PRODUCER = `COALESCE(
  NULLIF((
    SELECT COALESCE(NULLIF(p.name, ''), di.producer_id)
    FROM vn_developer_index di
    LEFT JOIN producer p ON p.id = di.producer_id
    WHERE di.vn_id = k.vn_id
    ORDER BY di.producer_id
    LIMIT 1
  ), ''),
  NULLIF(k.egs_brand, ''),
  ''
)`;
const MATCH_GROUP = `CASE
  WHEN k.vn_id IS NOT NULL THEN 'vndb'
  WHEN k.egs_id IS NOT NULL THEN 'egs'
  WHEN k.vn_match_source = 'none' THEN 'unresolved'
  ELSE 'new'
END`;
const NORMALIZED_DATE = `REPLACE(COALESCE(NULLIF(k.release_date, ''), NULLIF(k.egs_release_date, ''), ''), '/', '-')`;
const NUMERIC_PRICE = `NULLIF(regexp_replace(COALESCE(k.sale_price, ''), '[^0-9]', '', 'g'), '')::BIGINT`;
const SEARCH_DOCUMENT = `app_search_normalize(
  k.title || ' ' ||
  COALESCE(k.egs_title, '') || ' ' ||
  COALESCE(k.egs_brand, '') || ' ' ||
  COALESCE(k.search_title, '') || ' ' ||
  k.code || ' ' ||
  COALESCE(k.vn_id, '') || ' ' ||
  COALESCE(k.egs_id::TEXT, '')
)`;

class Bindings {
  readonly values: Array<string | number | readonly string[]> = [];

  add(value: string | number | readonly string[]): string {
    this.values.push(value);
    return `$${this.values.length}`;
  }
}

function groupSql(group: AliceNetStockListQuery['group']): string {
  if (group === 'match') return MATCH_GROUP;
  if (group === 'producer') return FIRST_PRODUCER;
  if (group === 'year') return `SUBSTRING(${NORMALIZED_DATE} FROM 1 FOR 4)`;
  return `''`;
}

function titleSql(): string {
  return `app_search_normalize(COALESCE(NULLIF(k.egs_title, ''), k.title)) COLLATE "C"`;
}

function orderSql(query: AliceNetStockListQuery): string {
  const title = titleSql();
  const hasPrice = `CASE WHEN ${NUMERIC_PRICE} IS NULL THEN 1 ELSE 0 END`;
  const sort = query.sort === 'release_desc'
    ? `${NORMALIZED_DATE} DESC, ${title} ASC`
    : query.sort === 'release_asc'
      ? `${NORMALIZED_DATE} ASC, ${title} ASC`
      : query.sort === 'price_asc'
        ? `${hasPrice}, ${NUMERIC_PRICE} ASC NULLS LAST, ${title} ASC`
        : query.sort === 'price_desc'
          ? `${hasPrice}, ${NUMERIC_PRICE} DESC NULLS LAST, ${title} ASC`
          : query.sort === 'updated_desc'
            ? `k.updated_at DESC, ${title} ASC`
            : query.sort === 'match_status'
              ? `CASE ${MATCH_GROUP} WHEN 'unresolved' THEN 0 WHEN 'new' THEN 1 WHEN 'egs' THEN 2 ELSE 3 END, ${title} ASC`
              : `${title} ASC`;
  if (query.group === 'match') return `CASE ${MATCH_GROUP} WHEN 'unresolved' THEN 0 WHEN 'new' THEN 1 WHEN 'egs' THEN 2 ELSE 3 END, ${sort}`;
  if (query.group === 'producer') return `LOWER(${FIRST_PRODUCER}) COLLATE "C" ASC, ${sort}`;
  if (query.group === 'year') return `SUBSTRING(${NORMALIZED_DATE} FROM 1 FOR 4) DESC, ${sort}`;
  return sort;
}

function whereSql(query: AliceNetStockListQuery, bindings: Bindings): string {
  const clauses: string[] = [];
  if (query.filter === 'matched') clauses.push('(k.vn_id IS NOT NULL OR k.egs_id IS NOT NULL)');
  else if (query.filter === 'vndb') clauses.push('k.vn_id IS NOT NULL');
  else if (query.filter === 'egs_only') clauses.push('k.vn_id IS NULL AND k.egs_id IS NOT NULL');
  else if (query.filter === 'unmatched') clauses.push('k.vn_id IS NULL AND k.egs_id IS NULL');
  else if (query.filter === 'none_found') clauses.push(`k.vn_id IS NULL AND k.egs_id IS NULL AND k.vn_match_source = 'none'`);
  else if (query.filter === 'collection') clauses.push('c.vn_id IS NOT NULL');
  else if (query.filter === 'wishlist') {
    clauses.push(query.wishlistIds?.length ? `k.vn_id = ANY(${bindings.add(query.wishlistIds)}::text[])` : 'FALSE');
  }
  if (query.producer.startsWith('egs:')) {
    clauses.push(`k.egs_brand = ${bindings.add(query.producer.slice(4))} AND NOT EXISTS (SELECT 1 FROM vn_developer_index di WHERE di.vn_id = k.vn_id)`);
  } else if (query.producer) {
    clauses.push(`EXISTS (SELECT 1 FROM vn_developer_index di WHERE di.vn_id = k.vn_id AND di.producer_id = ${bindings.add(query.producer)})`);
  }
  if (query.yearMin !== null) clauses.push(`NULLIF(SUBSTRING(${NORMALIZED_DATE} FROM 1 FOR 4), '')::BIGINT >= ${bindings.add(query.yearMin)}`);
  if (query.yearMax !== null) clauses.push(`NULLIF(SUBSTRING(${NORMALIZED_DATE} FROM 1 FOR 4), '')::BIGINT <= ${bindings.add(query.yearMax)}`);
  if (query.priceMin !== null) clauses.push(`${NUMERIC_PRICE} >= ${bindings.add(query.priceMin)}`);
  if (query.priceMax !== null) clauses.push(`${NUMERIC_PRICE} <= ${bindings.add(query.priceMax)}`);
  const search = query.search.trim();
  if (search) {
    const parameter = bindings.add(postgresContainsPattern(search));
    clauses.push(`${SEARCH_DOCUMENT} LIKE ${parameter} ESCAPE '\\'`);
  }
  return clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
}

function retryCondition(retryBefore: number | undefined, bindings: Bindings): string {
  if (!retryBefore || !Number.isFinite(retryBefore)) return '';
  return ` AND (last_matched_at IS NULL OR last_matched_at < ${bindings.add(Math.floor(retryBefore))})`;
}

async function queueRows<T extends AliceNetStockRow>(condition: string, bindings: Bindings, limit: number): Promise<T[]> {
  const limitParameter = bindings.add(limit);
  const result = await postgresQuery<T & QueryResultRow>(`
    SELECT * FROM alicenet_stock
    WHERE ${condition}
    ORDER BY COALESCE(last_matched_at, 0), code
    LIMIT ${limitParameter}
  `, bindings.values);
  return result.rows;
}

async function queueCount(condition: string, bindings: Bindings): Promise<number> {
  const result = await postgresQuery<CountRow>(`SELECT COUNT(*) AS n FROM alicenet_stock WHERE ${condition}`, bindings.values);
  return result.rows[0]?.n ?? 0;
}

/** Create the PostgreSQL-backed AliceNet repository. */
export function createPostgresAliceNetRepository(): AliceNetRepository {
  return {
    async upsertStock(rows) {
      return withPostgresTransaction(async (client) => {
        const existingResult = await client.query<{ code: string } & QueryResultRow>('SELECT code FROM alicenet_stock');
        const existing = new Set(existingResult.rows.map((row) => row.code));
        const incoming = new Set(rows.map((row) => row.code));
        const now = Date.now();
        for (let offset = 0; offset < rows.length; offset += 250) {
          const batch = rows.slice(offset, offset + 250);
          const values: Array<string | number | null> = [];
          const tuples = batch.map((row) => {
            const start = values.length;
            values.push(row.code, row.title, row.jan ?? null, row.release_date ?? null, row.list_price ?? null, row.sale_price ?? null, now, now);
            return `(${Array.from({ length: 8 }, (_value, index) => `$${start + index + 1}`).join(', ')})`;
          });
          await client.query(`
            INSERT INTO alicenet_stock (code, title, jan, release_date, list_price, sale_price, fetched_at, updated_at)
            VALUES ${tuples.join(', ')}
            ON CONFLICT(code) DO UPDATE SET
              title = EXCLUDED.title,
              jan = EXCLUDED.jan,
              release_date = EXCLUDED.release_date,
              list_price = EXCLUDED.list_price,
              sale_price = EXCLUDED.sale_price,
              fetched_at = EXCLUDED.fetched_at,
              updated_at = EXCLUDED.updated_at
          `, values);
        }
        const removedResult = rows.length > 0
          ? await client.query('DELETE FROM alicenet_stock WHERE NOT (code = ANY($1::text[]))', [[...incoming]])
          : await client.query('DELETE FROM alicenet_stock');
        const added = rows.reduce((count, row) => count + (existing.has(row.code) ? 0 : 1), 0);
        return { added, updated: rows.length - added, removed: removedResult.rowCount ?? 0 };
      });
    },
    async queryPage(query) {
      const safeLimit = Number.isFinite(query.limit) && query.limit > 0 ? Math.min(240, Math.floor(query.limit)) : 96;
      const safeOffset = Number.isFinite(query.offset) && query.offset > 0 ? Math.min(10_000_000, Math.floor(query.offset)) : 0;
      const bindings = new Bindings();
      const where = whereSql(query, bindings);
      const filterFrom = 'FROM alicenet_stock k LEFT JOIN collection c ON c.vn_id = k.vn_id';
      const commonFrom = `${filterFrom} LEFT JOIN vn v ON v.id = k.vn_id`;
      const totalResult = await postgresQuery<CountRow>(`SELECT COUNT(*) AS n ${filterFrom} ${where}`, bindings.values);
      const wishlistParameter = bindings.add(query.wishlistIds ?? []);
      const limitParameter = bindings.add(safeLimit);
      const offsetParameter = bindings.add(safeOffset);
      const selectedGroup = groupSql(query.group);
      const selectedGroupCount = query.group === 'none'
        ? '0::BIGINT'
        : `COUNT(*) OVER (PARTITION BY ${selectedGroup})`;
      const projection = `
        SELECT k.*,
          CASE WHEN c.vn_id IS NOT NULL THEN 1 ELSE 0 END AS in_collection,
          CASE WHEN k.vn_id = ANY(${wishlistParameter}::text[]) THEN 1 ELSE 0 END AS in_wishlist,
          v.image_url AS vn_image_url,
          v.local_image AS vn_local_image,
          v.image_sexual AS vn_image_sexual,
          v.developers AS vn_developers`;
      const itemSql = query.group === 'none'
        ? `
          WITH page_rows AS MATERIALIZED (
            SELECT k.*
            ${filterFrom}
            ${where}
            ORDER BY ${orderSql(query)}, k.code ASC
            LIMIT ${limitParameter} OFFSET ${offsetParameter}
          )
          ${projection},
            '' AS server_group_key,
            ${selectedGroupCount} AS server_group_count
          FROM page_rows k
          LEFT JOIN collection c ON c.vn_id = k.vn_id
          LEFT JOIN vn v ON v.id = k.vn_id
          ORDER BY ${orderSql(query)}, k.code ASC
        `
        : `
          ${projection},
            ${selectedGroup} AS server_group_key,
            ${selectedGroupCount} AS server_group_count
          ${commonFrom}
          ${where}
          ORDER BY ${orderSql(query)}, k.code ASC
          LIMIT ${limitParameter} OFFSET ${offsetParameter}
        `;
      const itemResult = await postgresQuery<PgAliceNetListRow>(itemSql, bindings.values);
      const producerResult = await postgresQuery<AliceNetProducerFacet & QueryResultRow>(`
        SELECT id, name, COUNT(*) AS count
        FROM (
          SELECT di.producer_id AS id,
            COALESCE(NULLIF(p.name, ''), di.producer_id) AS name
          FROM alicenet_stock k
          JOIN vn_developer_index di ON di.vn_id = k.vn_id
          LEFT JOIN producer p ON p.id = di.producer_id
          UNION ALL
          SELECT 'egs:' || k.egs_brand AS id, k.egs_brand AS name
          FROM alicenet_stock k
          WHERE NULLIF(k.egs_brand, '') IS NOT NULL
            AND NOT EXISTS (SELECT 1 FROM vn_developer_index di WHERE di.vn_id = k.vn_id)
        ) facets
        GROUP BY id, name
        ORDER BY app_search_normalize(name) COLLATE "C", id
      `);
      return { items: itemResult.rows, total: totalResult.rows[0]?.n ?? 0, producers: producerResult.rows };
    },
    async listMatchedVnIds() {
      const result = await postgresQuery<{ vn_id: string } & QueryResultRow>('SELECT DISTINCT vn_id FROM alicenet_stock WHERE vn_id IS NOT NULL');
      return result.rows.map((row) => row.vn_id);
    },
    async getItem(code) {
      const result = await postgresQuery<PgAliceNetRow>('SELECT * FROM alicenet_stock WHERE code = $1', [code]);
      return result.rows[0] ?? null;
    },
    async listUnmatched(limit, retryNone = false, retryBefore) {
      const bindings = new Bindings();
      const condition = retryNone
        ? `vn_id IS NULL AND egs_id IS NULL AND vn_match_source = 'none'${retryCondition(retryBefore, bindings)}`
        : 'vn_id IS NULL AND egs_id IS NULL AND vn_match_source IS NULL';
      return queueRows(condition, bindings, limit);
    },
    async countUnmatched(retryNone = false, retryBefore) {
      const bindings = new Bindings();
      const condition = retryNone
        ? `vn_id IS NULL AND egs_id IS NULL AND vn_match_source = 'none'${retryCondition(retryBefore, bindings)}`
        : 'vn_id IS NULL AND egs_id IS NULL AND vn_match_source IS NULL';
      return queueCount(condition, bindings);
    },
    async listNoVndb(limit, retryBefore) {
      const bindings = new Bindings();
      return queueRows(`vn_match_source = 'none' AND vn_id IS NULL AND egs_id IS NULL${retryCondition(retryBefore, bindings)}`, bindings, limit);
    },
    async countNoVndb(retryBefore) {
      const bindings = new Bindings();
      return queueCount(`vn_match_source = 'none' AND vn_id IS NULL AND egs_id IS NULL${retryCondition(retryBefore, bindings)}`, bindings);
    },
    async listNoVndbWithEgs(limit, retryBefore) {
      const bindings = new Bindings();
      return queueRows<AliceNetStockRowWithEgs>(`vn_match_source = 'none' AND vn_id IS NULL AND egs_id IS NOT NULL${retryCondition(retryBefore, bindings)}`, bindings, limit);
    },
    async countNoVndbWithEgs(retryBefore) {
      const bindings = new Bindings();
      return queueCount(`vn_match_source = 'none' AND vn_id IS NULL AND egs_id IS NOT NULL${retryCondition(retryBefore, bindings)}`, bindings);
    },
    async listNoVndbNoEgs(limit, retryBefore) {
      const bindings = new Bindings();
      return queueRows(`vn_match_source = 'none' AND vn_id IS NULL AND egs_id IS NULL${retryCondition(retryBefore, bindings)}`, bindings, limit);
    },
    async countNoVndbNoEgs(retryBefore) {
      const bindings = new Bindings();
      return queueCount(`vn_match_source = 'none' AND vn_id IS NULL AND egs_id IS NULL${retryCondition(retryBefore, bindings)}`, bindings);
    },
    async setVnLink(code, vnId, source, candidates, searchTitle) {
      const now = Date.now();
      await postgresQuery(`
        UPDATE alicenet_stock SET vn_id = $1, vn_match_source = $2, vn_candidates = $3,
          search_title = $4, last_matched_at = $5, updated_at = $5 WHERE code = $6
      `, [vnId?.toLowerCase() ?? null, source, candidates ?? null, searchTitle ?? null, now, code]);
    },
    async clearVnLink(code) {
      await postgresQuery(`
        UPDATE alicenet_stock SET vn_id = NULL, vn_match_source = NULL, vn_candidates = NULL,
          search_title = NULL, last_matched_at = NULL, updated_at = $1 WHERE code = $2
      `, [Date.now(), code]);
    },
    async resetAutoMatches() {
      const result = await postgresQuery(`
        UPDATE alicenet_stock SET vn_id = NULL, vn_match_source = NULL, vn_candidates = NULL,
          search_title = NULL, last_matched_at = NULL, updated_at = $1
        WHERE vn_match_source = 'auto' RETURNING code
      `, [Date.now()]);
      return result.rowCount ?? 0;
    },
    async setEgsLink(code, egsId, source, meta) {
      const now = Date.now();
      if (egsId == null) {
        await postgresQuery(`
          UPDATE alicenet_stock SET egs_id = NULL, egs_match_source = $1, egs_title = NULL,
            egs_brand = NULL, egs_release_date = NULL, egs_image_url = NULL, egs_vndb_raw = NULL,
            updated_at = $2 WHERE code = $3
        `, [source, now, code]);
      } else if (!meta) {
        await postgresQuery('UPDATE alicenet_stock SET egs_id = $1, egs_match_source = $2, updated_at = $3 WHERE code = $4', [egsId, source, now, code]);
      } else {
        await postgresQuery(`
          UPDATE alicenet_stock SET egs_id = $1, egs_match_source = $2, egs_title = $3,
            egs_brand = $4, egs_release_date = $5, egs_image_url = $6, egs_vndb_raw = $7,
            updated_at = $8 WHERE code = $9
        `, [egsId, source, meta.title ?? null, meta.brand ?? null, meta.releaseDate ?? null, meta.imageUrl ?? null, meta.vndbRaw ?? null, now, code]);
      }
    },
    async countStock() {
      const result = await postgresQuery<(AliceNetStockStats & QueryResultRow)>(`
        SELECT COUNT(*) AS total,
          COUNT(*) FILTER (WHERE k.vn_id IS NOT NULL) AS vndb_matched,
          COUNT(*) FILTER (WHERE k.vn_id IS NULL AND k.egs_id IS NOT NULL) AS egs_only,
          COUNT(*) FILTER (WHERE k.vn_id IS NOT NULL OR k.egs_id IS NOT NULL) AS matched,
          COUNT(*) FILTER (WHERE k.vn_id IS NULL AND k.egs_id IS NULL AND k.vn_match_source IS NULL) AS unprocessed,
          COUNT(*) FILTER (WHERE k.vn_id IS NULL AND k.egs_id IS NULL AND k.vn_match_source = 'none') AS none_found,
          COUNT(*) FILTER (WHERE c.vn_id IS NOT NULL) AS in_collection
        FROM alicenet_stock k LEFT JOIN collection c ON c.vn_id = k.vn_id
      `);
      const row = result.rows[0];
      const total = row?.total ?? 0;
      const matched = row?.matched ?? 0;
      return {
        total,
        matched,
        vndb_matched: row?.vndb_matched ?? 0,
        egs_only: row?.egs_only ?? 0,
        unmatched: total - matched,
        unprocessed: row?.unprocessed ?? 0,
        none_found: row?.none_found ?? 0,
        in_collection: row?.in_collection ?? 0,
      };
    },
    async listVnIdsToDownload(limit) {
      const result = await postgresQuery<{ vn_id: string } & QueryResultRow>(`
        SELECT DISTINCT k.vn_id FROM alicenet_stock k
        LEFT JOIN vn v ON v.id = k.vn_id
        WHERE k.vn_id IS NOT NULL AND v.id IS NULL LIMIT $1
      `, [limit]);
      return result.rows.map((row) => row.vn_id);
    },
    async listItemsForEgsResolve(limit) {
      const result = await postgresQuery<{ code: string; vn_id: string } & QueryResultRow>(`
        SELECT k.code, k.vn_id FROM alicenet_stock k JOIN vn v ON v.id = k.vn_id
        WHERE k.vn_id IS NOT NULL AND k.egs_id IS NULL AND k.egs_match_source IS NULL
        ORDER BY k.code LIMIT $1
      `, [limit]);
      return result.rows;
    },
    async countDownloadPending() {
      const result = await postgresQuery<{ vndb_pending: number; egs_pending: number } & QueryResultRow>(`
        SELECT
          COUNT(*) FILTER (WHERE k.vn_id IS NOT NULL AND v.id IS NULL) AS vndb_pending,
          COUNT(*) FILTER (WHERE k.vn_id IS NOT NULL AND v.id IS NOT NULL AND k.egs_id IS NULL AND k.egs_match_source IS NULL) AS egs_pending
        FROM alicenet_stock k LEFT JOIN vn v ON v.id = k.vn_id
      `);
      return { vndb_pending: result.rows[0]?.vndb_pending ?? 0, egs_pending: result.rows[0]?.egs_pending ?? 0 };
    },
    async listForVn(vnId) {
      const result = await postgresQuery<PgAliceNetRow>('SELECT * FROM alicenet_stock WHERE vn_id = $1 ORDER BY sale_price, code', [vnId]);
      return result.rows;
    },
  };
}

const sqliteRepository: AliceNetRepository = {
  async upsertStock(rows) { return (await import('@/lib/db')).upsertAliceNetStock(rows); },
  async queryPage(query) { return (await import('@/lib/db')).queryAliceNetStockPage(query); },
  async listMatchedVnIds() { return (await import('@/lib/db')).listAliceNetMatchedVnIds(); },
  async getItem(code) { return (await import('@/lib/db')).getAliceNetStockItem(code); },
  async listUnmatched(limit, retryNone, retryBefore) { return (await import('@/lib/db')).listAliceNetUnmatched(limit, retryNone, retryBefore); },
  async countUnmatched(retryNone, retryBefore) { return (await import('@/lib/db')).countAliceNetUnmatchedQueue(retryNone, retryBefore); },
  async listNoVndb(limit, retryBefore) { return (await import('@/lib/db')).listAliceNetNoVndbResult(limit, retryBefore); },
  async countNoVndb(retryBefore) { return (await import('@/lib/db')).countAliceNetNoVndbResult(retryBefore); },
  async listNoVndbWithEgs(limit, retryBefore) { return (await import('@/lib/db')).listAliceNetNoVndbWithEgs(limit, retryBefore); },
  async countNoVndbWithEgs(retryBefore) { return (await import('@/lib/db')).countAliceNetNoVndbWithEgs(retryBefore); },
  async listNoVndbNoEgs(limit, retryBefore) { return (await import('@/lib/db')).listAliceNetNoVndbNoEgs(limit, retryBefore); },
  async countNoVndbNoEgs(retryBefore) { return (await import('@/lib/db')).countAliceNetNoVndbNoEgs(retryBefore); },
  async setVnLink(code, vnId, source, candidates, searchTitle) { (await import('@/lib/db')).setAliceNetVnLink(code, vnId, source, candidates, searchTitle); },
  async clearVnLink(code) { (await import('@/lib/db')).clearAliceNetVnLink(code); },
  async resetAutoMatches() { return (await import('@/lib/db')).resetAliceNetAutoMatches(); },
  async setEgsLink(code, egsId, source, meta) { (await import('@/lib/db')).setAliceNetEgsLink(code, egsId, source, meta); },
  async countStock() { return (await import('@/lib/db')).countAliceNetStock(); },
  async listVnIdsToDownload(limit) { return (await import('@/lib/db')).listAliceNetVnidsToDownload(limit); },
  async listItemsForEgsResolve(limit) { return (await import('@/lib/db')).listAliceNetItemsForEgsResolve(limit); },
  async countDownloadPending() { return (await import('@/lib/db')).countAliceNetDownloadPending(); },
  async listForVn(vnId) { return (await import('@/lib/db')).listAliceNetStockForVn(vnId); },
};

let postgresRepository: AliceNetRepository | null = null;

/** Return the configured AliceNet repository. */
export function getAliceNetRepository(): AliceNetRepository {
  if (readDatabaseConfig().backend !== 'postgres') return sqliteRepository;
  postgresRepository ??= createPostgresAliceNetRepository();
  return postgresRepository;
}
