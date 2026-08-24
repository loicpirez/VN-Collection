import type { PoolClient, QueryResultRow } from 'pg';
import { readDatabaseConfig } from '../postgres-config';
import { postgresQuery, withPostgresTransaction } from '../postgres';
import { postgresContainsPattern } from '../postgres-search';

/** Persisted VN-to-Steam application mapping. */
export interface SteamLinkRow {
  vn_id: string;
  appid: number;
  steam_name: string;
  source: 'auto' | 'manual';
  last_synced_minutes: number | null;
  created_at: number;
  updated_at: number;
}

/** Input accepted when a manual or discovered Steam mapping is saved. */
export interface SteamLinkInput {
  vnId: string;
  appid: number;
  steamName: string;
  source: 'auto' | 'manual';
}

/** Minimal collection projection required to calculate Steam suggestions. */
export interface SteamSuggestionRow {
  vn_id: string;
  vn_title: string;
  current: number;
}

/** Cover-aware local collection search result. */
export interface SteamCollectionSearchRow {
  id: string;
  title: string;
  alttitle: string | null;
  image_url: string | null;
  image_thumb: string | null;
  local_image: string | null;
  local_image_thumb: string | null;
  image_sexual: number | null;
}

/** Confirmed Steam playtime update. */
export interface SteamPlaytimeApply {
  vn_id: string;
  playtime_minutes: number;
}

/** Persistence boundary for Steam mappings and collection projections. */
export interface SteamRepository {
  /** List every persisted Steam mapping, newest first. */
  listLinks(): Promise<SteamLinkRow[]>;
  /** Read one mapping by VN id. */
  getLinkForVn(vnId: string): Promise<SteamLinkRow | null>;
  /** Read one mapping by Steam application id. */
  getLinkByAppid(appid: number): Promise<SteamLinkRow | null>;
  /** Save a mapping while preserving a user-pinned manual choice from auto detection. */
  setLink(input: SteamLinkInput): Promise<SteamLinkRow>;
  /** Delete one mapping and report whether it existed. */
  deleteLink(vnId: string): Promise<boolean>;
  /** Stamp the most recently synchronized playtime on one mapping. */
  markSynced(vnId: string, minutes: number): Promise<void>;
  /** List canonical VNDB ids currently in the collection. */
  listCollectionVndbIds(): Promise<string[]>;
  /** Read titles and current playtime for linked collection ids. */
  listSuggestionRows(vnIds: readonly string[]): Promise<SteamSuggestionRow[]>;
  /** Search the local collection by normalized title fragment. */
  searchCollection(query: string, limit: number): Promise<SteamCollectionSearchRow[]>;
  /** Apply confirmed playtimes atomically and return the number of distinct collected VNs changed. */
  applyPlaytime(applies: readonly SteamPlaytimeApply[]): Promise<number>;
}

interface CountRow extends QueryResultRow {
  applied: number;
}

interface SteamLinkQueryRow extends SteamLinkRow, QueryResultRow {}
interface SteamSuggestionQueryRow extends SteamSuggestionRow, QueryResultRow {}
interface SteamCollectionSearchQueryRow extends SteamCollectionSearchRow, QueryResultRow {}

const STEAM_LINK_COLUMNS = 'vn_id, appid, steam_name, source, last_synced_minutes, created_at, updated_at';

async function getPostgresLink(client: PoolClient, vnId: string): Promise<SteamLinkRow | null> {
  const result = await client.query<SteamLinkQueryRow>(
    `SELECT ${STEAM_LINK_COLUMNS} FROM steam_link WHERE vn_id = $1`,
    [vnId],
  );
  return result.rows[0] ?? null;
}

/** Create the PostgreSQL-backed Steam repository. */
export function createPostgresSteamRepository(): SteamRepository {
  return {
    async listLinks() {
      const result = await postgresQuery<SteamLinkQueryRow>(`
        SELECT ${STEAM_LINK_COLUMNS} FROM steam_link ORDER BY updated_at DESC LIMIT 10000
      `);
      return result.rows;
    },
    async getLinkForVn(vnId) {
      const result = await postgresQuery<SteamLinkQueryRow>(
        `SELECT ${STEAM_LINK_COLUMNS} FROM steam_link WHERE vn_id = $1`,
        [vnId],
      );
      return result.rows[0] ?? null;
    },
    async getLinkByAppid(appid) {
      const result = await postgresQuery<SteamLinkQueryRow>(
        `SELECT ${STEAM_LINK_COLUMNS} FROM steam_link WHERE appid = $1 ORDER BY updated_at DESC LIMIT 1`,
        [appid],
      );
      return result.rows[0] ?? null;
    },
    async setLink(input) {
      return withPostgresTransaction(async (client) => {
        const existing = await getPostgresLink(client, input.vnId);
        if (existing?.source === 'manual' && input.source === 'auto') return existing;
        const now = Date.now();
        await client.query(`
          INSERT INTO steam_link (
            vn_id, appid, steam_name, source, last_synced_minutes, created_at, updated_at
          ) VALUES ($1, $2, $3, $4, NULL, $5, $5)
          ON CONFLICT (vn_id) DO UPDATE SET
            appid = EXCLUDED.appid,
            steam_name = EXCLUDED.steam_name,
            source = EXCLUDED.source,
            updated_at = EXCLUDED.updated_at
        `, [input.vnId, input.appid, input.steamName.slice(0, 200), input.source, now]);
        const saved = await getPostgresLink(client, input.vnId);
        if (!saved) throw new Error('Steam link write did not return a row');
        return saved;
      });
    },
    async deleteLink(vnId) {
      const result = await postgresQuery('DELETE FROM steam_link WHERE vn_id = $1', [vnId]);
      return (result.rowCount ?? 0) > 0;
    },
    async markSynced(vnId, minutes) {
      await postgresQuery(`
        UPDATE steam_link SET last_synced_minutes = $1, updated_at = $2 WHERE vn_id = $3
      `, [minutes, Date.now(), vnId]);
    },
    async listCollectionVndbIds() {
      const result = await postgresQuery<{ vn_id: string } & QueryResultRow>(`
        SELECT vn_id FROM collection WHERE vn_id ~ '^v[1-9][0-9]*$' ORDER BY vn_id
      `);
      return result.rows.map((row) => row.vn_id);
    },
    async listSuggestionRows(vnIds) {
      if (vnIds.length === 0) return [];
      const result = await postgresQuery<SteamSuggestionQueryRow>(`
        SELECT v.id AS vn_id, v.title AS vn_title, c.playtime_minutes AS current
        FROM collection c JOIN vn v ON v.id = c.vn_id
        WHERE c.vn_id = ANY($1::text[])
      `, [vnIds]);
      return result.rows;
    },
    async searchCollection(query, limit) {
      const trimmed = query.trim();
      if (!trimmed) return [];
      const result = await postgresQuery<SteamCollectionSearchQueryRow>(`
        SELECT v.id, v.title, v.alttitle, v.image_url, v.image_thumb,
          v.local_image, v.local_image_thumb, v.image_sexual
        FROM collection c JOIN vn v ON v.id = c.vn_id
        WHERE app_search_normalize(v.title) LIKE $1 ESCAPE '\\'
          OR app_search_normalize(v.alttitle) LIKE $1 ESCAPE '\\'
        ORDER BY app_search_normalize(v.title) COLLATE "C", v.id
        LIMIT $2
      `, [postgresContainsPattern(trimmed), Math.max(1, Math.min(100, Math.floor(limit)))]);
      return result.rows;
    },
    async applyPlaytime(applies) {
      if (applies.length === 0) return 0;
      const vnIds = applies.map((apply) => apply.vn_id);
      const playtimeMinutes = applies.map((apply) => apply.playtime_minutes);
      const inputIndexes = applies.map((_apply, index) => index);
      const now = Date.now();
      return withPostgresTransaction(async (client) => {
        const result = await client.query<CountRow>(`
          WITH raw_input AS (
            SELECT vn_id, playtime_minutes, input_index
            FROM UNNEST($1::text[], $2::bigint[], $3::bigint[])
              AS value(vn_id, playtime_minutes, input_index)
          ), input AS (
            SELECT DISTINCT ON (vn_id) vn_id, playtime_minutes
            FROM raw_input ORDER BY vn_id, input_index DESC
          ), prior AS MATERIALIZED (
            SELECT c.vn_id, c.playtime_minutes AS previous_minutes, input.playtime_minutes
            FROM collection c JOIN input ON input.vn_id = c.vn_id
            FOR UPDATE OF c
          ), updated AS (
            UPDATE collection AS c
            SET playtime_minutes = prior.playtime_minutes, updated_at = $4
            FROM prior WHERE c.vn_id = prior.vn_id
            RETURNING c.vn_id
          ), activity AS (
            INSERT INTO vn_activity (vn_id, kind, payload, occurred_at)
            SELECT vn_id, 'playtime', json_build_object(
              'from', previous_minutes,
              'to', playtime_minutes,
              'delta', playtime_minutes - previous_minutes
            )::text, $4
            FROM prior WHERE playtime_minutes <> previous_minutes
            RETURNING vn_id
          ), synced AS (
            UPDATE steam_link AS link
            SET last_synced_minutes = prior.playtime_minutes, updated_at = $4
            FROM prior WHERE link.vn_id = prior.vn_id
            RETURNING link.vn_id
          )
          SELECT COUNT(*)::bigint AS applied FROM prior
        `, [vnIds, playtimeMinutes, inputIndexes, now]);
        return result.rows[0]?.applied ?? 0;
      });
    },
  };
}

const sqliteRepository: SteamRepository = {
  async listLinks() {
    return (await import('@/lib/db')).listSteamLinks();
  },
  async getLinkForVn(vnId) {
    return (await import('@/lib/db')).getSteamLinkForVn(vnId);
  },
  async getLinkByAppid(appid) {
    return (await import('@/lib/db')).getSteamLinkByAppid(appid);
  },
  async setLink(input) {
    return (await import('@/lib/db')).setSteamLink(input);
  },
  async deleteLink(vnId) {
    return (await import('@/lib/db')).deleteSteamLink(vnId);
  },
  async markSynced(vnId, minutes) {
    (await import('@/lib/db')).markSteamSynced(vnId, minutes);
  },
  async listCollectionVndbIds() {
    return (await import('@/lib/db')).listInCollectionVnIds().filter((vnId) => /^v[1-9]\d*$/.test(vnId));
  },
  async listSuggestionRows(vnIds) {
    if (vnIds.length === 0) return [];
    const database = (await import('@/lib/db')).db;
    const rows: SteamSuggestionRow[] = [];
    for (let offset = 0; offset < vnIds.length; offset += 500) {
      const chunk = vnIds.slice(offset, offset + 500);
      const placeholders = chunk.map(() => '?').join(',');
      rows.push(...database.prepare(`
        SELECT v.id AS vn_id, v.title AS vn_title, c.playtime_minutes AS current
        FROM collection c JOIN vn v ON v.id = c.vn_id
        WHERE c.vn_id IN (${placeholders})
      `).all(...chunk) as SteamSuggestionRow[]);
    }
    return rows;
  },
  async searchCollection(query, limit) {
    const trimmed = query.trim();
    if (!trimmed) return [];
    const like = `%${trimmed.replace(/[%_]/g, '\\$&')}%`;
    return (await import('@/lib/db')).db.prepare(`
      SELECT v.id, v.title, v.alttitle, v.image_url, v.image_thumb,
        v.local_image, v.local_image_thumb, v.image_sexual
      FROM collection c JOIN vn v ON v.id = c.vn_id
      WHERE v.title LIKE ? ESCAPE '\\' OR v.alttitle LIKE ? ESCAPE '\\'
      ORDER BY v.title COLLATE NOCASE
      LIMIT ?
    `).all(like, like, Math.max(1, Math.min(100, Math.floor(limit)))) as SteamCollectionSearchRow[];
  },
  async applyPlaytime(applies) {
    const databaseModule = await import('@/lib/db');
    const deduplicated = new Map(applies.map((apply) => [apply.vn_id, apply.playtime_minutes]));
    return databaseModule.db.transaction(() => {
      let applied = 0;
      for (const [vnId, minutes] of deduplicated) {
        if (!databaseModule.isInCollection(vnId)) continue;
        databaseModule.updateCollection(vnId, { playtime_minutes: minutes });
        databaseModule.markSteamSynced(vnId, minutes);
        applied += 1;
      }
      return applied;
    })();
  },
};

let postgresRepository: SteamRepository | null = null;

/** Return the Steam repository selected by the configured backend. */
export function getSteamRepository(): SteamRepository {
  if (readDatabaseConfig().backend !== 'postgres') return sqliteRepository;
  postgresRepository ??= createPostgresSteamRepository();
  return postgresRepository;
}
