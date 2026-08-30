import type { QueryResultRow } from 'pg';
import { readDatabaseConfig } from '../postgres-config';
import { postgresQuery } from '../postgres';
import { postgresContainsPattern } from '../postgres-search';

/** Supported ranking dimensions for the local seiyuu index. */
export type VoiceActorSort = 'vns' | 'collection' | 'characters' | 'recent' | 'name';

/** Scope of actors displayed by the local seiyuu index. */
export type VoiceActorScope = 'all' | 'collection';

/** Validated query options accepted by the voice-actor repository. */
export interface VoiceActorBrowseOptions {
  query: string;
  language: string | null;
  scope: VoiceActorScope;
  sort: VoiceActorSort;
  direction: 'asc' | 'desc';
  minimumVns: number;
  page: number;
  pageSize: number;
}

/** Representative character attached to one seiyuu result. */
export interface VoiceActorCharacterPreview {
  id: string;
  name: string;
  original: string | null;
  imageUrl: string | null;
  localImage: string | null;
  vnCount: number;
}

/** One ranked seiyuu row assembled from local voice credits. */
export interface VoiceActorBrowseRow {
  id: string;
  name: string;
  original: string | null;
  language: string | null;
  vnCount: number;
  collectionVnCount: number;
  characterCount: number;
  creditCount: number;
  aliasCount: number;
  firstYear: number | null;
  lastYear: number | null;
  aliases: string[];
  characters: VoiceActorCharacterPreview[];
}

/** Global coverage counters for all locally indexed voice credits. */
export interface VoiceActorBrowseStats {
  actorCount: number;
  vnCount: number;
  characterCount: number;
  creditCount: number;
  collectionActorCount: number;
  collectionVnCount: number;
}

/** One language facet and its distinct local seiyuu count. */
export interface VoiceActorLanguageFacet {
  language: string;
  actorCount: number;
}

/** Paginated local seiyuu result with global coverage context. */
export interface VoiceActorBrowseResult {
  rows: VoiceActorBrowseRow[];
  total: number;
  page: number;
  pageSize: number;
  stats: VoiceActorBrowseStats;
  languages: VoiceActorLanguageFacet[];
}

/** Persistence contract for the dedicated local seiyuu browser. */
export interface VoiceActorRepository {
  browse(options: VoiceActorBrowseOptions): Promise<VoiceActorBrowseResult>;
}

interface AggregateRow extends QueryResultRow {
  sid: string;
  name: string;
  original: string | null;
  language: string | null;
  vn_count: number;
  collection_vn_count: number;
  character_count: number;
  credit_count: number;
  alias_count: number;
  first_year: number | null;
  last_year: number | null;
}

interface StatsRow extends QueryResultRow {
  actor_count: number;
  vn_count: number;
  character_count: number;
  credit_count: number;
  collection_actor_count: number;
  collection_vn_count: number;
}

interface LanguageRow extends QueryResultRow {
  language: string;
  actor_count: number;
}

interface AliasRow extends QueryResultRow {
  sid: string;
  name: string;
}

interface CharacterRow extends QueryResultRow {
  sid: string;
  c_id: string;
  c_name: string;
  c_original: string | null;
  c_image_url: string | null;
  local_image: string | null;
  vn_count: number;
}

function sqliteOrder(options: VoiceActorBrowseOptions): string {
  const direction = options.direction === 'asc' ? 'ASC' : 'DESC';
  if (options.sort === 'name') return `primary_name COLLATE NOCASE ${direction}, a.sid COLLATE NOCASE ASC`;
  if (options.sort === 'collection') return `a.collection_vn_count ${direction}, a.vn_count DESC, primary_name COLLATE NOCASE ASC`;
  if (options.sort === 'characters') return `a.character_count ${direction}, a.vn_count DESC, primary_name COLLATE NOCASE ASC`;
  if (options.sort === 'recent') return `a.last_year IS NULL, a.last_year ${direction}, a.vn_count DESC, primary_name COLLATE NOCASE ASC`;
  return `a.vn_count ${direction}, a.character_count DESC, primary_name COLLATE NOCASE ASC`;
}

function postgresOrder(options: VoiceActorBrowseOptions): string {
  const direction = options.direction === 'asc' ? 'ASC' : 'DESC';
  if (options.sort === 'name') return `app_search_normalize(primary_name) COLLATE "C" ${direction}, a.sid COLLATE "C" ASC`;
  if (options.sort === 'collection') return `a.collection_vn_count ${direction}, a.vn_count DESC, app_search_normalize(primary_name) COLLATE "C" ASC`;
  if (options.sort === 'characters') return `a.character_count ${direction}, a.vn_count DESC, app_search_normalize(primary_name) COLLATE "C" ASC`;
  if (options.sort === 'recent') return `a.last_year ${direction} NULLS LAST, a.vn_count DESC, app_search_normalize(primary_name) COLLATE "C" ASC`;
  return `a.vn_count ${direction}, a.character_count DESC, app_search_normalize(primary_name) COLLATE "C" ASC`;
}

function mapStats(row: StatsRow | undefined): VoiceActorBrowseStats {
  return {
    actorCount: row?.actor_count ?? 0,
    vnCount: row?.vn_count ?? 0,
    characterCount: row?.character_count ?? 0,
    creditCount: row?.credit_count ?? 0,
    collectionActorCount: row?.collection_actor_count ?? 0,
    collectionVnCount: row?.collection_vn_count ?? 0,
  };
}

function mapRows(
  rows: readonly AggregateRow[],
  aliases: readonly AliasRow[],
  characters: readonly CharacterRow[],
): VoiceActorBrowseRow[] {
  const aliasesBySid = new Map<string, string[]>();
  for (const alias of aliases) {
    const values = aliasesBySid.get(alias.sid) ?? [];
    if (!values.includes(alias.name)) values.push(alias.name);
    aliasesBySid.set(alias.sid, values);
  }
  const charactersBySid = new Map<string, VoiceActorCharacterPreview[]>();
  for (const character of characters) {
    const values = charactersBySid.get(character.sid) ?? [];
    values.push({
      id: character.c_id,
      name: character.c_name,
      original: character.c_original,
      imageUrl: character.c_image_url,
      localImage: character.local_image,
      vnCount: character.vn_count,
    });
    charactersBySid.set(character.sid, values);
  }
  return rows.map((row) => ({
    id: row.sid,
    name: row.name,
    original: row.original,
    language: row.language,
    vnCount: row.vn_count,
    collectionVnCount: row.collection_vn_count,
    characterCount: row.character_count,
    creditCount: row.credit_count,
    aliasCount: row.alias_count,
    firstYear: row.first_year,
    lastYear: row.last_year,
    aliases: (aliasesBySid.get(row.sid) ?? []).filter((alias) => alias !== row.name).slice(0, 4),
    characters: charactersBySid.get(row.sid) ?? [],
  }));
}

function sqliteQualified(options: VoiceActorBrowseOptions): { sql: string; values: Array<string> } {
  const predicates: string[] = [];
  const values: string[] = [];
  if (options.language) {
    predicates.push('va.va_lang = ?');
    values.push(options.language);
  }
  if (options.scope === 'collection') {
    predicates.push(`EXISTS (
      SELECT 1
      FROM vn_va_credit collection_credit
      JOIN collection actor_collection ON actor_collection.vn_id = collection_credit.vn_id
      WHERE collection_credit.sid = va.sid
    )`);
  }
  if (options.query) {
    const pattern = `%${options.query.replace(/[\\%_]/g, '\\$&')}%`;
    predicates.push(`(
      va.sid LIKE ? COLLATE NOCASE ESCAPE '\\'
      OR va.va_name LIKE ? COLLATE NOCASE ESCAPE '\\'
      OR COALESCE(va.va_original, '') LIKE ? COLLATE NOCASE ESCAPE '\\'
    )`);
    values.push(pattern, pattern, pattern);
  }
  return {
    sql: `
      qualified AS (
        SELECT DISTINCT va.sid
        FROM vn_va_credit va
        ${predicates.length > 0 ? `WHERE ${predicates.join(' AND ')}` : ''}
      )
    `,
    values,
  };
}

function sqliteAggregateCte(options: VoiceActorBrowseOptions): { sql: string; values: Array<string> } {
  const qualified = sqliteQualified(options);
  return {
    values: qualified.values,
    sql: `
      WITH ${qualified.sql},
      aggregated AS (
        SELECT va.sid,
          COUNT(DISTINCT va.vn_id) AS vn_count,
          COUNT(DISTINCT CASE WHEN c.vn_id IS NOT NULL THEN va.vn_id END) AS collection_vn_count,
          COUNT(DISTINCT va.c_id) AS character_count,
          COUNT(*) AS credit_count,
          COUNT(DISTINCT va.va_name) AS alias_count,
          MIN(CASE WHEN substr(v.released, 1, 4) GLOB '[0-9][0-9][0-9][0-9]' THEN CAST(substr(v.released, 1, 4) AS INTEGER) END) AS first_year,
          MAX(CASE WHEN substr(v.released, 1, 4) GLOB '[0-9][0-9][0-9][0-9]' THEN CAST(substr(v.released, 1, 4) AS INTEGER) END) AS last_year
        FROM vn_va_credit va
        JOIN qualified q ON q.sid = va.sid
        JOIN vn v ON v.id = va.vn_id
        LEFT JOIN collection c ON c.vn_id = va.vn_id
        GROUP BY va.sid
      ),
      name_counts AS (
        SELECT va.sid, va.va_name, va.va_original, va.va_lang, COUNT(*) AS uses,
          ROW_NUMBER() OVER (
            PARTITION BY va.sid
            ORDER BY COUNT(*) DESC, va.va_name COLLATE NOCASE, COALESCE(va.va_original, '') COLLATE NOCASE
          ) AS name_rank
        FROM vn_va_credit va
        JOIN qualified q ON q.sid = va.sid
        GROUP BY va.sid, va.va_name, va.va_original, va.va_lang
      )
    `,
  };
}

async function browseSqlite(options: VoiceActorBrowseOptions): Promise<VoiceActorBrowseResult> {
  const { db } = await import('@/lib/db');
  const cte = sqliteAggregateCte(options);
  const stats = db.prepare(`
    SELECT COUNT(DISTINCT va.sid) AS actor_count,
      COUNT(DISTINCT va.vn_id) AS vn_count,
      COUNT(DISTINCT va.c_id) AS character_count,
      COUNT(*) AS credit_count,
      COUNT(DISTINCT CASE WHEN c.vn_id IS NOT NULL THEN va.sid END) AS collection_actor_count,
      COUNT(DISTINCT CASE WHEN c.vn_id IS NOT NULL THEN va.vn_id END) AS collection_vn_count
    FROM vn_va_credit va
    LEFT JOIN collection c ON c.vn_id = va.vn_id
  `).get() as StatsRow | undefined;
  const languages = db.prepare(`
    SELECT va_lang AS language, COUNT(DISTINCT sid) AS actor_count
    FROM vn_va_credit
    WHERE va_lang IS NOT NULL AND va_lang <> ''
    GROUP BY va_lang
    ORDER BY actor_count DESC, va_lang COLLATE NOCASE
  `).all() as LanguageRow[];
  const count = db.prepare(`${cte.sql}
    SELECT COUNT(*) AS total FROM aggregated WHERE vn_count >= ?
  `).get(...cte.values, options.minimumVns) as { total: number };
  const total = count.total;
  const pageCount = Math.max(1, Math.ceil(total / options.pageSize));
  const page = Math.min(options.page, pageCount);
  const rows = db.prepare(`${cte.sql}
    SELECT a.sid, n.va_name AS name, n.va_original AS original, n.va_lang AS language,
      a.vn_count, a.collection_vn_count, a.character_count, a.credit_count, a.alias_count,
      a.first_year, a.last_year, n.va_name AS primary_name
    FROM aggregated a
    JOIN name_counts n ON n.sid = a.sid AND n.name_rank = 1
    WHERE a.vn_count >= ?
    ORDER BY ${sqliteOrder(options)}
    LIMIT ? OFFSET ?
  `).all(
    ...cte.values,
    options.minimumVns,
    options.pageSize,
    (page - 1) * options.pageSize,
  ) as AggregateRow[];
  const ids = rows.map((row) => row.sid);
  if (ids.length === 0) {
    return {
      rows: [], total, page, pageSize: options.pageSize,
      stats: mapStats(stats),
      languages: languages.map((row) => ({ language: row.language, actorCount: row.actor_count })),
    };
  }
  const placeholders = ids.map(() => '?').join(',');
  const aliases = db.prepare(`
    SELECT sid, va_name AS name
    FROM vn_va_credit
    WHERE sid IN (${placeholders})
    GROUP BY sid, va_name
    ORDER BY sid COLLATE NOCASE, COUNT(*) DESC, va_name COLLATE NOCASE
  `).all(...ids) as AliasRow[];
  const characters = db.prepare(`
    SELECT sid, c_id, c_name, c_original, c_image_url, local_image, vn_count
    FROM (
      SELECT va.sid, va.c_id, MAX(va.c_name) AS c_name,
        MAX(va.c_original) AS c_original, MAX(va.c_image_url) AS c_image_url,
        MAX(ci.local_path) AS local_image, COUNT(DISTINCT va.vn_id) AS vn_count,
        ROW_NUMBER() OVER (
          PARTITION BY va.sid
          ORDER BY COUNT(DISTINCT va.vn_id) DESC, MAX(va.c_name) COLLATE NOCASE, va.c_id
        ) AS character_rank
      FROM vn_va_credit va
      LEFT JOIN character_image ci ON ci.char_id = va.c_id
      WHERE va.sid IN (${placeholders})
      GROUP BY va.sid, va.c_id
    ) ranked
    WHERE character_rank <= 3
    ORDER BY sid COLLATE NOCASE, character_rank
  `).all(...ids) as CharacterRow[];
  return {
    rows: mapRows(rows, aliases, characters),
    total,
    page,
    pageSize: options.pageSize,
    stats: mapStats(stats),
    languages: languages.map((row) => ({ language: row.language, actorCount: row.actor_count })),
  };
}

function postgresQualified(options: VoiceActorBrowseOptions): { sql: string; values: Array<string> } {
  const predicates: string[] = [];
  const values: string[] = [];
  if (options.language) {
    values.push(options.language);
    predicates.push(`va.va_lang = $${values.length}`);
  }
  if (options.scope === 'collection') {
    predicates.push(`EXISTS (
      SELECT 1
      FROM vn_va_credit collection_credit
      JOIN collection actor_collection ON actor_collection.vn_id = collection_credit.vn_id
      WHERE collection_credit.sid = va.sid
    )`);
  }
  if (options.query) {
    values.push(postgresContainsPattern(options.query));
    const parameter = `$${values.length}`;
    predicates.push(`(
      app_search_normalize(va.sid) LIKE ${parameter} ESCAPE '\\'
      OR app_search_normalize(va.va_name) LIKE ${parameter} ESCAPE '\\'
      OR app_search_normalize(COALESCE(va.va_original, '')) LIKE ${parameter} ESCAPE '\\'
    )`);
  }
  return {
    values,
    sql: `
      qualified AS (
        SELECT DISTINCT va.sid
        FROM vn_va_credit va
        ${predicates.length > 0 ? `WHERE ${predicates.join(' AND ')}` : ''}
      )
    `,
  };
}

function postgresAggregateCte(options: VoiceActorBrowseOptions): { sql: string; values: Array<string> } {
  const qualified = postgresQualified(options);
  return {
    values: qualified.values,
    sql: `
      WITH ${qualified.sql},
      aggregated AS (
        SELECT va.sid,
          COUNT(DISTINCT va.vn_id)::integer AS vn_count,
          COUNT(DISTINCT CASE WHEN c.vn_id IS NOT NULL THEN va.vn_id END)::integer AS collection_vn_count,
          COUNT(DISTINCT va.c_id)::integer AS character_count,
          COUNT(*)::integer AS credit_count,
          COUNT(DISTINCT va.va_name)::integer AS alias_count,
          MIN(CASE WHEN LEFT(COALESCE(v.released, ''), 4) ~ '^[0-9]{4}$' THEN LEFT(v.released, 4)::integer END) AS first_year,
          MAX(CASE WHEN LEFT(COALESCE(v.released, ''), 4) ~ '^[0-9]{4}$' THEN LEFT(v.released, 4)::integer END) AS last_year
        FROM vn_va_credit va
        JOIN qualified q ON q.sid = va.sid
        JOIN vn v ON v.id = va.vn_id
        LEFT JOIN collection c ON c.vn_id = va.vn_id
        GROUP BY va.sid
      ),
      name_counts AS (
        SELECT va.sid, va.va_name, va.va_original, va.va_lang, COUNT(*) AS uses,
          ROW_NUMBER() OVER (
            PARTITION BY va.sid
            ORDER BY COUNT(*) DESC, app_search_normalize(va.va_name) COLLATE "C", COALESCE(va.va_original, '') COLLATE "C"
          ) AS name_rank
        FROM vn_va_credit va
        JOIN qualified q ON q.sid = va.sid
        GROUP BY va.sid, va.va_name, va.va_original, va.va_lang
      )
    `,
  };
}

/** Create a PostgreSQL-backed local seiyuu repository. */
export function createPostgresVoiceActorRepository(): VoiceActorRepository {
  return {
    async browse(options) {
      const cte = postgresAggregateCte(options);
      const minimumParameter = `$${cte.values.length + 1}`;
      const [statsResult, languageResult, countResult] = await Promise.all([
        postgresQuery<StatsRow>(`
          SELECT COUNT(DISTINCT va.sid)::integer AS actor_count,
            COUNT(DISTINCT va.vn_id)::integer AS vn_count,
            COUNT(DISTINCT va.c_id)::integer AS character_count,
            COUNT(*)::integer AS credit_count,
            COUNT(DISTINCT CASE WHEN c.vn_id IS NOT NULL THEN va.sid END)::integer AS collection_actor_count,
            COUNT(DISTINCT CASE WHEN c.vn_id IS NOT NULL THEN va.vn_id END)::integer AS collection_vn_count
          FROM vn_va_credit va
          LEFT JOIN collection c ON c.vn_id = va.vn_id
        `),
        postgresQuery<LanguageRow>(`
          SELECT va_lang AS language, COUNT(DISTINCT sid)::integer AS actor_count
          FROM vn_va_credit
          WHERE va_lang IS NOT NULL AND va_lang <> ''
          GROUP BY va_lang
          ORDER BY actor_count DESC, va_lang COLLATE "C"
        `),
        postgresQuery<{ total: number } & QueryResultRow>(`${cte.sql}
          SELECT COUNT(*)::integer AS total FROM aggregated WHERE vn_count >= ${minimumParameter}
        `, [...cte.values, options.minimumVns]),
      ]);
      const total = countResult.rows[0]?.total ?? 0;
      const pageCount = Math.max(1, Math.ceil(total / options.pageSize));
      const page = Math.min(options.page, pageCount);
      const limitParameter = `$${cte.values.length + 2}`;
      const offsetParameter = `$${cte.values.length + 3}`;
      const result = await postgresQuery<AggregateRow>(`${cte.sql}
        SELECT a.sid, n.va_name AS name, n.va_original AS original, n.va_lang AS language,
          a.vn_count, a.collection_vn_count, a.character_count, a.credit_count, a.alias_count,
          a.first_year, a.last_year, n.va_name AS primary_name
        FROM aggregated a
        JOIN name_counts n ON n.sid = a.sid AND n.name_rank = 1
        WHERE a.vn_count >= ${minimumParameter}
        ORDER BY ${postgresOrder(options)}
        LIMIT ${limitParameter} OFFSET ${offsetParameter}
      `, [
        ...cte.values,
        options.minimumVns,
        options.pageSize,
        (page - 1) * options.pageSize,
      ]);
      const ids = result.rows.map((row) => row.sid);
      let aliases: AliasRow[] = [];
      let characters: CharacterRow[] = [];
      if (ids.length > 0) {
        const [aliasResult, characterResult] = await Promise.all([
          postgresQuery<AliasRow>(`
            SELECT sid, va_name AS name
            FROM vn_va_credit
            WHERE sid = ANY($1::text[])
            GROUP BY sid, va_name
            ORDER BY sid COLLATE "C", COUNT(*) DESC, app_search_normalize(va_name) COLLATE "C"
          `, [ids]),
          postgresQuery<CharacterRow>(`
            SELECT sid, c_id, c_name, c_original, c_image_url, local_image, vn_count
            FROM (
              SELECT va.sid, va.c_id, MAX(va.c_name) AS c_name,
                MAX(va.c_original) AS c_original, MAX(va.c_image_url) AS c_image_url,
                MAX(ci.local_path) AS local_image, COUNT(DISTINCT va.vn_id)::integer AS vn_count,
                ROW_NUMBER() OVER (
                  PARTITION BY va.sid
                  ORDER BY COUNT(DISTINCT va.vn_id) DESC, app_search_normalize(MAX(va.c_name)) COLLATE "C", va.c_id
                ) AS character_rank
              FROM vn_va_credit va
              LEFT JOIN character_image ci ON ci.char_id = va.c_id
              WHERE va.sid = ANY($1::text[])
              GROUP BY va.sid, va.c_id
            ) ranked
            WHERE character_rank <= 3
            ORDER BY sid COLLATE "C", character_rank
          `, [ids]),
        ]);
        aliases = aliasResult.rows;
        characters = characterResult.rows;
      }
      return {
        rows: mapRows(result.rows, aliases, characters),
        total,
        page,
        pageSize: options.pageSize,
        stats: mapStats(statsResult.rows[0]),
        languages: languageResult.rows.map((row) => ({ language: row.language, actorCount: row.actor_count })),
      };
    },
  };
}

const sqliteRepository: VoiceActorRepository = { browse: browseSqlite };
let postgresRepository: VoiceActorRepository | null = null;

/** Return the local seiyuu repository configured for the active database backend. */
export function getVoiceActorRepository(): VoiceActorRepository {
  if (readDatabaseConfig().backend !== 'postgres') return sqliteRepository;
  postgresRepository ??= createPostgresVoiceActorRepository();
  return postgresRepository;
}
