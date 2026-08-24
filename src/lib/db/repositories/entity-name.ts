import type { QueryResultRow } from 'pg';
import { decodePersistedProducerSummaries } from '@/lib/vn-persisted-json-shape';
import { readDatabaseConfig } from '../postgres-config';
import { postgresQuery, type PostgresParameter } from '../postgres';

/** Batch display-name lookups used by background-job status rendering. */
export interface EntityNameRepository {
  /** Resolve VN titles by VNDB id. */
  vnTitles(ids: readonly string[]): Promise<Map<string, string>>;
  /** Resolve producer names, including names embedded in VN metadata. */
  producerNames(ids: readonly string[]): Promise<Map<string, string>>;
  /** Resolve staff names, preferring production credits over voice credits. */
  staffNames(ids: readonly string[]): Promise<Map<string, string>>;
  /** Resolve character names from materialized voice credits. */
  characterNames(ids: readonly string[]): Promise<Map<string, string>>;
}

interface NameRow extends QueryResultRow {
  id: string;
  name: string;
}

interface ProducerFallbackRow extends QueryResultRow {
  id: string;
  developers: string | null;
}

type EntityNameQuery = <Row extends QueryResultRow>(
  text: string,
  values?: readonly PostgresParameter[],
) => Promise<{ rows: Row[] }>;

function nameMap(rows: readonly NameRow[]): Map<string, string> {
  return new Map(rows.map((row) => [row.id, row.name]));
}

/** Create the PostgreSQL-backed entity-name lookup repository. */
export function createPostgresEntityNameRepository(
  query: EntityNameQuery = postgresQuery,
): EntityNameRepository {
  return {
    async vnTitles(ids) {
      if (ids.length === 0) return new Map();
      const result = await query<NameRow>(
        'SELECT id, title AS name FROM vn WHERE id = ANY($1::text[])',
        [[...ids]],
      );
      return nameMap(result.rows);
    },
    async producerNames(ids) {
      if (ids.length === 0) return new Map();
      const direct = await query<NameRow>(
        'SELECT id, name FROM producer WHERE id = ANY($1::text[])',
        [[...ids]],
      );
      const names = nameMap(direct.rows);
      const missing = ids.filter((id) => !names.has(id));
      if (missing.length === 0) return names;
      const fallback = await query<ProducerFallbackRow>(`
        SELECT developer_index.producer_id AS id, vn.developers
        FROM vn_developer_index developer_index
        JOIN vn ON vn.id = developer_index.vn_id
        WHERE developer_index.producer_id = ANY($1::text[])
        ORDER BY developer_index.producer_id COLLATE "C", vn.id COLLATE "C"
      `, [[...missing]]);
      for (const row of fallback.rows) {
        if (names.has(row.id)) continue;
        const producer = decodePersistedProducerSummaries(row.developers)
          .find((candidate) => candidate.id === row.id);
        if (producer) names.set(row.id, producer.name);
      }
      return names;
    },
    async staffNames(ids) {
      if (ids.length === 0) return new Map();
      const production = await query<NameRow>(`
        SELECT DISTINCT ON (sid) sid AS id, name
        FROM vn_staff_credit
        WHERE sid = ANY($1::text[])
        ORDER BY sid, vn_id
      `, [[...ids]]);
      const names = nameMap(production.rows);
      const missing = ids.filter((id) => !names.has(id));
      if (missing.length === 0) return names;
      const voice = await query<NameRow>(`
        SELECT DISTINCT ON (sid) sid AS id, va_name AS name
        FROM vn_va_credit
        WHERE sid = ANY($1::text[])
        ORDER BY sid, vn_id
      `, [[...missing]]);
      for (const row of voice.rows) names.set(row.id, row.name);
      return names;
    },
    async characterNames(ids) {
      if (ids.length === 0) return new Map();
      const result = await query<NameRow>(`
        SELECT DISTINCT ON (c_id) c_id AS id, c_name AS name
        FROM vn_va_credit
        WHERE c_id = ANY($1::text[])
        ORDER BY c_id, vn_id
      `, [[...ids]]);
      return nameMap(result.rows);
    },
  };
}

const sqliteRepository: EntityNameRepository = {
  async vnTitles(ids) {
    if (ids.length === 0) return new Map();
    return (await import('@/lib/db')).batchGetVnTitles([...ids]);
  },
  async producerNames(ids) {
    if (ids.length === 0) return new Map();
    return (await import('@/lib/db')).batchGetProducerNames([...ids]);
  },
  async staffNames(ids) {
    if (ids.length === 0) return new Map();
    return (await import('@/lib/db')).batchGetStaffNames([...ids]);
  },
  async characterNames(ids) {
    if (ids.length === 0) return new Map();
    return (await import('@/lib/db')).batchGetCharNames([...ids]);
  },
};

let postgresRepository: EntityNameRepository | null = null;

/** Return the entity-name repository selected by the configured backend. */
export function getEntityNameRepository(): EntityNameRepository {
  if (readDatabaseConfig().backend !== 'postgres') return sqliteRepository;
  postgresRepository ??= createPostgresEntityNameRepository();
  return postgresRepository;
}
