import type { QueryResultRow } from 'pg';
import { asJsonRecord, parseJsonArray } from '@/lib/json-shape';
import type { ProducerRow, ProducerStat } from '@/lib/types';
import {
  decodePersistedProducerSummaries,
  isPersistedExtlinks,
  isPersistedStringArray,
} from '@/lib/vn-persisted-json-shape';
import { readDatabaseConfig } from '../postgres-config';
import { postgresQuery } from '../postgres';

/** Canonical VNDB producer fields persisted by the local mirror. */
export interface ProducerPayload {
  id: string;
  name: string;
  original?: string | null;
  lang?: string | null;
  type?: string | null;
  description?: string | null;
  aliases?: string[];
  extlinks?: Array<{ url: string; label: string; name: string }>;
}

/** Collection ownership summary used by the producer detail header. */
export interface ProducerOwnershipSummary {
  ownedIds: Set<string>;
  sample: {
    developers: Array<{ id: string; name: string }>;
    publishers: Array<{ id: string; name: string }>;
  } | null;
}

/** Persistence boundary for producer metadata, rankings, and ownership. */
export interface ProducerRepository {
  /** Read one locally mirrored producer. */
  get(id: string): Promise<ProducerRow | null>;
  /** Insert or refresh one canonical producer while preserving its custom logo. */
  upsert(payload: ProducerPayload): Promise<void>;
  /** Set or clear one producer's custom logo path. */
  setLogo(id: string, logoPath: string | null): Promise<void>;
  /** Rank producers credited as developers on collection VNs. */
  listDeveloperStats(): Promise<ProducerStat[]>;
  /** Rank producers credited as publishers on collection VNs. */
  listPublisherStats(): Promise<ProducerStat[]>;
  /** Summarize collection VNs credited to one producer in either role. */
  ownershipSummary(id: string): Promise<ProducerOwnershipSummary>;
  /** Return valid developer ids embedded on one VN. */
  developerIdsForVn(vnId: string): Promise<string[]>;
  /** Return producer freshness timestamps keyed by id. */
  fetchedAt(ids: readonly string[]): Promise<Map<string, number>>;
}

interface ProducerStorageRow extends QueryResultRow {
  id: string;
  name: string;
  original: string | null;
  lang: string | null;
  type: string | null;
  description: string | null;
  aliases: string | null;
  extlinks: string | null;
  logo_path: string | null;
  fetched_at: number;
}

interface ProducerStatStorageRow extends ProducerStorageRow {
  vn_count: number;
  avg_user_rating: number | null;
  avg_rating: number | null;
  name_sources: string[] | null;
}

interface OwnershipRow extends QueryResultRow {
  id: string;
  developers: string | null;
  publishers: string | null;
}

interface DeveloperPayloadRow extends QueryResultRow {
  developers: string | null;
}

function decodeDeveloperIds(raw: string | null): string[] {
  return [...new Set(parseJsonArray(raw).flatMap((value) => {
    const id = asJsonRecord(value)?.id;
    return typeof id === 'string' && /^p\d+$/i.test(id) ? [id] : [];
  }))];
}

function decodeProducer(row: ProducerStorageRow): ProducerRow {
  const aliases = parseJsonArray(row.aliases);
  const extlinks = parseJsonArray(row.extlinks);
  return {
    id: row.id,
    name: row.name,
    original: row.original,
    lang: row.lang,
    type: row.type,
    description: row.description,
    aliases: isPersistedStringArray(aliases) ? aliases : [],
    extlinks: isPersistedExtlinks(extlinks) ? extlinks : [],
    logo_path: row.logo_path,
    fetched_at: row.fetched_at,
  };
}

function fallbackProducerName(
  producerId: string,
  sources: readonly string[] | null,
): string {
  for (const source of sources ?? []) {
    const match = decodePersistedProducerSummaries(source).find((producer) => producer.id === producerId);
    if (match) return match.name;
  }
  return producerId;
}

function sortStats(rows: ProducerStat[]): ProducerStat[] {
  return rows.sort((left, right) => (
    right.vn_count - left.vn_count ||
    left.name.localeCompare(right.name, undefined, { sensitivity: 'base' }) ||
    left.id.localeCompare(right.id)
  ));
}

async function postgresStats(role: 'developer' | 'publisher'): Promise<ProducerStat[]> {
  const indexTable = role === 'developer' ? 'vn_developer_index' : 'vn_publisher_index';
  const sourceColumn = role === 'developer' ? 'developers' : 'publishers';
  const result = await postgresQuery<ProducerStatStorageRow>(`
    SELECT
      producer_index.producer_id AS id,
      COALESCE(producer.name, producer_index.producer_id) AS name,
      producer.original,
      producer.lang,
      producer.type,
      producer.description,
      producer.aliases,
      producer.extlinks,
      producer.logo_path,
      COALESCE(producer.fetched_at, 0)::bigint AS fetched_at,
      COUNT(DISTINCT producer_index.vn_id)::int AS vn_count,
      AVG(collection.user_rating)::double precision AS avg_user_rating,
      AVG(vn.rating)::double precision AS avg_rating,
      ARRAY_AGG(vn.${sourceColumn} ORDER BY vn.id)
        FILTER (WHERE vn.${sourceColumn} IS NOT NULL) AS name_sources
    FROM collection
    JOIN ${indexTable} producer_index ON producer_index.vn_id = collection.vn_id
    JOIN vn ON vn.id = collection.vn_id
    LEFT JOIN producer ON producer.id = producer_index.producer_id
    GROUP BY producer_index.producer_id, producer.id
    ORDER BY vn_count DESC, producer_index.producer_id COLLATE "C"
    LIMIT 2000
  `);
  return sortStats(result.rows.map((row) => {
    const producer = decodeProducer({
      ...row,
      name: row.name === row.id ? fallbackProducerName(row.id, row.name_sources) : row.name,
    });
    return {
      ...producer,
      vn_count: row.vn_count,
      avg_user_rating: row.avg_user_rating,
      avg_rating: row.avg_rating,
    };
  }));
}

/** Create the PostgreSQL-backed producer repository. */
export function createPostgresProducerRepository(): ProducerRepository {
  return {
    async get(id) {
      const result = await postgresQuery<ProducerStorageRow>(`
        SELECT id, name, original, lang, type, description, aliases, extlinks, logo_path, fetched_at
        FROM producer WHERE id = $1
      `, [id]);
      return result.rows[0] ? decodeProducer(result.rows[0]) : null;
    },
    async upsert(payload) {
      await postgresQuery(`
        INSERT INTO producer (
          id, name, original, lang, type, description, aliases, extlinks, fetched_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        ON CONFLICT (id) DO UPDATE SET
          name = EXCLUDED.name,
          original = EXCLUDED.original,
          lang = EXCLUDED.lang,
          type = EXCLUDED.type,
          description = EXCLUDED.description,
          aliases = EXCLUDED.aliases,
          extlinks = EXCLUDED.extlinks,
          fetched_at = EXCLUDED.fetched_at
      `, [
        payload.id,
        payload.name,
        payload.original ?? null,
        payload.lang ?? null,
        payload.type ?? null,
        payload.description ?? null,
        JSON.stringify(payload.aliases ?? []),
        JSON.stringify(payload.extlinks ?? []),
        Date.now(),
      ]);
    },
    async setLogo(id, logoPath) {
      await postgresQuery('UPDATE producer SET logo_path = $1 WHERE id = $2', [logoPath, id]);
    },
    async listDeveloperStats() {
      return postgresStats('developer');
    },
    async listPublisherStats() {
      return postgresStats('publisher');
    },
    async ownershipSummary(id) {
      const result = await postgresQuery<OwnershipRow>(`
        SELECT vn.id, vn.developers, vn.publishers
        FROM vn
        JOIN collection ON collection.vn_id = vn.id
        WHERE EXISTS (
          SELECT 1 FROM vn_developer_index
          WHERE vn_id = vn.id AND producer_id = $1
        ) OR EXISTS (
          SELECT 1 FROM vn_publisher_index
          WHERE vn_id = vn.id AND producer_id = $1
        )
        ORDER BY collection.updated_at DESC, vn.id
        LIMIT 500
      `, [id]);
      const first = result.rows[0];
      return {
        ownedIds: new Set(result.rows.map((row) => row.id)),
        sample: first ? {
          developers: decodePersistedProducerSummaries(first.developers),
          publishers: decodePersistedProducerSummaries(first.publishers),
        } : null,
      };
    },
    async developerIdsForVn(vnId) {
      const result = await postgresQuery<DeveloperPayloadRow>(
        'SELECT developers FROM vn WHERE id = $1',
        [vnId],
      );
      return decodeDeveloperIds(result.rows[0]?.developers ?? null);
    },
    async fetchedAt(ids) {
      if (ids.length === 0) return new Map();
      const result = await postgresQuery<{ id: string; fetched_at: number } & QueryResultRow>(`
        SELECT id, fetched_at FROM producer WHERE id = ANY($1::text[])
      `, [[...ids]]);
      return new Map(result.rows.map((row) => [row.id, row.fetched_at]));
    },
  };
}

const sqliteRepository: ProducerRepository = {
  async get(id) {
    return (await import('@/lib/db')).getProducer(id);
  },
  async upsert(payload) {
    (await import('@/lib/db')).upsertProducer(payload);
  },
  async setLogo(id, logoPath) {
    (await import('@/lib/db')).setProducerLogo(id, logoPath);
  },
  async listDeveloperStats() {
    return (await import('@/lib/db')).listProducerStats();
  },
  async listPublisherStats() {
    return (await import('@/lib/db')).listPublisherStats();
  },
  async ownershipSummary(id) {
    return (await import('@/lib/db')).producerOwnershipSummary(id);
  },
  async developerIdsForVn(vnId) {
    const { db } = await import('@/lib/db');
    const row = db.prepare('SELECT developers FROM vn WHERE id = ?').get(vnId) as DeveloperPayloadRow | undefined;
    return decodeDeveloperIds(row?.developers ?? null);
  },
  async fetchedAt(ids) {
    if (ids.length === 0) return new Map();
    const { db } = await import('@/lib/db');
    const rows: Array<{ id: string; fetched_at: number }> = [];
    for (let offset = 0; offset < ids.length; offset += 500) {
      const chunk = ids.slice(offset, offset + 500);
      rows.push(...db.prepare(`
        SELECT id, fetched_at FROM producer
        WHERE id IN (${chunk.map(() => '?').join(',')})
      `).all(...chunk) as Array<{ id: string; fetched_at: number }>);
    }
    return new Map(rows.map((row) => [row.id, row.fetched_at]));
  },
};

let postgresRepository: ProducerRepository | null = null;

/** Return the producer repository selected by the configured backend. */
export function getProducerRepository(): ProducerRepository {
  if (readDatabaseConfig().backend !== 'postgres') return sqliteRepository;
  postgresRepository ??= createPostgresProducerRepository();
  return postgresRepository;
}
