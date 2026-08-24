import type { QueryResultRow } from 'pg';
import { readDatabaseConfig } from '../postgres-config';
import { postgresQuery } from '../postgres';

const DISCOVERY_CHUNK_SIZE = 500;

/** Read-only persistence contract for collection-driven discovery features. */
export interface DiscoveryRepository {
  /** Return serialized developer summaries for every VN in the collection. */
  listCollectionDeveloperPayloads(): Promise<Array<string | null>>;
  /** Return distinct staff identifiers credited on any supplied VN. */
  listStaffIdsForVns(vnIds: readonly string[]): Promise<string[]>;
  /** Count cached full-staff payloads, including staff unrelated to a current comparison. */
  countStaffFullCache(): Promise<number>;
  /** Return cached payload bodies for exact cache keys. */
  listCacheBodies(cacheKeys: readonly string[]): Promise<string[]>;
}

interface DeveloperPayloadRow extends QueryResultRow {
  developers: string | null;
}

interface StaffIdRow extends QueryResultRow {
  sid: string;
}

interface CacheBodyRow extends QueryResultRow {
  body: string;
}

interface CountRow extends QueryResultRow {
  count: number;
}

/** Create the PostgreSQL-backed discovery repository. */
export function createPostgresDiscoveryRepository(): DiscoveryRepository {
  return {
    async listCollectionDeveloperPayloads() {
      const result = await postgresQuery<DeveloperPayloadRow>(`
        SELECT vn.developers
        FROM collection
        JOIN vn ON vn.id = collection.vn_id
        ORDER BY collection.vn_id COLLATE "C"
      `);
      return result.rows.map((row) => row.developers);
    },
    async listStaffIdsForVns(vnIds) {
      if (vnIds.length === 0) return [];
      const staffIds = new Set<string>();
      for (let index = 0; index < vnIds.length; index += DISCOVERY_CHUNK_SIZE) {
        const chunk = vnIds.slice(index, index + DISCOVERY_CHUNK_SIZE);
        const result = await postgresQuery<StaffIdRow>(`
          SELECT DISTINCT sid
          FROM staff_credit_index
          WHERE vn_id = ANY($1::text[])
        `, [chunk]);
        for (const row of result.rows) staffIds.add(row.sid);
      }
      return Array.from(staffIds).sort((left, right) => left.localeCompare(right));
    },
    async countStaffFullCache() {
      const result = await postgresQuery<CountRow>(`
        SELECT COUNT(*) AS count
        FROM vndb_cache
        WHERE cache_key LIKE 'staff_full:%'
      `);
      return result.rows[0]?.count ?? 0;
    },
    async listCacheBodies(cacheKeys) {
      if (cacheKeys.length === 0) return [];
      const bodies: string[] = [];
      for (let index = 0; index < cacheKeys.length; index += DISCOVERY_CHUNK_SIZE) {
        const chunk = cacheKeys.slice(index, index + DISCOVERY_CHUNK_SIZE);
        const result = await postgresQuery<CacheBodyRow>(`
          SELECT body FROM vndb_cache WHERE cache_key = ANY($1::text[])
        `, [chunk]);
        bodies.push(...result.rows.map((row) => row.body));
      }
      return bodies;
    },
  };
}

const sqliteRepository: DiscoveryRepository = {
  async listCollectionDeveloperPayloads() {
    const { db } = await import('@/lib/db');
    const rows = db.prepare(`
      SELECT vn.developers
      FROM collection
      JOIN vn ON vn.id = collection.vn_id
      ORDER BY collection.vn_id COLLATE NOCASE
    `).all() as DeveloperPayloadRow[];
    return rows.map((row) => row.developers);
  },
  async listStaffIdsForVns(vnIds) {
    if (vnIds.length === 0) return [];
    const { db } = await import('@/lib/db');
    const staffIds = new Set<string>();
    for (let index = 0; index < vnIds.length; index += DISCOVERY_CHUNK_SIZE) {
      const chunk = vnIds.slice(index, index + DISCOVERY_CHUNK_SIZE);
      const placeholders = chunk.map(() => '?').join(',');
      const rows = db
        .prepare(`SELECT DISTINCT sid FROM staff_credit_index WHERE vn_id IN (${placeholders})`)
        .all(...chunk) as StaffIdRow[];
      for (const row of rows) staffIds.add(row.sid);
    }
    return Array.from(staffIds).sort((left, right) => left.localeCompare(right));
  },
  async countStaffFullCache() {
    const { db } = await import('@/lib/db');
    const row = db
      .prepare(`SELECT COUNT(*) AS count FROM vndb_cache WHERE cache_key LIKE 'staff_full:%'`)
      .get() as CountRow | undefined;
    return row?.count ?? 0;
  },
  async listCacheBodies(cacheKeys) {
    if (cacheKeys.length === 0) return [];
    const { db } = await import('@/lib/db');
    const bodies: string[] = [];
    for (let index = 0; index < cacheKeys.length; index += DISCOVERY_CHUNK_SIZE) {
      const chunk = cacheKeys.slice(index, index + DISCOVERY_CHUNK_SIZE);
      const placeholders = chunk.map(() => '?').join(',');
      const rows = db
        .prepare(`SELECT body FROM vndb_cache WHERE cache_key IN (${placeholders})`)
        .all(...chunk) as CacheBodyRow[];
      bodies.push(...rows.map((row) => row.body));
    }
    return bodies;
  },
};

let postgresRepository: DiscoveryRepository | null = null;

/** Return the discovery repository selected by the configured backend. */
export function getDiscoveryRepository(): DiscoveryRepository {
  if (readDatabaseConfig().backend !== 'postgres') return sqliteRepository;
  postgresRepository ??= createPostgresDiscoveryRepository();
  return postgresRepository;
}
