import type { QueryResultRow } from 'pg';
import type {
  PlaceOfferRow,
  PlacePayload,
  PlaceVnRow,
  PlaceWithLinks,
} from '@/lib/db';
import { normalizeOptionalCoordinate } from '@/lib/place-coordinates';
import {
  ALICENET_BRANCH_LABEL,
  ALICENET_PROVIDER_ID,
  ALICENET_STOCK_URL,
  ONLINE_STOCK_SENTINEL,
} from '@/lib/stock-provider-constants';
import { readDatabaseConfig } from '../postgres-config';
import { postgresQuery, withPostgresTransaction, type PostgresParameter } from '../postgres';

/** Availability filter accepted by place stock views. */
export type PlaceAvailabilityFilter = 'in_stock' | 'all' | 'out_of_stock';

/** Provider branch assigned to a different registered place. */
export interface PlaceBranchAssignment {
  provider_label: string;
  place_id: number;
  place_name: string;
}

/** Asynchronous persistence contract for the place registry and its stock. */
export interface PlaceRepository {
  /** List registered places with linked branches and stock freshness. */
  list(): Promise<PlaceWithLinks[]>;
  /** Return one registered place. */
  get(id: number): Promise<PlaceWithLinks | null>;
  /** Update selected place fields. */
  update(id: number, patch: Partial<PlacePayload>): Promise<void>;
  /** Delete one place and its cascading branch links. */
  delete(id: number): Promise<void>;
  /** Link a provider branch to one place. */
  linkProvider(placeId: number, providerLabel: string): Promise<void>;
  /** Remove one provider branch link. */
  unlinkProvider(placeId: number, providerLabel: string): Promise<void>;
  /** Move one provider branch between places atomically. */
  moveProvider(fromPlaceId: number, toPlaceId: number, providerLabel: string): Promise<void>;
  /** Return every provider-label to place-id assignment. */
  providerMap(): Promise<Record<string, number>>;
  /** List stock branches that are not assigned to a place. */
  listUnassignedBranches(): Promise<string[]>;
  /** List assignments belonging to places other than the supplied place. */
  listOtherBranches(excludePlaceId: number): Promise<PlaceBranchAssignment[]>;
  /** List known physical-location labels used by collection items. */
  listKnownPlaces(): Promise<string[]>;
  /** List rich per-VN stock aggregates at one place. */
  listVns(placeId: number): Promise<PlaceVnRow[]>;
  /** List individual stock offers at one place. */
  listOffers(placeId: number, availability?: PlaceAvailabilityFilter): Promise<PlaceOfferRow[]>;
}

type PlaceAggregateRow = Omit<PlaceWithLinks, 'provider_labels'> & QueryResultRow & {
  provider_labels: string[] | null;
};

interface LabelRow extends QueryResultRow { label: string }
interface ProviderMapRow extends QueryResultRow { place_id: number; provider_label: string }
interface PlaceNameRow extends QueryResultRow { place: string }

const PRICE_SOURCE = "COALESCE(NULLIF(k.sale_price, ''), NULLIF(k.list_price, ''))";
const PRICE_DIGITS = `regexp_replace(COALESCE(${PRICE_SOURCE}, ''), '[^0-9]', '', 'g')`;
const ALICENET_PRICE = `CASE
  WHEN ${PRICE_SOURCE} ~ '[円¥￥]'
    AND ${PRICE_DIGITS} ~ '^[0-9]+$'
    AND (${PRICE_DIGITS})::BIGINT > 0
  THEN (${PRICE_DIGITS})::BIGINT
  ELSE NULL
END`;

const PLACE_STOCK_SOURCE = `
  SELECT vn_id, provider, availability, price, currency, url,
    location_branch, location_label, updated_at
  FROM vn_stock_offer
  UNION ALL
  SELECT k.vn_id, '${ALICENET_PROVIDER_ID}', 'in_stock', ${ALICENET_PRICE},
    'JPY', '${ALICENET_STOCK_URL}', '${ALICENET_BRANCH_LABEL}',
    '${ALICENET_BRANCH_LABEL}', k.updated_at
  FROM alicenet_stock k
  WHERE k.vn_id IS NOT NULL
`;

const PLACE_SELECT = `
  WITH stock_by_place AS (
    SELECT ppl2.place_id,
      COUNT(DISTINCT CASE WHEN stock.availability IN ('in_stock', 'limited') THEN stock.vn_id END)::BIGINT AS stock_count,
      MAX(stock.updated_at) AS stock_updated_at
    FROM place_provider_link ppl2
    JOIN (${PLACE_STOCK_SOURCE}) stock ON (
      stock.location_branch = ppl2.provider_label
      OR stock.location_label = ppl2.provider_label
    )
    GROUP BY ppl2.place_id
  )
  SELECT place.*,
    COALESCE(array_agg(link.provider_label ORDER BY link.provider_label)
      FILTER (WHERE link.provider_label IS NOT NULL), ARRAY[]::TEXT[]) AS provider_labels,
    COALESCE(stock_by_place.stock_count, 0)::BIGINT AS stock_count,
    stock_by_place.stock_updated_at
  FROM place_registry place
  LEFT JOIN place_provider_link link ON link.place_id = place.id
  LEFT JOIN stock_by_place ON stock_by_place.place_id = place.id
`;

function normalizedPlace(row: PlaceAggregateRow): PlaceWithLinks {
  return {
    ...row,
    provider_labels: row.provider_labels ?? [],
    stock_updated_at: row.stock_updated_at ?? null,
  };
}

function availabilitySql(availability: PlaceAvailabilityFilter): string {
  if (availability === 'all') return '';
  if (availability === 'out_of_stock') return "AND stock.availability = 'out_of_stock'";
  return "AND stock.availability IN ('in_stock', 'limited')";
}

/** Create the PostgreSQL-backed place repository. */
export function createPostgresPlaceRepository(): PlaceRepository {
  return {
    async list() {
      const result = await postgresQuery<PlaceAggregateRow>(`
        ${PLACE_SELECT}
        GROUP BY place.id, stock_by_place.stock_count, stock_by_place.stock_updated_at
        ORDER BY app_search_normalize(place.name) COLLATE "C", place.id
      `);
      return result.rows.map(normalizedPlace);
    },
    async get(id) {
      const result = await postgresQuery<PlaceAggregateRow>(`
        ${PLACE_SELECT}
        WHERE place.id = $1
        GROUP BY place.id, stock_by_place.stock_count, stock_by_place.stock_updated_at
      `, [id]);
      const row = result.rows[0];
      return row ? normalizedPlace(row) : null;
    },
    async update(id, patch) {
      const updates: Array<{ column: keyof PlacePayload; value: PostgresParameter }> = [];
      for (const column of ['name', 'name_ja', 'kind', 'address', 'lat', 'lng', 'url', 'notes'] as const) {
        if (!(column in patch)) continue;
        const raw = patch[column];
        const value = column === 'lat' || column === 'lng'
          ? normalizeOptionalCoordinate(raw as number | null | undefined, column)
          : raw ?? null;
        updates.push({ column, value });
      }
      if (updates.length === 0) return;
      const values = updates.map((update) => update.value);
      values.push(Date.now(), id);
      await postgresQuery(
        `UPDATE place_registry SET ${updates.map((update, index) => `${update.column} = $${index + 1}`).join(', ')}, updated_at = $${updates.length + 1} WHERE id = $${updates.length + 2}`,
        values,
      );
    },
    async delete(id) {
      await postgresQuery('DELETE FROM place_registry WHERE id = $1', [id]);
    },
    async linkProvider(placeId, providerLabel) {
      await postgresQuery(`
        INSERT INTO place_provider_link (place_id, provider_label) VALUES ($1, $2)
        ON CONFLICT(place_id, provider_label) DO NOTHING
      `, [placeId, providerLabel]);
    },
    async unlinkProvider(placeId, providerLabel) {
      await postgresQuery(
        'DELETE FROM place_provider_link WHERE place_id = $1 AND provider_label = $2',
        [placeId, providerLabel],
      );
    },
    async moveProvider(fromPlaceId, toPlaceId, providerLabel) {
      await withPostgresTransaction(async (client) => {
        await client.query(
          'DELETE FROM place_provider_link WHERE place_id = $1 AND provider_label = $2',
          [fromPlaceId, providerLabel],
        );
        await client.query(`
          INSERT INTO place_provider_link (place_id, provider_label) VALUES ($1, $2)
          ON CONFLICT(place_id, provider_label) DO NOTHING
        `, [toPlaceId, providerLabel]);
      });
    },
    async providerMap() {
      const result = await postgresQuery<ProviderMapRow>(
        'SELECT place_id, provider_label FROM place_provider_link ORDER BY provider_label, place_id',
      );
      return Object.fromEntries(result.rows.map((row) => [row.provider_label, row.place_id]));
    },
    async listUnassignedBranches() {
      const result = await postgresQuery<LabelRow>(`
        SELECT candidate.label
        FROM (
          SELECT location_branch AS label FROM vn_stock_offer
          WHERE location_branch IS NOT NULL AND location_branch <> ''
          UNION
          SELECT location_label AS label FROM vn_stock_offer
          WHERE location_label IS NOT NULL AND location_label <> '' AND location_label <> $1
          UNION
          SELECT $2 AS label WHERE EXISTS (SELECT 1 FROM alicenet_stock WHERE vn_id IS NOT NULL)
        ) candidate
        WHERE NOT EXISTS (
          SELECT 1 FROM place_provider_link link WHERE link.provider_label = candidate.label
        )
        GROUP BY candidate.label
        ORDER BY app_search_normalize(candidate.label) COLLATE "C", candidate.label
      `, [ONLINE_STOCK_SENTINEL, ALICENET_BRANCH_LABEL]);
      return result.rows.map((row) => row.label);
    },
    async listOtherBranches(excludePlaceId) {
      return (await postgresQuery<PlaceBranchAssignment & QueryResultRow>(`
        SELECT link.provider_label, link.place_id, place.name AS place_name
        FROM place_provider_link link
        JOIN place_registry place ON place.id = link.place_id
        WHERE link.place_id <> $1
        ORDER BY app_search_normalize(place.name) COLLATE "C",
          app_search_normalize(link.provider_label) COLLATE "C", link.place_id
      `, [excludePlaceId])).rows;
    },
    async listKnownPlaces() {
      const result = await postgresQuery<PlaceNameRow>(`
        SELECT place FROM collection_place_index
        GROUP BY place
        ORDER BY app_search_normalize(place) COLLATE "C", place
      `);
      return result.rows.map((row) => row.place);
    },
    async listVns(placeId) {
      return (await postgresQuery<PlaceVnRow & QueryResultRow>(`
        SELECT vn.id AS vn_id, vn.title, vn.alttitle, vn.image_url, vn.local_image,
          vn.image_sexual, vn.released, vn.developers,
          CASE WHEN collection.vn_id IS NOT NULL THEN 1 ELSE 0 END AS in_collection,
          MIN(CASE WHEN stock.availability IN ('in_stock', 'limited') THEN stock.price END) AS min_price,
          COUNT(*)::BIGINT AS offer_count,
          COUNT(*) FILTER (WHERE stock.availability IN ('in_stock', 'limited'))::BIGINT AS in_stock_count,
          COUNT(*) FILTER (WHERE stock.availability = 'out_of_stock')::BIGINT AS out_of_stock_count,
          MAX(stock.updated_at) AS max_updated_at
        FROM (${PLACE_STOCK_SOURCE}) stock
        JOIN place_provider_link link ON (
          link.provider_label = stock.location_branch OR link.provider_label = stock.location_label
        )
        JOIN vn ON vn.id = stock.vn_id
        LEFT JOIN collection ON collection.vn_id = vn.id
        WHERE link.place_id = $1
        GROUP BY vn.id, collection.vn_id
        ORDER BY app_search_normalize(vn.title) COLLATE "C", vn.id
      `, [placeId])).rows;
    },
    async listOffers(placeId, availability = 'in_stock') {
      return (await postgresQuery<PlaceOfferRow & QueryResultRow>(`
        SELECT stock.vn_id, stock.provider, stock.availability, stock.price,
          stock.currency, stock.url, stock.location_branch, stock.location_label,
          stock.updated_at
        FROM (${PLACE_STOCK_SOURCE}) stock
        JOIN place_provider_link link ON (
          link.provider_label = stock.location_branch OR link.provider_label = stock.location_label
        )
        WHERE link.place_id = $1 ${availabilitySql(availability)}
        ORDER BY stock.vn_id, stock.updated_at DESC, stock.provider
      `, [placeId])).rows;
    },
  };
}

const sqliteRepository: PlaceRepository = {
  async list() { return (await import('@/lib/db')).listPlaces(); },
  async get(id) { return (await import('@/lib/db')).getPlace(id); },
  async update(id, patch) { (await import('@/lib/db')).updatePlace(id, patch); },
  async delete(id) { (await import('@/lib/db')).deletePlace(id); },
  async linkProvider(placeId, providerLabel) { (await import('@/lib/db')).linkProviderToPlace(placeId, providerLabel); },
  async unlinkProvider(placeId, providerLabel) { (await import('@/lib/db')).unlinkProviderFromPlace(placeId, providerLabel); },
  async moveProvider(fromPlaceId, toPlaceId, providerLabel) { (await import('@/lib/db')).moveProviderLink(fromPlaceId, toPlaceId, providerLabel); },
  async providerMap() { return (await import('@/lib/db')).getPlaceProviderMap(); },
  async listUnassignedBranches() { return (await import('@/lib/db')).listUnassignedBranches(); },
  async listOtherBranches(excludePlaceId) { return (await import('@/lib/db')).listBranchesAtOtherPlaces(excludePlaceId); },
  async listKnownPlaces() { return (await import('@/lib/db')).listKnownPlaces(); },
  async listVns(placeId) { return (await import('@/lib/db')).listPlaceVnsEnhanced(placeId); },
  async listOffers(placeId, availability) { return (await import('@/lib/db')).listOffersAtPlace(placeId, availability); },
};

let postgresRepository: PlaceRepository | null = null;

/** Return the place repository for the configured database backend. */
export function getPlaceRepository(): PlaceRepository {
  if (readDatabaseConfig().backend !== 'postgres') return sqliteRepository;
  postgresRepository ??= createPostgresPlaceRepository();
  return postgresRepository;
}
