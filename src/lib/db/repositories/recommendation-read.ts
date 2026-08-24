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

/** Read-only persistence boundary for recommendation-page context. */
export interface RecommendationReadRepository {
  /** Read compact metadata for one local seed VN. */
  seedChip(vnId: string): Promise<RecommendationSeedChip | null>;
  /** Return the highest personal ratings above a minimum score. */
  topRated(minimumRating?: number, limit?: number): Promise<RecommendationTopRated[]>;
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
};

let postgresRepository: RecommendationReadRepository | null = null;

/** Return the recommendation-read repository selected by the configured backend. */
export function getRecommendationReadRepository(): RecommendationReadRepository {
  if (readDatabaseConfig().backend !== 'postgres') return sqliteRepository;
  postgresRepository ??= createPostgresRecommendationReadRepository();
  return postgresRepository;
}
