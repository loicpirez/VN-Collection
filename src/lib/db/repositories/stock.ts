import type { QueryResultRow } from 'pg';
import type {
  VnStockAliasRow,
  VnStockOfferInput,
  VnStockOfferRow,
  VnStockProviderStatusRow,
  VnStockSourceRow,
} from '@/lib/db';
import { decodeStoredExtras, type ErogePriceExtrasV1 } from '@/lib/erogeprice-meta';
import { ALICENET_PROVIDER_ID, STOCK_PROVIDER_IDS } from '@/lib/stock-provider-constants';
import { readDatabaseConfig } from '../postgres-config';
import { postgresQuery, withPostgresTransaction, type PostgresParameter } from '../postgres';
import { getAppSettingRepository } from './app-setting';

/** Status payload written beside one provider snapshot. */
export type VnStockProviderStatusInput = Omit<
  VnStockProviderStatusRow,
  'vn_id' | 'provider' | 'blocked_kind' | 'fresh_offers_found' | 'cached_offers_available' | 'extras_json'
> & Partial<Pick<VnStockProviderStatusRow, 'blocked_kind' | 'fresh_offers_found' | 'cached_offers_available' | 'extras_json'>>;

/** Stock offer joined with lightweight VN metadata for the global activity feed. */
export type RecentVnStockOffer = VnStockOfferRow & {
  vn_title: string | null;
  vn_image_url: string | null;
  vn_local_image: string | null;
  vn_image_sexual: number | null;
};

/** Asynchronous persistence contract for stock offers and manual stock metadata. */
export interface StockRepository {
  replaceProviderSnapshot(vnId: string, provider: string, offers: VnStockOfferInput[], status: VnStockProviderStatusInput, options?: { preserveExistingOffers?: boolean }): Promise<void>;
  listOffers(vnId: string): Promise<VnStockOfferRow[]>;
  listProviderStatuses(vnId: string): Promise<VnStockProviderStatusRow[]>;
  setProviderExtras(vnId: string, provider: string, extras: object): Promise<boolean>;
  getErogePriceExtras(vnId: string): Promise<ErogePriceExtrasV1 | null>;
  clearProviderExtras(vnId: string, provider: string): Promise<boolean>;
  batchSummaries(vnIds: string[]): Promise<Map<string, { available: number; best_price: number | null }>>;
  listRecentOffers(limit: number): Promise<RecentVnStockOffer[]>;
  listAliases(vnId: string): Promise<VnStockAliasRow[]>;
  upsertAlias(vnId: string, aliasTerm: string): Promise<void>;
  deleteAlias(vnId: string, aliasTerm: string): Promise<void>;
  listSources(vnId: string): Promise<VnStockSourceRow[]>;
  upsertSource(input: { vn_id: string; provider: string; url: string; release_id?: string | null; product_id?: string | null }): Promise<VnStockSourceRow>;
  deleteSource(vnId: string, sourceId: number): Promise<boolean>;
  disabledProviders(): Promise<Set<string>>;
  retryWithoutProxy(): Promise<boolean>;
  clearCache(vnId: string): Promise<{ offers: number; statuses: number }>;
  getCachedTitleResolution(query: string): Promise<{ vnId: string; title: string } | null>;
  setCachedTitleResolution(query: string, vnId: string, title: string): Promise<void>;
}

type PgOffer = VnStockOfferRow & QueryResultRow;
type PgStatus = VnStockProviderStatusRow & QueryResultRow;
type PgSource = VnStockSourceRow & QueryResultRow;
interface SummaryRow extends QueryResultRow { vn_id: string; available: number; best_price: number | null }
interface ExtrasRow extends QueryResultRow { vn_id: string; extras_json: string }

const ALICENET_PRICE_SOURCE = "COALESCE(NULLIF(k.sale_price, ''), NULLIF(k.list_price, ''))";
const ALICENET_PRICE_DIGITS = `regexp_replace(COALESCE(${ALICENET_PRICE_SOURCE}, ''), '[^0-9]', '', 'g')`;
const ALICENET_PRICE = `CASE
  WHEN ${ALICENET_PRICE_SOURCE} ~ '[円¥￥]'
    AND ${ALICENET_PRICE_DIGITS} ~ '^[0-9]+$'
    AND (${ALICENET_PRICE_DIGITS})::BIGINT > 0
  THEN (${ALICENET_PRICE_DIGITS})::BIGINT
  ELSE NULL
END`;

const OFFER_COLUMNS = [
  'vn_id', 'provider', 'provider_offer_id', 'source', 'title', 'url', 'price', 'currency',
  'availability', 'availability_label', 'condition', 'edition_label', 'location_label', 'location_branch',
  'source_release_id', 'jan', 'fetched_at', 'updated_at', 'error', 'content_kind', 'platform',
  'edition_kind', 'series_relation', 'match_confidence', 'match_score', 'match_warnings_json',
  'marketplace_price', 'marketplace_count', 'list_price', 'category', 'store_code', 'product_id', 'page_kind',
] as const;

function offerValues(offer: VnStockOfferInput, updatedAt: number): PostgresParameter[] {
  return OFFER_COLUMNS.map((column) => column === 'updated_at'
    ? updatedAt
    : offer[column as keyof VnStockOfferInput] ?? null) as PostgresParameter[];
}

async function insertOffers(client: import('pg').PoolClient, offers: readonly VnStockOfferInput[]): Promise<void> {
  for (let offset = 0; offset < offers.length; offset += 100) {
    const batch = offers.slice(offset, offset + 100);
    const values: PostgresParameter[] = [];
    const tuples = batch.map((offer) => {
      const row = offerValues(offer, Date.now());
      const start = values.length;
      values.push(...row);
      return `(${row.map((_value, index) => `$${start + index + 1}`).join(', ')})`;
    });
    await client.query(`
      INSERT INTO vn_stock_offer (${OFFER_COLUMNS.join(', ')}) VALUES ${tuples.join(', ')}
      ON CONFLICT(vn_id, provider, provider_offer_id) DO UPDATE SET
        source = EXCLUDED.source,
        title = EXCLUDED.title,
        url = EXCLUDED.url,
        price = EXCLUDED.price,
        currency = EXCLUDED.currency,
        availability = EXCLUDED.availability,
        availability_label = EXCLUDED.availability_label,
        condition = EXCLUDED.condition,
        edition_label = EXCLUDED.edition_label,
        location_label = EXCLUDED.location_label,
        location_branch = EXCLUDED.location_branch,
        source_release_id = EXCLUDED.source_release_id,
        jan = EXCLUDED.jan,
        fetched_at = EXCLUDED.fetched_at,
        updated_at = EXCLUDED.updated_at,
        error = EXCLUDED.error,
        content_kind = EXCLUDED.content_kind,
        platform = EXCLUDED.platform,
        edition_kind = EXCLUDED.edition_kind,
        series_relation = EXCLUDED.series_relation,
        match_confidence = EXCLUDED.match_confidence,
        match_score = EXCLUDED.match_score,
        match_warnings_json = EXCLUDED.match_warnings_json,
        marketplace_price = EXCLUDED.marketplace_price,
        marketplace_count = EXCLUDED.marketplace_count,
        list_price = EXCLUDED.list_price,
        category = EXCLUDED.category,
        store_code = EXCLUDED.store_code,
        product_id = EXCLUDED.product_id,
        page_kind = EXCLUDED.page_kind
    `, values);
  }
}

function addErogePriceFallback(
  output: Map<string, { available: number; best_price: number | null }>,
  rows: readonly ExtrasRow[],
): void {
  for (const row of rows) {
    const decoded = decodeStoredExtras(row.extras_json);
    if (!decoded) continue;
    const prices = decoded.candidates
      .filter((candidate) => candidate.epId === decoded.selectedEpId)
      .flatMap((candidate) => [...candidate.detail.downloadRetailers, ...candidate.detail.packageRetailers])
      .map((retailer) => retailer.currentPrice)
      .filter((price): price is number => typeof price === 'number' && price > 0);
    if (prices.length > 0) output.set(row.vn_id, { available: prices.length, best_price: Math.min(...prices) });
  }
}

/** Create the PostgreSQL-backed stock repository. */
export function createPostgresStockRepository(): StockRepository {
  return {
    async replaceProviderSnapshot(vnId, provider, offers, status, options = {}) {
      await withPostgresTransaction(async (client) => {
        if (!options.preserveExistingOffers) {
          await client.query('DELETE FROM vn_stock_offer WHERE vn_id = $1 AND provider = $2', [vnId, provider]);
        }
        await insertOffers(client, offers);
        await client.query(`
          INSERT INTO vn_stock_provider_status (
            vn_id, provider, status, message, fetched_at, offer_count,
            blocked_kind, fresh_offers_found, cached_offers_available
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
          ON CONFLICT(vn_id, provider) DO UPDATE SET
            status = EXCLUDED.status,
            message = EXCLUDED.message,
            fetched_at = EXCLUDED.fetched_at,
            offer_count = EXCLUDED.offer_count,
            blocked_kind = EXCLUDED.blocked_kind,
            fresh_offers_found = EXCLUDED.fresh_offers_found,
            cached_offers_available = EXCLUDED.cached_offers_available
        `, [
          vnId,
          provider,
          status.status,
          status.message,
          status.fetched_at,
          status.offer_count,
          status.blocked_kind ?? null,
          status.fresh_offers_found ?? status.offer_count,
          status.cached_offers_available ?? 0,
        ]);
      });
    },
    async listOffers(vnId) {
      const result = await postgresQuery<PgOffer>(`
        SELECT * FROM vn_stock_offer WHERE vn_id = $1
        ORDER BY CASE availability WHEN 'in_stock' THEN 0 WHEN 'limited' THEN 1 WHEN 'unknown' THEN 2 WHEN 'out_of_stock' THEN 3 ELSE 4 END,
          CASE WHEN price IS NULL THEN 1 ELSE 0 END, price ASC, provider ASC, title ASC
      `, [vnId]);
      return result.rows;
    },
    async listProviderStatuses(vnId) {
      return (await postgresQuery<PgStatus>('SELECT * FROM vn_stock_provider_status WHERE vn_id = $1 ORDER BY provider', [vnId])).rows;
    },
    async setProviderExtras(vnId, provider, extras) {
      if (provider !== 'eroge_price') return false;
      let payload: string;
      try {
        payload = JSON.stringify(extras);
      } catch {
        return false;
      }
      const normalized = decodeStoredExtras(payload);
      if (!normalized) return false;
      payload = JSON.stringify(normalized);
      await postgresQuery(`
        INSERT INTO vn_stock_provider_status (vn_id, provider, status, extras_json, fetched_at)
        VALUES ($1, $2, 'not_checked', $3, $4)
        ON CONFLICT(vn_id, provider) DO UPDATE SET extras_json = EXCLUDED.extras_json
      `, [vnId, provider, payload, Date.now()]);
      return true;
    },
    async getErogePriceExtras(vnId) {
      const result = await postgresQuery<{ extras_json: string | null } & QueryResultRow>(
        `SELECT extras_json FROM vn_stock_provider_status WHERE vn_id = $1 AND provider = 'eroge_price' LIMIT 1`,
        [vnId],
      );
      return decodeStoredExtras(result.rows[0]?.extras_json);
    },
    async clearProviderExtras(vnId, provider) {
      const result = await postgresQuery(
        'UPDATE vn_stock_provider_status SET extras_json = NULL WHERE vn_id = $1 AND provider = $2 RETURNING vn_id',
        [vnId, provider],
      );
      return (result.rowCount ?? 0) > 0;
    },
    async batchSummaries(vnIds) {
      const output = new Map<string, { available: number; best_price: number | null }>();
      if (vnIds.length === 0) return output;
      const result = await postgresQuery<SummaryRow>(`
        WITH eligible AS (
          SELECT offer.vn_id, offer.price,
            CASE WHEN source IN ('direct','manual','alicenet') THEN 0
              WHEN jan IS NOT NULL AND jan <> '' THEN 1
              WHEN product_id IS NOT NULL AND product_id <> '' THEN 2
              WHEN match_confidence IN ('exact','high') THEN 3
              WHEN match_confidence = 'medium' THEN 4 ELSE 5 END AS priority
          FROM vn_stock_offer offer
          WHERE offer.vn_id = ANY($1::text[])
            AND offer.provider <> $2
            AND offer.source <> $2
            AND availability IN ('in_stock','limited')
            AND (content_kind IS NULL OR content_kind IN ('game_package','digital_download'))
            AND (match_confidence IS NULL OR match_confidence IN ('exact','high'))
            AND (series_relation IS NULL OR series_relation IN ('exact_game','same_game_different_edition','same_game_different_platform'))
          UNION ALL
          SELECT k.vn_id, ${ALICENET_PRICE}, 0
          FROM alicenet_stock k
          WHERE k.vn_id = ANY($1::text[])
        ), ranked AS (
          SELECT vn_id, MIN(priority) AS best_priority FROM eligible GROUP BY vn_id
        )
        SELECT eligible.vn_id, COUNT(*) AS available,
          MIN(CASE WHEN eligible.priority = ranked.best_priority AND eligible.price IS NOT NULL THEN eligible.price END) AS best_price
        FROM eligible JOIN ranked ON ranked.vn_id = eligible.vn_id GROUP BY eligible.vn_id
      `, [vnIds, ALICENET_PROVIDER_ID]);
      for (const row of result.rows) output.set(row.vn_id, { available: row.available, best_price: row.best_price });
      const fallbackIds = vnIds.filter((vnId) => !output.has(vnId));
      if (fallbackIds.length > 0) {
        const fallbackRows = await postgresQuery<ExtrasRow>(`
          SELECT vn_id, extras_json FROM vn_stock_provider_status
          WHERE provider = 'eroge_price' AND vn_id = ANY($1::text[]) AND extras_json IS NOT NULL
        `, [fallbackIds]);
        addErogePriceFallback(output, fallbackRows.rows);
      }
      return output;
    },
    async listRecentOffers(limit) {
      return (await postgresQuery<RecentVnStockOffer & QueryResultRow>(`
        SELECT offer.*, vn.title AS vn_title, vn.image_url AS vn_image_url,
          vn.local_image AS vn_local_image, vn.image_sexual AS vn_image_sexual
        FROM vn_stock_offer offer LEFT JOIN vn ON vn.id = offer.vn_id
        ORDER BY offer.fetched_at DESC, offer.provider ASC, offer.title ASC LIMIT $1
      `, [limit])).rows;
    },
    async listAliases(vnId) {
      return (await postgresQuery<VnStockAliasRow & QueryResultRow>(
        'SELECT vn_id, alias_term, created_at FROM vn_stock_alias WHERE vn_id = $1 ORDER BY created_at ASC',
        [vnId],
      )).rows;
    },
    async upsertAlias(vnId, aliasTerm) {
      await postgresQuery(`
        INSERT INTO vn_stock_alias (vn_id, alias_term, created_at) VALUES ($1, $2, $3)
        ON CONFLICT(vn_id, alias_term) DO UPDATE SET created_at = EXCLUDED.created_at
      `, [vnId, aliasTerm, Date.now()]);
    },
    async deleteAlias(vnId, aliasTerm) {
      await postgresQuery('DELETE FROM vn_stock_alias WHERE vn_id = $1 AND alias_term = $2', [vnId, aliasTerm]);
    },
    async listSources(vnId) {
      return (await postgresQuery<PgSource>(`
        SELECT id, vn_id, release_id, provider, url, product_id, created_at, updated_at
        FROM vn_stock_source WHERE vn_id = $1 ORDER BY created_at ASC, id ASC
      `, [vnId])).rows;
    },
    async upsertSource(input) {
      const now = Date.now();
      const result = await postgresQuery<PgSource>(`
        INSERT INTO vn_stock_source (vn_id, release_id, provider, url, product_id, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $6)
        ON CONFLICT(vn_id, url) DO UPDATE SET
          release_id = EXCLUDED.release_id,
          provider = EXCLUDED.provider,
          product_id = EXCLUDED.product_id,
          updated_at = EXCLUDED.updated_at
        RETURNING id, vn_id, release_id, provider, url, product_id, created_at, updated_at
      `, [input.vn_id, input.release_id ?? null, input.provider, input.url, input.product_id ?? null, now]);
      const row = result.rows[0];
      if (!row) throw new Error('stock source upsert failed');
      return row;
    },
    async deleteSource(vnId, sourceId) {
      const result = await postgresQuery(
        'DELETE FROM vn_stock_source WHERE vn_id = $1 AND id = $2 RETURNING id',
        [vnId, sourceId],
      );
      return (result.rowCount ?? 0) > 0;
    },
    async disabledProviders() {
      const raw = await getAppSettingRepository().get('stock_disabled_providers');
      if (!raw) return new Set();
      try {
        const parsed: object = JSON.parse(raw);
        if (!Array.isArray(parsed)) return new Set();
        const accepted = new Set<string>(STOCK_PROVIDER_IDS);
        return new Set(parsed.filter((value): value is string => typeof value === 'string' && accepted.has(value)));
      } catch {
        return new Set();
      }
    },
    async retryWithoutProxy() {
      return await getAppSettingRepository().get('stock_retry_without_proxy') === '1';
    },
    async clearCache(vnId) {
      return withPostgresTransaction(async (client) => {
        const offers = await client.query('DELETE FROM vn_stock_offer WHERE vn_id = $1', [vnId]);
        const statuses = await client.query('DELETE FROM vn_stock_provider_status WHERE vn_id = $1', [vnId]);
        return { offers: offers.rowCount ?? 0, statuses: statuses.rowCount ?? 0 };
      });
    },
    async getCachedTitleResolution(query) {
      const result = await postgresQuery<{ vn_id: string; title: string } & QueryResultRow>(
        'SELECT vn_id, title FROM vn_title_resolve_cache WHERE query = $1',
        [query],
      );
      const row = result.rows[0];
      return row ? { vnId: row.vn_id, title: row.title } : null;
    },
    async setCachedTitleResolution(query, vnId, title) {
      await postgresQuery(`
        INSERT INTO vn_title_resolve_cache (query, vn_id, title) VALUES ($1, $2, $3)
        ON CONFLICT(query) DO UPDATE SET vn_id = EXCLUDED.vn_id, title = EXCLUDED.title
      `, [query, vnId, title]);
    },
  };
}

const sqliteRepository: StockRepository = {
  async replaceProviderSnapshot(vnId, provider, offers, status, options) { (await import('@/lib/db')).replaceVnStockProviderSnapshot(vnId, provider, offers, status, options); },
  async listOffers(vnId) { return (await import('@/lib/db')).listVnStockOffers(vnId); },
  async listProviderStatuses(vnId) { return (await import('@/lib/db')).listVnStockProviderStatuses(vnId); },
  async setProviderExtras(vnId, provider, extras) { return (await import('@/lib/db')).setStockProviderExtras(vnId, provider, extras); },
  async getErogePriceExtras(vnId) { return (await import('@/lib/db')).getErogePriceStockExtras(vnId); },
  async clearProviderExtras(vnId, provider) { return (await import('@/lib/db')).clearStockProviderExtras(vnId, provider); },
  async batchSummaries(vnIds) { return (await import('@/lib/db')).batchVnStockSummaries(vnIds); },
  async listRecentOffers(limit) { return (await import('@/lib/db')).listRecentVnStockOffers(limit); },
  async listAliases(vnId) { return (await import('@/lib/db')).listStockAliases(vnId); },
  async upsertAlias(vnId, aliasTerm) { (await import('@/lib/db')).upsertStockAlias(vnId, aliasTerm); },
  async deleteAlias(vnId, aliasTerm) { (await import('@/lib/db')).deleteStockAlias(vnId, aliasTerm); },
  async listSources(vnId) { return (await import('@/lib/db')).listStockSources(vnId); },
  async upsertSource(input) { return (await import('@/lib/db')).upsertStockSource(input); },
  async deleteSource(vnId, sourceId) { return (await import('@/lib/db')).deleteStockSource(vnId, sourceId); },
  async disabledProviders() { return (await import('@/lib/db')).getDisabledStockProviders(); },
  async retryWithoutProxy() { return (await import('@/lib/db')).getStockRetryWithoutProxy(); },
  async clearCache(vnId) { return (await import('@/lib/db')).clearVnStockCache(vnId); },
  async getCachedTitleResolution(query) { return (await import('@/lib/db')).getCachedTitleResolution(query); },
  async setCachedTitleResolution(query, vnId, title) { (await import('@/lib/db')).setCachedTitleResolution(query, vnId, title); },
};

let postgresRepository: StockRepository | null = null;

/** Return the configured stock repository. */
export function getStockRepository(): StockRepository {
  if (readDatabaseConfig().backend !== 'postgres') return sqliteRepository;
  postgresRepository ??= createPostgresStockRepository();
  return postgresRepository;
}
