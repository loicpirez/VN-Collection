import type { QueryResultRow } from 'pg';
import type { SeriesLite, SeriesRow, SeriesWithVns } from '@/lib/types';
import type { SeriesSuggestion } from '@/lib/series-detect';
import { asJsonRecord, parseJsonArray } from '@/lib/json-shape';
import { readDatabaseConfig } from '../postgres-config';
import { postgresQuery, withPostgresTransaction, type PostgresParameter } from '../postgres';

/** Mutable series metadata fields. */
export interface SeriesPatch {
  name?: string;
  description?: string | null;
  cover_path?: string | null;
  banner_path?: string | null;
}

/** Ordered VN membership requested for an atomic series update. */
export interface SeriesMembershipInput {
  vnId: string;
  orderIndex: number;
}

/** Asynchronous persistence contract for series and their VN memberships. */
export interface SeriesRepository {
  /** List every user-defined series alphabetically. */
  list(): Promise<SeriesRow[]>;
  /** Return one series with its ordered VN members. */
  get(id: number): Promise<SeriesWithVns | null>;
  /** Return the series memberships for one VN. */
  listForVn(vnId: string): Promise<SeriesLite[]>;
  /** Patch one series and return the updated row. */
  update(id: number, patch: SeriesPatch): Promise<SeriesRow | null>;
  /** Delete one series and its cascading memberships. */
  remove(id: number): Promise<void>;
  /** Link every supplied VN atomically, replacing each existing order index. */
  addMembers(id: number, members: readonly SeriesMembershipInput[]): Promise<void>;
  /** Remove one VN membership from a series. */
  removeMember(id: number, vnId: string): Promise<void>;
  /** Suggest a series from transitive strong VN relations. */
  suggest(vnId: string): Promise<SeriesSuggestion | null>;
  /** Walk every transitive strong VN relation from one seed. */
  walkRelations(vnId: string): Promise<Array<{ id: string; title: string; relation: string }>>;
}

interface SeriesMemberRow extends QueryResultRow {
  id: string;
  title: string;
  image_thumb: string | null;
  local_image_thumb: string | null;
  status: SeriesWithVns['vns'][number]['status'];
  order_index: number;
}

function asSeries(row: SeriesRow | undefined): SeriesRow | null {
  return row ?? null;
}

const SERIES_RELATIONS = new Set(['seq', 'preq', 'set', 'fan', 'alt', 'orig']);
const MAX_SERIES_WALK = 500;

interface RelationRow extends QueryResultRow {
  relations: string | null;
}

interface RelatedVn {
  id: string;
  title: string;
  relation: string;
}

function trimVolumeMarker(value: string): string {
  return value
    .replace(/[:：][\s\S]*$/u, '')
    .replace(/[～~\-—][\s\S]*[～~]?$/u, '')
    .replace(/\s+(?:Ⅰ|Ⅱ|Ⅲ|Ⅳ|Ⅴ|Ⅵ|Ⅶ|Ⅷ|Ⅸ|Ⅹ|[IVX]+|\d+)\s*$/u, '')
    .trim();
}

function longestCommonPrefix(first: string, rest: readonly string[]): string {
  let prefix = first;
  for (const title of rest) {
    while (!title.startsWith(prefix)) {
      prefix = prefix.slice(0, -1);
      if (!prefix) return '';
    }
  }
  return prefix.trim().replace(/[\s:：~～\-—]+$/u, '').trim();
}

function decodedRelations(raw: string | null): RelatedVn[] {
  return parseJsonArray(raw).flatMap((value) => {
    const relation = asJsonRecord(value);
    return relation &&
      typeof relation.id === 'string' &&
      typeof relation.title === 'string' &&
      typeof relation.relation === 'string' &&
      SERIES_RELATIONS.has(relation.relation)
      ? [{ id: relation.id, title: relation.title, relation: relation.relation }]
      : [];
  });
}

async function walkPostgresSeriesRelations(seedVnId: string): Promise<RelatedVn[]> {
  const visited = new Set([seedVnId]);
  const queue = [seedVnId];
  const output: RelatedVn[] = [];
  for (const current of queue) {
    if (output.length >= MAX_SERIES_WALK) break;
    const result = await postgresQuery<RelationRow>('SELECT relations FROM vn WHERE id = $1', [current]);
    for (const relation of decodedRelations(result.rows[0]?.relations ?? null)) {
      if (visited.has(relation.id)) continue;
      visited.add(relation.id);
      output.push(relation);
      if (output.length >= MAX_SERIES_WALK) break;
      queue.push(relation.id);
    }
  }
  return output;
}

async function postgresSeriesSuggestion(vnId: string): Promise<SeriesSuggestion | null> {
  const seedResult = await postgresQuery<{ title: string } & QueryResultRow>(
    'SELECT title FROM vn WHERE id = $1',
    [vnId],
  );
  const seed = seedResult.rows[0];
  if (!seed) return null;
  const relations = await walkPostgresSeriesRelations(vnId);
  if (relations.length === 0) return null;
  const relatedIds = relations.map((relation) => relation.id);
  const [ownedResult, seedSeriesResult] = await Promise.all([
    postgresQuery<{ vn_id: string } & QueryResultRow>(
      'SELECT vn_id FROM collection WHERE vn_id = ANY($1::text[])',
      [relatedIds],
    ),
    postgresQuery<{ series_id: number } & QueryResultRow>(
      'SELECT series_id FROM series_vn WHERE vn_id = $1',
      [vnId],
    ),
  ]);
  if (seedSeriesResult.rows.length > 0) return null;
  const owned = new Set(ownedResult.rows.map((row) => row.vn_id));
  const relatedInCollection = relations.filter((relation) => owned.has(relation.id));
  if (relatedInCollection.length === 0) return null;
  const existingResult = await postgresQuery<{ id: number; name: string } & QueryResultRow>(`
    SELECT series_row.id, series_row.name
    FROM series series_row
    WHERE EXISTS (
      SELECT 1 FROM series_vn membership
      WHERE membership.series_id = series_row.id
        AND membership.vn_id = ANY($1::text[])
    )
    ORDER BY app_search_normalize(series_row.name) COLLATE "C", series_row.id
  `, [relatedInCollection.map((relation) => relation.id)]);
  let suggestedName = longestCommonPrefix(seed.title, relatedInCollection.map((relation) => relation.title));
  if (!suggestedName || suggestedName.length < 3) suggestedName = trimVolumeMarker(seed.title);
  if (!suggestedName) suggestedName = seed.title;
  return { existing: existingResult.rows, suggestedName, relatedInCollection };
}

async function walkSqliteSeriesRelations(seedVnId: string): Promise<RelatedVn[]> {
  const { db } = await import('@/lib/db');
  const visited = new Set([seedVnId]);
  const queue = [seedVnId];
  const output: RelatedVn[] = [];
  const statement = db.prepare('SELECT relations FROM vn WHERE id = ?');
  for (const current of queue) {
    if (output.length >= MAX_SERIES_WALK) break;
    const row = statement.get(current) as { relations: string | null } | undefined;
    for (const relation of decodedRelations(row?.relations ?? null)) {
      if (visited.has(relation.id)) continue;
      visited.add(relation.id);
      output.push(relation);
      if (output.length >= MAX_SERIES_WALK) break;
      queue.push(relation.id);
    }
  }
  return output;
}

async function sqliteSeriesSuggestion(vnId: string): Promise<SeriesSuggestion | null> {
  const { db } = await import('@/lib/db');
  const seed = db.prepare('SELECT title FROM vn WHERE id = ?').get(vnId) as { title: string } | undefined;
  if (!seed) return null;
  const relations = await walkSqliteSeriesRelations(vnId);
  if (relations.length === 0) return null;
  const seedSeries = db.prepare('SELECT series_id FROM series_vn WHERE vn_id = ?').get(vnId);
  if (seedSeries) return null;
  const ownedRows = db.prepare(`
    SELECT vn_id FROM collection
    WHERE vn_id IN (${relations.map(() => '?').join(',')})
  `).all(...relations.map((relation) => relation.id)) as Array<{ vn_id: string }>;
  const owned = new Set(ownedRows.map((row) => row.vn_id));
  const relatedInCollection = relations.filter((relation) => owned.has(relation.id));
  if (relatedInCollection.length === 0) return null;
  const existing = db.prepare(`
    SELECT DISTINCT series_row.id, series_row.name
    FROM series series_row
    JOIN series_vn membership ON membership.series_id = series_row.id
    WHERE membership.vn_id IN (${relatedInCollection.map(() => '?').join(',')})
    ORDER BY series_row.name COLLATE NOCASE, series_row.id
  `).all(...relatedInCollection.map((relation) => relation.id)) as Array<{ id: number; name: string }>;
  let suggestedName = longestCommonPrefix(seed.title, relatedInCollection.map((relation) => relation.title));
  if (!suggestedName || suggestedName.length < 3) suggestedName = trimVolumeMarker(seed.title);
  if (!suggestedName) suggestedName = seed.title;
  return { existing, suggestedName, relatedInCollection };
}

/** Create the PostgreSQL-backed series repository. */
export function createPostgresSeriesRepository(): SeriesRepository {
  return {
    async list() {
      const result = await postgresQuery<SeriesRow & QueryResultRow>(`
        SELECT id, name, description, cover_path, banner_path, created_at, updated_at
        FROM series ORDER BY app_search_normalize(name) COLLATE "C", id LIMIT 2000
      `);
      return result.rows;
    },
    async get(id) {
      const [seriesResult, memberResult] = await Promise.all([
        postgresQuery<SeriesRow & QueryResultRow>(`
          SELECT id, name, description, cover_path, banner_path, created_at, updated_at
          FROM series WHERE id = $1
        `, [id]),
        postgresQuery<SeriesMemberRow>(`
          SELECT v.id, v.title, v.image_thumb, v.local_image_thumb, c.status, series_vn.order_index
          FROM series_vn JOIN vn v ON v.id = series_vn.vn_id
          LEFT JOIN collection c ON c.vn_id = v.id
          WHERE series_vn.series_id = $1
          ORDER BY series_vn.order_index, app_search_normalize(v.title) COLLATE "C", v.id
        `, [id]),
      ]);
      const series = asSeries(seriesResult.rows[0]);
      return series ? { ...series, vns: memberResult.rows } : null;
    },
    async listForVn(vnId) {
      const result = await postgresQuery<SeriesLite & QueryResultRow>(`
        SELECT series.id, series.name FROM series
        JOIN series_vn ON series_vn.series_id = series.id
        WHERE series_vn.vn_id = $1
        ORDER BY app_search_normalize(series.name) COLLATE "C", series.id
      `, [vnId]);
      return result.rows;
    },
    async update(id, patch) {
      const fields: Array<{ column: string; value: PostgresParameter }> = [];
      if (patch.name !== undefined) fields.push({ column: 'name', value: patch.name });
      if ('description' in patch) fields.push({ column: 'description', value: patch.description ?? null });
      if ('cover_path' in patch) fields.push({ column: 'cover_path', value: patch.cover_path ?? null });
      if ('banner_path' in patch) fields.push({ column: 'banner_path', value: patch.banner_path ?? null });
      if (fields.length === 0) {
        const result = await postgresQuery<SeriesRow & QueryResultRow>(`
          SELECT id, name, description, cover_path, banner_path, created_at, updated_at
          FROM series WHERE id = $1
        `, [id]);
        return asSeries(result.rows[0]);
      }
      const values = fields.map((field) => field.value);
      values.push(Date.now(), id);
      const result = await postgresQuery<SeriesRow & QueryResultRow>(`
        UPDATE series SET
          ${fields.map((field, index) => `${field.column} = $${index + 1}`).join(', ')},
          updated_at = $${fields.length + 1}
        WHERE id = $${fields.length + 2}
        RETURNING id, name, description, cover_path, banner_path, created_at, updated_at
      `, values);
      return asSeries(result.rows[0]);
    },
    async remove(id) {
      await postgresQuery('DELETE FROM series WHERE id = $1', [id]);
    },
    async addMembers(id, members) {
      if (members.length === 0) return;
      await withPostgresTransaction(async (client) => {
        await client.query('SELECT id FROM series WHERE id = $1 FOR UPDATE', [id]);
        for (const member of members) {
          await client.query(`
            INSERT INTO series_vn (series_id, vn_id, order_index) VALUES ($1, $2, $3)
            ON CONFLICT(series_id, vn_id) DO UPDATE SET order_index = EXCLUDED.order_index
          `, [id, member.vnId.toLowerCase(), member.orderIndex]);
        }
      });
    },
    async removeMember(id, vnId) {
      await postgresQuery('DELETE FROM series_vn WHERE series_id = $1 AND vn_id = $2', [id, vnId.toLowerCase()]);
    },
    suggest: postgresSeriesSuggestion,
    walkRelations: walkPostgresSeriesRelations,
  };
}

const sqliteRepository: SeriesRepository = {
  async list() {
    return (await import('@/lib/db')).listSeries();
  },
  async get(id) {
    return (await import('@/lib/db')).getSeries(id);
  },
  async listForVn(vnId) {
    return (await import('@/lib/db')).listSeriesForVn(vnId);
  },
  async update(id, patch) {
    return (await import('@/lib/db')).updateSeries(id, patch) ?? null;
  },
  async remove(id) {
    (await import('@/lib/db')).deleteSeries(id);
  },
  async addMembers(id, members) {
    const { addVnToSeries, db } = await import('@/lib/db');
    db.transaction(() => {
      for (const member of members) addVnToSeries(id, member.vnId, member.orderIndex);
    })();
  },
  async removeMember(id, vnId) {
    (await import('@/lib/db')).removeVnFromSeries(id, vnId);
  },
  suggest: sqliteSeriesSuggestion,
  walkRelations: walkSqliteSeriesRelations,
};

let postgresRepository: SeriesRepository | null = null;

/** Return the series repository selected by the configured backend. */
export function getSeriesRepository(): SeriesRepository {
  if (readDatabaseConfig().backend !== 'postgres') return sqliteRepository;
  postgresRepository ??= createPostgresSeriesRepository();
  return postgresRepository;
}
