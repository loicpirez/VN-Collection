import type { QueryResultRow } from 'pg';
import { decodePersistedProducerSummaries } from '@/lib/vn-persisted-json-shape';
import { readDatabaseConfig } from '../postgres-config';
import { postgresQuery } from '../postgres';

/** Compact VN metadata rendered by the similar-VN seed picker. */
export interface RecommendationSeedChip {
  id: string;
  title: string;
  alttitle: string | null;
  released: string | null;
  developer: string | null;
  image: {
    url: string;
    thumbnail: string;
    sexual: number | null;
  } | null;
}

/** Minimal top-rated collection row used by recommendation explanations. */
export interface RecommendationTopRated {
  id: string;
  title: string;
}

/** Positive-interest signal consumed by the recommendation seed builder. */
export type RecommendationSignalKind = 'completed' | 'rated' | 'favorite' | 'queue';

/** One independently counted recommendation signal for a local VN. */
export interface RecommendationSignalRow {
  vnId: string;
  signal: RecommendationSignalKind;
  rating: number | null;
}

/** Persisted VN fields needed to derive recommendation seeds. */
export interface RecommendationVnMetadata {
  id: string;
  title: string | null;
  tags: string | null;
  developers: string | null;
  staff: string | null;
}

interface SeedStorageRow extends QueryResultRow {
  id: string;
  title: string | null;
  alttitle: string | null;
  released: string | null;
  image_url: string | null;
  image_thumb: string | null;
  image_sexual: number | null;
  developers: string | null;
}

interface TopRatedRow extends QueryResultRow, RecommendationTopRated {}

interface SignalStorageRow extends QueryResultRow {
  vn_id: string;
  signal: RecommendationSignalKind;
  user_rating: number | null;
}

interface CacheBodyRow extends QueryResultRow {
  body: string;
}

/** Read-only persistence boundary for recommendation-page context. */
export interface RecommendationReadRepository {
  /** Read compact metadata for one local seed VN. */
  seedChip(vnId: string): Promise<RecommendationSeedChip | null>;
  /** Return the highest personal ratings above a minimum score. */
  topRated(minimumRating?: number, limit?: number): Promise<RecommendationTopRated[]>;
  /** Return every independently counted positive-interest signal. */
  seedSignals(): Promise<RecommendationSignalRow[]>;
  /** Read recommendation metadata for a bounded or batched VN id set. */
  vnMetadata(vnIds: readonly string[]): Promise<RecommendationVnMetadata[]>;
  /** Return every VN id currently present in the collection. */
  collectionIds(): Promise<string[]>;
  /** Return bounded cached VNDB wishlist response bodies. */
  wishlistCacheBodies(): Promise<string[]>;
  /** Return bounded cached VNDB tag response bodies. */
  tagCacheBodies(): Promise<string[]>;
}

function decodeSeed(row: SeedStorageRow | undefined): RecommendationSeedChip | null {
  if (!row?.title) return null;
  const imageUrl = row.image_url || row.image_thumb;
  return {
    id: row.id,
    title: row.title,
    alttitle: row.alttitle,
    released: row.released,
    developer: decodePersistedProducerSummaries(row.developers)[0]?.name ?? null,
    image: imageUrl ? {
      url: row.image_url ?? '',
      thumbnail: row.image_thumb ?? imageUrl,
      sexual: row.image_sexual,
    } : null,
  };
}

function boundedLimit(value: number | undefined): number {
  const integer = Math.floor(value ?? 3);
  return Number.isFinite(integer) ? Math.max(1, Math.min(50, integer)) : 3;
}

function decodeSignalRows(rows: readonly SignalStorageRow[]): RecommendationSignalRow[] {
  return rows.map((row) => ({
    vnId: row.vn_id,
    signal: row.signal,
    rating: row.user_rating,
  }));
}

/** Create the PostgreSQL-backed recommendation-read repository. */
export function createPostgresRecommendationReadRepository(): RecommendationReadRepository {
  return {
    async seedChip(vnId) {
      const result = await postgresQuery<SeedStorageRow>(`
        SELECT id, title, alttitle, released, image_url, image_thumb, image_sexual, developers
        FROM vn WHERE id = $1
      `, [vnId]);
      return decodeSeed(result.rows[0]);
    },
    async topRated(minimumRating = 70, limit) {
      const result = await postgresQuery<TopRatedRow>(`
        SELECT vn.id, vn.title
        FROM collection JOIN vn ON vn.id = collection.vn_id
        WHERE collection.user_rating IS NOT NULL AND collection.user_rating >= $1
        ORDER BY collection.user_rating DESC, collection.updated_at DESC, vn.id
        LIMIT $2
      `, [minimumRating, boundedLimit(limit)]);
      return result.rows;
    },
    async seedSignals() {
      const result = await postgresQuery<SignalStorageRow>(`
        SELECT vn_id, signal, user_rating FROM (
          SELECT vn_id, 'completed'::TEXT AS signal, user_rating
          FROM collection WHERE status = 'completed'
          UNION ALL
          SELECT vn_id, 'rated'::TEXT AS signal, user_rating
          FROM collection WHERE user_rating IS NOT NULL AND user_rating >= 70
          UNION ALL
          SELECT vn_id, 'favorite'::TEXT AS signal, user_rating
          FROM collection WHERE favorite = 1
          UNION ALL
          SELECT vn_id, 'queue'::TEXT AS signal, NULL::BIGINT AS user_rating
          FROM reading_queue
        ) AS seed_event
        ORDER BY vn_id COLLATE "C", signal COLLATE "C"
      `);
      return decodeSignalRows(result.rows);
    },
    async vnMetadata(vnIds) {
      if (vnIds.length === 0) return [];
      const result = await postgresQuery<RecommendationVnMetadata & QueryResultRow>(`
        SELECT id, title, tags, developers, staff
        FROM vn WHERE id = ANY($1::text[])
        ORDER BY id COLLATE "C"
      `, [vnIds]);
      return result.rows;
    },
    async collectionIds() {
      const result = await postgresQuery<{ vn_id: string } & QueryResultRow>(
        'SELECT vn_id FROM collection ORDER BY vn_id COLLATE "C"',
      );
      return result.rows.map((row) => row.vn_id);
    },
    async wishlistCacheBodies() {
      const result = await postgresQuery<CacheBodyRow>(`
        SELECT body FROM vndb_cache
        WHERE cache_key LIKE '% /ulist|%'
        ORDER BY fetched_at DESC, cache_key COLLATE "C"
        LIMIT 50
      `);
      return result.rows.map((row) => row.body);
    },
    async tagCacheBodies() {
      const result = await postgresQuery<CacheBodyRow>(`
        SELECT body FROM vndb_cache
        WHERE cache_key LIKE '% /tag|%'
        ORDER BY fetched_at DESC, cache_key COLLATE "C"
        LIMIT 20
      `);
      return result.rows.map((row) => row.body);
    },
  };
}

const sqliteRepository: RecommendationReadRepository = {
  async seedChip(vnId) {
    const { db } = await import('@/lib/db');
    const row = db.prepare(`
      SELECT id, title, alttitle, released, image_url, image_thumb, image_sexual, developers
      FROM vn WHERE id = ?
    `).get(vnId) as SeedStorageRow | undefined;
    return decodeSeed(row);
  },
  async topRated(minimumRating = 70, limit) {
    const { db } = await import('@/lib/db');
    return db.prepare(`
      SELECT vn.id, vn.title
      FROM collection JOIN vn ON vn.id = collection.vn_id
      WHERE collection.user_rating IS NOT NULL AND collection.user_rating >= ?
      ORDER BY collection.user_rating DESC, collection.updated_at DESC, vn.id
      LIMIT ?
    `).all(minimumRating, boundedLimit(limit)) as RecommendationTopRated[];
  },
  async seedSignals() {
    const { db } = await import('@/lib/db');
    const rows = db.prepare(`
      SELECT vn_id, signal, user_rating FROM (
        SELECT vn_id, 'completed' AS signal, user_rating
        FROM collection WHERE status = 'completed'
        UNION ALL
        SELECT vn_id, 'rated' AS signal, user_rating
        FROM collection WHERE user_rating IS NOT NULL AND user_rating >= 70
        UNION ALL
        SELECT vn_id, 'favorite' AS signal, user_rating
        FROM collection WHERE favorite = 1
        UNION ALL
        SELECT vn_id, 'queue' AS signal, NULL AS user_rating
        FROM reading_queue
      ) AS seed_event
      ORDER BY vn_id, signal
    `).all() as SignalStorageRow[];
    return decodeSignalRows(rows);
  },
  async vnMetadata(vnIds) {
    if (vnIds.length === 0) return [];
    const { db } = await import('@/lib/db');
    const rows: RecommendationVnMetadata[] = [];
    for (let index = 0; index < vnIds.length; index += 500) {
      const chunk = vnIds.slice(index, index + 500);
      rows.push(...db.prepare(`
        SELECT id, title, tags, developers, staff
        FROM vn WHERE id IN (${chunk.map(() => '?').join(',')})
        ORDER BY id
      `).all(...chunk) as RecommendationVnMetadata[]);
    }
    return rows;
  },
  async collectionIds() {
    const { db } = await import('@/lib/db');
    return (db.prepare('SELECT vn_id FROM collection ORDER BY vn_id').all() as Array<{ vn_id: string }>)
      .map((row) => row.vn_id);
  },
  async wishlistCacheBodies() {
    const { db } = await import('@/lib/db');
    return (db.prepare(`
      SELECT body FROM vndb_cache
      WHERE cache_key LIKE '% /ulist|%'
      ORDER BY fetched_at DESC, cache_key
      LIMIT 50
    `).all() as CacheBodyRow[]).map((row) => row.body);
  },
  async tagCacheBodies() {
    const { db } = await import('@/lib/db');
    return (db.prepare(`
      SELECT body FROM vndb_cache
      WHERE cache_key LIKE '% /tag|%'
      ORDER BY fetched_at DESC, cache_key
      LIMIT 20
    `).all() as CacheBodyRow[]).map((row) => row.body);
  },
};

let postgresRepository: RecommendationReadRepository | null = null;

/** Return the recommendation-read repository selected by the configured backend. */
export function getRecommendationReadRepository(): RecommendationReadRepository {
  if (readDatabaseConfig().backend !== 'postgres') return sqliteRepository;
  postgresRepository ??= createPostgresRecommendationReadRepository();
  return postgresRepository;
}
