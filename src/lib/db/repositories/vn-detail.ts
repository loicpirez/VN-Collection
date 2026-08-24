import type { QueryResultRow } from 'pg';
import type {
  CoOccurringTag,
  EgsRow,
  GameLogEntry,
  SourcePrefMap,
  VnAspectDisplay,
  VnAspectOverride,
} from '@/lib/db';
import { aspectKeyForResolution, isAspectKey, type AspectKey } from '@/lib/aspect-ratio';
import { readDatabaseConfig } from '../postgres-config';
import { postgresQuery } from '../postgres';

/** Patch accepted when editing one game-log entry. */
export interface GameLogPatch {
  note?: string;
  logged_at?: number;
  session_minutes?: number | null;
}

/** Asynchronous persistence contract for VN-detail secondary metadata. */
export interface VnDetailRepository {
  /** Read the linked ErogameScape row. */
  egs(vnId: string): Promise<EgsRow | null>;
  /** Read validated per-field source preferences. */
  sourcePreference(vnId: string): Promise<SourcePrefMap>;
  /** List newest game-log entries for one VN. */
  gameLog(vnId: string, limit?: number): Promise<GameLogEntry[]>;
  /** Update one game-log row scoped to its VN. */
  updateGameLog(vnId: string, id: number, patch: GameLogPatch): Promise<GameLogEntry | null>;
  /** Delete one game-log row scoped to its VN. */
  deleteGameLog(vnId: string, id: number): Promise<boolean>;
  /** Read the manual VN-level aspect override. */
  aspectOverride(vnId: string): Promise<VnAspectOverride | null>;
  /** Set or clear the manual VN-level aspect override. */
  setAspectOverride(input: { vnId: string; aspectKey?: AspectKey | null; note?: string | null }): Promise<void>;
  /** Derive the effective aspect key, including screenshot fallback. */
  aspectKey(vnId: string): Promise<AspectKey>;
  /** Derive rich aspect provenance for the VN detail page. */
  aspectDisplay(vnId: string): Promise<VnAspectDisplay>;
  /** List tags adjacent to the VN's own tag cluster. */
  coOccurringTags(vnId: string, limit?: number): Promise<CoOccurringTag[]>;
}

interface SourcePreferenceRow extends QueryResultRow {
  source_pref: string | null;
}

interface AspectOverrideRow extends QueryResultRow {
  aspect_key: string;
  note: string | null;
  updated_at: number;
}

interface AspectResolutionRow extends QueryResultRow {
  aspect_key: string;
  width: number | null;
  height: number | null;
  release_id: string;
}

interface ScreenshotRow extends QueryResultRow {
  screenshots: string | null;
}

interface CoOccurringTagRow extends QueryResultRow {
  tag_id: string;
  tag_name: string;
  tag_category: string | null;
  shared_count: number;
}

const SOURCE_FIELDS = new Set(['title', 'description', 'image', 'brand', 'rating', 'playtime']);
const SOURCE_CHOICES = new Set(['auto', 'vndb', 'egs', 'custom']);

function sourcePreference(raw: string | null): SourcePrefMap {
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const entries = Object.entries(parsed);
    if (!entries.every(([field, choice]) => SOURCE_FIELDS.has(field) && SOURCE_CHOICES.has(String(choice)))) return {};
    return parsed as SourcePrefMap;
  } catch {
    return {};
  }
}

function boundedLimit(limit: number | undefined, fallback: number, maximum = 500): number {
  const value = limit ?? fallback;
  if (!Number.isFinite(value)) return fallback;
  return Math.max(1, Math.min(maximum, Math.floor(value)));
}

function decodedScreenshotAspects(raw: string | null): AspectKey[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((screenshot) => {
      if (!screenshot || typeof screenshot !== 'object' || Array.isArray(screenshot)) return [];
      const dims = (screenshot as { dims?: unknown }).dims;
      if (!Array.isArray(dims) || dims.length < 2) return [];
      const [width, height] = dims;
      if (typeof width !== 'number' || typeof height !== 'number' || width <= 0 || height <= 0) return [];
      return [aspectKeyForResolution(width, height)];
    });
  } catch {
    return [];
  }
}

function strongestAspect(aspects: readonly AspectKey[]): AspectKey {
  const counts = new Map<AspectKey, number>();
  let best: AspectKey = 'unknown';
  let bestCount = 0;
  for (const aspect of aspects) {
    const count = (counts.get(aspect) ?? 0) + 1;
    counts.set(aspect, count);
    if (count > bestCount) {
      best = aspect;
      bestCount = count;
    }
  }
  return best;
}

async function postgresAspectOverride(vnId: string): Promise<VnAspectOverride | null> {
  const result = await postgresQuery<AspectOverrideRow>(`
    SELECT aspect_key, note, updated_at FROM vn_aspect_override WHERE vn_id = $1
  `, [vnId]);
  const row = result.rows[0];
  return row && isAspectKey(row.aspect_key) ? { ...row, aspect_key: row.aspect_key } : null;
}

async function postgresAspectRows(vnId: string): Promise<AspectResolutionRow[]> {
  const result = await postgresQuery<AspectResolutionRow>(`
    SELECT resolution.aspect_key, resolution.width, resolution.height, resolution.release_id
    FROM release_resolution_cache resolution
    WHERE (
      resolution.vn_id = $1
      OR EXISTS (
        SELECT 1 FROM owned_release owned
        WHERE owned.vn_id = $1 AND owned.release_id = resolution.release_id
      )
    )
      AND resolution.aspect_key IS NOT NULL
      AND resolution.aspect_key <> 'unknown'
  `, [vnId]);
  return result.rows;
}

function aspectDisplayFromRows(rows: readonly AspectResolutionRow[]): VnAspectDisplay | null {
  const counts = new Map<AspectKey, number>();
  const first = new Map<AspectKey, AspectResolutionRow>();
  let screenshotOnly = true;
  for (const row of rows) {
    if (!isAspectKey(row.aspect_key) || row.aspect_key === 'unknown') continue;
    counts.set(row.aspect_key, (counts.get(row.aspect_key) ?? 0) + 1);
    if (!first.has(row.aspect_key)) first.set(row.aspect_key, row);
    if (!row.release_id.startsWith('screenshot:')) screenshotOnly = false;
  }
  const aspects = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([aspect]) => aspect);
  const primary = aspects[0];
  if (!primary) return null;
  const representative = first.get(primary);
  return {
    aspect: primary,
    aspects,
    width: representative?.width ?? null,
    height: representative?.height ?? null,
    source: screenshotOnly ? 'screenshot' : 'release',
  };
}

/** Create the PostgreSQL-backed VN-detail repository. */
export function createPostgresVnDetailRepository(): VnDetailRepository {
  return {
    async egs(vnId) {
      const result = await postgresQuery<EgsRow & QueryResultRow>(`
        SELECT vn_id, egs_id, gamename, gamename_furigana, brand_id, brand_name,
          model, description, image_url, local_image, okazu, erogame, raw_json,
          median, average, dispersion, count, sellday, playtime_median_minutes,
          source, fetched_at
        FROM egs_game WHERE vn_id = $1
      `, [vnId]);
      return result.rows[0] ?? null;
    },
    async sourcePreference(vnId) {
      const result = await postgresQuery<SourcePreferenceRow>(
        'SELECT source_pref FROM collection WHERE vn_id = $1',
        [vnId],
      );
      return sourcePreference(result.rows[0]?.source_pref ?? null);
    },
    async gameLog(vnId, limit) {
      const result = await postgresQuery<GameLogEntry & QueryResultRow>(`
        SELECT id, vn_id, note, logged_at, session_minutes, created_at, updated_at
        FROM vn_game_log WHERE vn_id = $1
        ORDER BY logged_at DESC, id DESC
        LIMIT $2
      `, [vnId, boundedLimit(limit, 200)]);
      return result.rows;
    },
    async updateGameLog(vnId, id, patch) {
      const currentResult = await postgresQuery<GameLogEntry & QueryResultRow>(`
        SELECT id, vn_id, note, logged_at, session_minutes, created_at, updated_at
        FROM vn_game_log WHERE id = $1 AND vn_id = $2
      `, [id, vnId]);
      const current = currentResult.rows[0];
      if (!current) return null;
      const note = patch.note === undefined ? current.note : patch.note.trim().slice(0, 8000);
      if (!note) throw new Error('empty note');
      const loggedAt = patch.logged_at ?? current.logged_at;
      const sessionMinutes = patch.session_minutes === undefined
        ? current.session_minutes
        : patch.session_minutes != null && patch.session_minutes > 0
          ? Math.round(patch.session_minutes)
          : null;
      const updatedAt = Date.now();
      const result = await postgresQuery<GameLogEntry & QueryResultRow>(`
        UPDATE vn_game_log SET note = $1, logged_at = $2, session_minutes = $3, updated_at = $4
        WHERE id = $5 AND vn_id = $6
        RETURNING id, vn_id, note, logged_at, session_minutes, created_at, updated_at
      `, [note, loggedAt, sessionMinutes, updatedAt, id, vnId]);
      return result.rows[0] ?? null;
    },
    async deleteGameLog(vnId, id) {
      const result = await postgresQuery(
        'DELETE FROM vn_game_log WHERE id = $1 AND vn_id = $2',
        [id, vnId],
      );
      return result.rowCount !== null && result.rowCount > 0;
    },
    aspectOverride: postgresAspectOverride,
    async setAspectOverride(input) {
      const aspect = input.aspectKey && isAspectKey(input.aspectKey) && input.aspectKey !== 'unknown'
        ? input.aspectKey
        : null;
      if (!aspect) {
        await postgresQuery('DELETE FROM vn_aspect_override WHERE vn_id = $1', [input.vnId]);
        return;
      }
      await postgresQuery(`
        INSERT INTO vn_aspect_override (vn_id, aspect_key, note, updated_at)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT(vn_id) DO UPDATE SET
          aspect_key = EXCLUDED.aspect_key,
          note = EXCLUDED.note,
          updated_at = EXCLUDED.updated_at
      `, [input.vnId, aspect, input.note?.trim() || null, Date.now()]);
    },
    async aspectKey(vnId) {
      const manual = await postgresAspectOverride(vnId);
      if (manual) return manual.aspect_key;
      const edition = await postgresQuery<{ aspect: string } & QueryResultRow>(`
        SELECT COALESCE(override.aspect_key, resolution.aspect_key) AS aspect
        FROM owned_release owned
        LEFT JOIN owned_release_aspect_override override
          ON override.vn_id = owned.vn_id AND override.release_id = owned.release_id
        LEFT JOIN release_resolution_cache resolution ON resolution.release_id = owned.release_id
        WHERE owned.vn_id = $1
          AND COALESCE(override.aspect_key, resolution.aspect_key) IS NOT NULL
          AND COALESCE(override.aspect_key, resolution.aspect_key) <> 'unknown'
        LIMIT 1
      `, [vnId]);
      const editionAspect = edition.rows[0]?.aspect;
      if (isAspectKey(editionAspect) && editionAspect !== 'unknown') return editionAspect;
      const direct = await postgresQuery<{ aspect_key: string } & QueryResultRow>(`
        SELECT aspect_key FROM release_resolution_cache
        WHERE vn_id = $1 AND aspect_key <> 'unknown' LIMIT 1
      `, [vnId]);
      const directAspect = direct.rows[0]?.aspect_key;
      if (isAspectKey(directAspect) && directAspect !== 'unknown') return directAspect;
      const screenshots = await postgresQuery<ScreenshotRow>('SELECT screenshots FROM vn WHERE id = $1', [vnId]);
      return strongestAspect(decodedScreenshotAspects(screenshots.rows[0]?.screenshots ?? null));
    },
    async aspectDisplay(vnId) {
      const manual = await postgresAspectOverride(vnId);
      if (manual && manual.aspect_key !== 'unknown') {
        return { aspect: manual.aspect_key, aspects: [manual.aspect_key], width: null, height: null, source: 'manual' };
      }
      const edition = await postgresQuery<AspectOverrideRow & { width: number | null; height: number | null }>(`
        SELECT aspect_key, width, height, note, updated_at
        FROM owned_release_aspect_override
        WHERE vn_id = $1 AND aspect_key <> 'unknown'
        LIMIT 1
      `, [vnId]);
      const editionRow = edition.rows[0];
      if (editionRow && isAspectKey(editionRow.aspect_key)) {
        return {
          aspect: editionRow.aspect_key,
          aspects: [editionRow.aspect_key],
          width: editionRow.width,
          height: editionRow.height,
          source: 'edition',
        };
      }
      return aspectDisplayFromRows(await postgresAspectRows(vnId))
        ?? { aspect: 'unknown', aspects: [], width: null, height: null, source: 'unknown' };
    },
    async coOccurringTags(vnId, limit) {
      const result = await postgresQuery<CoOccurringTagRow>(`
        WITH seed_tags AS (
          SELECT tag_id FROM vn_tag_index WHERE vn_id = $1 AND spoiler = 0
        ), seed_matched_vns AS (
          SELECT DISTINCT tag.vn_id
          FROM vn_tag_index tag
          JOIN collection owned ON owned.vn_id = tag.vn_id
          WHERE tag.vn_id <> $1 AND tag.spoiler = 0
            AND tag.tag_id IN (SELECT tag_id FROM seed_tags)
        )
        SELECT tag.tag_id, COALESCE(MAX(tag.tag_name), tag.tag_id) AS tag_name,
          MAX(tag.category) AS tag_category, COUNT(DISTINCT tag.vn_id)::int AS shared_count
        FROM vn_tag_index tag
        JOIN seed_matched_vns matched ON matched.vn_id = tag.vn_id
        WHERE tag.spoiler = 0 AND tag.tag_id NOT IN (SELECT tag_id FROM seed_tags)
        GROUP BY tag.tag_id
        ORDER BY shared_count DESC, app_search_normalize(COALESCE(MAX(tag.tag_name), tag.tag_id)) COLLATE "C"
        LIMIT $2
      `, [vnId, boundedLimit(limit, 24)]);
      return result.rows.map((row) => ({
        id: row.tag_id,
        name: row.tag_name,
        category: row.tag_category,
        shared: row.shared_count,
      }));
    },
  };
}

const sqliteRepository: VnDetailRepository = {
  async egs(vnId) {
    return (await import('@/lib/db')).getEgsForVn(vnId);
  },
  async sourcePreference(vnId) {
    return (await import('@/lib/db')).getSourcePref(vnId);
  },
  async gameLog(vnId, limit) {
    return (await import('@/lib/db')).listGameLogForVn(vnId, limit);
  },
  async updateGameLog(vnId, id, patch) {
    return (await import('@/lib/db')).updateGameLogEntry(vnId, id, patch);
  },
  async deleteGameLog(vnId, id) {
    return (await import('@/lib/db')).deleteGameLogEntry(vnId, id);
  },
  async aspectOverride(vnId) {
    return (await import('@/lib/db')).getVnAspectOverride(vnId);
  },
  async setAspectOverride(input) {
    (await import('@/lib/db')).setVnAspectOverride(input);
  },
  async aspectKey(vnId) {
    return (await import('@/lib/db')).deriveVnAspectKey(vnId);
  },
  async aspectDisplay(vnId) {
    return (await import('@/lib/db')).deriveVnAspectDisplay(vnId);
  },
  async coOccurringTags(vnId, limit) {
    return (await import('@/lib/db')).getCoOccurringTags(vnId, limit);
  },
};

let postgresRepository: VnDetailRepository | null = null;

/** Return the VN-detail repository selected by the configured backend. */
export function getVnDetailRepository(): VnDetailRepository {
  if (readDatabaseConfig().backend !== 'postgres') return sqliteRepository;
  postgresRepository ??= createPostgresVnDetailRepository();
  return postgresRepository;
}
