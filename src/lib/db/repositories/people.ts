import type { QueryResultRow } from 'pg';
import { decodeVndbCharacter } from '@/lib/vndb-character-row-shape';
import type { VndbCharacter } from '@/lib/vndb';
import { postgresContainsPattern } from '../postgres-search';
import { readDatabaseConfig } from '../postgres-config';
import { postgresQuery, withPostgresTransaction } from '../postgres';

/** Compact VN metadata shared by staff-credit views. */
export interface PeopleVnSummary {
  id: string;
  title: string;
  alttitle: string | null;
  image_url: string | null;
  image_thumb: string | null;
  image_sexual: number | null;
  local_image: string | null;
  local_image_thumb: string | null;
  released: string | null;
  rating: number | null;
  in_collection: boolean;
}

/** Locally reconstructed staff profile. */
export interface StaffProfile {
  sid: string;
  name: string;
  original: string | null;
  lang: string | null;
}

/** Production roles held by one staff member for one VN. */
export interface StaffWorkCredit {
  vn: PeopleVnSummary;
  roles: { role: string; eid: number | null; note: string | null; credited_as: string }[];
}

/** Voice roles held by one staff member for one VN. */
export interface StaffVaCredit {
  vn: PeopleVnSummary;
  characters: {
    id: string;
    name: string;
    original: string | null;
    image_url: string | null;
    local_image: string | null;
    credited_as: string;
    note: string | null;
  }[];
}

/** One year in a voice actor's credit timeline. */
export interface VaYearBucket {
  year: number;
  total: number;
  inCollection: number;
  vnIds: string[];
}

/** One voice actor and the VNs where they voice a character. */
export interface CharacterVoiceCredit {
  sid: string;
  va_name: string;
  va_original: string | null;
  va_lang: string | null;
  vns: { id: string; title: string; released: string | null; in_collection: boolean }[];
}

/** Another character record that shares a known display name. */
export interface CharacterSibling {
  c_id: string;
  c_name: string;
  c_original: string | null;
  c_image_url: string | null;
  vns: { vn_id: string; vn_title: string }[];
}

/** Another staff record that shares a known display name. */
export interface StaffSibling {
  sid: string;
  name: string;
  original: string | null;
  vns: { vn_id: string; vn_title: string }[];
}

/** Persisted character portrait metadata. */
export interface CharacterImageRecord {
  url: string | null;
  local_path: string | null;
  fetched_at: number;
}

/** Transactional character profile-cache write and reverse-index payload. */
export interface CharacterFullCacheWrite {
  characterId: string;
  body: string;
  fetchedAt: number;
  expiresAt: number;
  vnIds: readonly string[];
}

/** Filters accepted by local character search. */
export interface LocalCharacterSearchOptions {
  q?: string;
  limit?: number;
}

/** One decoded local character search result. */
export interface LocalCharacterSearchRow {
  profile: VndbCharacter;
  voice_languages: string[];
}

/** Filters accepted by local staff search. */
export interface LocalStaffSearchOptions {
  q?: string;
  role?: string | null;
  lang?: string | null;
  limit?: number;
}

/** One aggregated local staff search result. */
export interface LocalStaffRow {
  id: string;
  name: string;
  original: string | null;
  lang: string | null;
  roles: string[];
  vn_count: number;
}

/** Persistence contract for staff, characters, voice credits, and portraits. */
export interface PeopleRepository {
  staffProfile(sid: string): Promise<StaffProfile | null>;
  productionCredits(sid: string, options?: { inCollectionOnly?: boolean }): Promise<StaffWorkCredit[]>;
  voiceCredits(sid: string, options?: { inCollectionOnly?: boolean }): Promise<StaffVaCredit[]>;
  voiceTimeline(sid: string): Promise<VaYearBucket[]>;
  characterSiblings(characterId: string): Promise<CharacterSibling[]>;
  staffSiblings(sid: string): Promise<StaffSibling[]>;
  voiceActorsForCharacter(characterId: string): Promise<CharacterVoiceCredit[]>;
  searchCharacters(options?: LocalCharacterSearchOptions): Promise<LocalCharacterSearchRow[]>;
  searchStaff(options?: LocalStaffSearchOptions): Promise<LocalStaffRow[]>;
  characterImage(characterId: string): Promise<CharacterImageRecord | null>;
  characterImages(characterIds: readonly string[]): Promise<Map<string, CharacterImageRecord>>;
  upsertCharacterImage(characterId: string, url: string | null, localPath: string | null): Promise<void>;
  characterIdsForVn(vnId: string): Promise<string[]>;
  voiceCharacterIdsForVn(vnId: string): Promise<string[]>;
  persistCharacterFullCache(input: CharacterFullCacheWrite): Promise<void>;
}

interface ProductionRow extends QueryResultRow {
  id: string;
  title: string;
  alttitle: string | null;
  image_url: string | null;
  image_thumb: string | null;
  image_sexual: number | null;
  local_image: string | null;
  local_image_thumb: string | null;
  released: string | null;
  rating: number | null;
  role: string;
  eid: number | null;
  note: string | null;
  credited_as: string;
  in_collection: boolean;
}

interface VoiceRow extends QueryResultRow {
  id: string;
  title: string;
  alttitle: string | null;
  image_url: string | null;
  image_thumb: string | null;
  image_sexual: number | null;
  local_image: string | null;
  local_image_thumb: string | null;
  released: string | null;
  rating: number | null;
  c_id: string;
  c_name: string;
  c_original: string | null;
  c_image_url: string | null;
  c_local_image: string | null;
  credited_as: string;
  note: string | null;
  in_collection: boolean;
}

function vnSummary(row: ProductionRow | VoiceRow): PeopleVnSummary {
  return {
    id: row.id,
    title: row.title,
    alttitle: row.alttitle,
    image_url: row.image_url,
    image_thumb: row.image_thumb,
    image_sexual: row.image_sexual,
    local_image: row.local_image,
    local_image_thumb: row.local_image_thumb,
    released: row.released,
    rating: row.rating,
    in_collection: row.in_collection,
  };
}

function groupProductionCredits(rows: readonly ProductionRow[]): StaffWorkCredit[] {
  const grouped = new Map<string, StaffWorkCredit>();
  for (const row of rows) {
    let credit = grouped.get(row.id);
    if (!credit) {
      credit = { vn: vnSummary(row), roles: [] };
      grouped.set(row.id, credit);
    }
    credit.roles.push({
      role: row.role,
      eid: row.eid,
      note: row.note,
      credited_as: row.credited_as,
    });
  }
  return [...grouped.values()];
}

function groupVoiceCredits(rows: readonly VoiceRow[]): StaffVaCredit[] {
  const grouped = new Map<string, StaffVaCredit>();
  for (const row of rows) {
    let credit = grouped.get(row.id);
    if (!credit) {
      credit = { vn: vnSummary(row), characters: [] };
      grouped.set(row.id, credit);
    }
    credit.characters.push({
      id: row.c_id,
      name: row.c_name,
      original: row.c_original,
      image_url: row.c_image_url,
      local_image: row.c_local_image,
      credited_as: row.credited_as,
      note: row.note,
    });
  }
  return [...grouped.values()];
}

function parseCharacterProfile(body: string): VndbCharacter | null {
  try {
    const value: unknown = JSON.parse(body);
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    return decodeVndbCharacter(Reflect.get(value, 'profile'));
  } catch {
    return null;
  }
}

/** Create the PostgreSQL-backed people repository. */
export function createPostgresPeopleRepository(): PeopleRepository {
  return {
    async staffProfile(sid) {
      const production = await postgresQuery<{
        name: string;
        original: string | null;
        lang: string | null;
      } & QueryResultRow>(`
        SELECT name, original, lang
        FROM vn_staff_credit
        WHERE sid = $1
        ORDER BY vn_id, role
        LIMIT 1
      `, [sid]);
      const productionRow = production.rows[0];
      if (productionRow) return { sid, ...productionRow };
      const voice = await postgresQuery<{
        name: string;
        original: string | null;
        lang: string | null;
      } & QueryResultRow>(`
        SELECT va_name AS name, va_original AS original, va_lang AS lang
        FROM vn_va_credit
        WHERE sid = $1
        ORDER BY vn_id, c_id
        LIMIT 1
      `, [sid]);
      const voiceRow = voice.rows[0];
      return voiceRow ? { sid, ...voiceRow } : null;
    },
    async productionCredits(sid, options = {}) {
      const result = await postgresQuery<ProductionRow>(`
        SELECT
          v.id, v.title, v.alttitle, v.image_url, v.image_thumb, v.image_sexual,
          v.local_image, v.local_image_thumb, v.released, v.rating,
          sc.role, sc.eid, sc.note, sc.name AS credited_as,
          (c.vn_id IS NOT NULL) AS in_collection
        FROM vn_staff_credit sc
        JOIN vn v ON v.id = sc.vn_id
        LEFT JOIN collection c ON c.vn_id = sc.vn_id
        WHERE sc.sid = $1 AND ($2::boolean = false OR c.vn_id IS NOT NULL)
        ORDER BY v.released DESC NULLS LAST, app_search_normalize(v.title) COLLATE "C", sc.role, sc.eid NULLS LAST
        LIMIT 5000
      `, [sid, options.inCollectionOnly === true]);
      return groupProductionCredits(result.rows);
    },
    async voiceCredits(sid, options = {}) {
      const result = await postgresQuery<VoiceRow>(`
        SELECT
          v.id, v.title, v.alttitle, v.image_url, v.image_thumb, v.image_sexual,
          v.local_image, v.local_image_thumb, v.released, v.rating,
          va.c_id, va.c_name, va.c_original, va.c_image_url,
          ci.local_path AS c_local_image, va.va_name AS credited_as, va.note,
          (c.vn_id IS NOT NULL) AS in_collection
        FROM vn_va_credit va
        JOIN vn v ON v.id = va.vn_id
        LEFT JOIN collection c ON c.vn_id = va.vn_id
        LEFT JOIN character_image ci ON ci.char_id = va.c_id
        WHERE va.sid = $1 AND ($2::boolean = false OR c.vn_id IS NOT NULL)
        ORDER BY v.released DESC NULLS LAST, app_search_normalize(v.title) COLLATE "C",
          app_search_normalize(va.c_name) COLLATE "C", va.c_id
        LIMIT 5000
      `, [sid, options.inCollectionOnly === true]);
      return groupVoiceCredits(result.rows);
    },
    async voiceTimeline(sid) {
      const result = await postgresQuery<{
        year: number;
        vn_id: string;
        in_collection: boolean;
      } & QueryResultRow>(`
        SELECT
          CASE
            WHEN LEFT(COALESCE(v.released, ''), 4) ~ '^[0-9]{4}$'
              THEN LEFT(v.released, 4)::integer
            ELSE 0
          END AS year,
          v.id AS vn_id,
          (c.vn_id IS NOT NULL) AS in_collection
        FROM vn_va_credit va
        JOIN vn v ON v.id = va.vn_id
        LEFT JOIN collection c ON c.vn_id = va.vn_id
        WHERE va.sid = $1
        GROUP BY v.id, v.released, c.vn_id
      `, [sid]);
      const buckets = new Map<number, VaYearBucket>();
      for (const row of result.rows) {
        let bucket = buckets.get(row.year);
        if (!bucket) {
          bucket = { year: row.year, total: 0, inCollection: 0, vnIds: [] };
          buckets.set(row.year, bucket);
        }
        bucket.total += 1;
        if (row.in_collection) bucket.inCollection += 1;
        bucket.vnIds.push(row.vn_id);
      }
      return [...buckets.values()].sort((left, right) => left.year - right.year);
    },
    async characterSiblings(characterId) {
      const candidates = await postgresQuery<{ value: string } & QueryResultRow>(`
        SELECT DISTINCT value
        FROM (
          SELECT c_name AS value FROM vn_va_credit WHERE c_id = $1
          UNION
          SELECT c_original AS value FROM vn_va_credit WHERE c_id = $1
        ) names
        WHERE value IS NOT NULL AND LENGTH(value) >= 2
        ORDER BY value
        LIMIT 200
      `, [characterId]);
      const names = candidates.rows.map((row) => row.value);
      if (names.length === 0) return [];
      const result = await postgresQuery<{
        c_id: string;
        c_name: string;
        c_original: string | null;
        c_image_url: string | null;
        vn_id: string;
        vn_title: string;
      } & QueryResultRow>(`
        SELECT va.c_id, va.c_name, va.c_original, va.c_image_url,
          va.vn_id, v.title AS vn_title
        FROM vn_va_credit va
        JOIN vn v ON v.id = va.vn_id
        JOIN collection c ON c.vn_id = va.vn_id
        WHERE (va.c_name = ANY($1::text[]) OR va.c_original = ANY($1::text[]))
          AND va.c_id <> $2
        ORDER BY v.released DESC NULLS LAST, va.c_id, va.vn_id
        LIMIT 200
      `, [names, characterId]);
      const grouped = new Map<string, CharacterSibling>();
      for (const row of result.rows) {
        let sibling = grouped.get(row.c_id);
        if (!sibling) {
          sibling = {
            c_id: row.c_id,
            c_name: row.c_name,
            c_original: row.c_original,
            c_image_url: row.c_image_url,
            vns: [],
          };
          grouped.set(row.c_id, sibling);
        }
        if (!sibling.vns.some((vn) => vn.vn_id === row.vn_id)) {
          sibling.vns.push({ vn_id: row.vn_id, vn_title: row.vn_title });
        }
      }
      return [...grouped.values()];
    },
    async staffSiblings(sid) {
      const candidates = await postgresQuery<{ value: string } & QueryResultRow>(`
        SELECT DISTINCT value
        FROM (
          SELECT name AS value FROM vn_staff_credit WHERE sid = $1
          UNION SELECT original AS value FROM vn_staff_credit WHERE sid = $1
          UNION SELECT va_name AS value FROM vn_va_credit WHERE sid = $1
          UNION SELECT va_original AS value FROM vn_va_credit WHERE sid = $1
        ) names
        WHERE value IS NOT NULL AND LENGTH(value) >= 2
        ORDER BY value
        LIMIT 200
      `, [sid]);
      const names = candidates.rows.map((row) => row.value);
      if (names.length === 0) return [];
      const result = await postgresQuery<{
        sid: string;
        name: string;
        original: string | null;
        vn_id: string;
        vn_title: string;
      } & QueryResultRow>(`
        SELECT sc.sid, sc.name, sc.original, sc.vn_id, v.title AS vn_title
        FROM vn_staff_credit sc
        JOIN vn v ON v.id = sc.vn_id
        JOIN collection c ON c.vn_id = sc.vn_id
        WHERE (sc.name = ANY($1::text[]) OR sc.original = ANY($1::text[])) AND sc.sid <> $2
        UNION
        SELECT va.sid, va.va_name AS name, va.va_original AS original, va.vn_id, v.title AS vn_title
        FROM vn_va_credit va
        JOIN vn v ON v.id = va.vn_id
        JOIN collection c ON c.vn_id = va.vn_id
        WHERE (va.va_name = ANY($1::text[]) OR va.va_original = ANY($1::text[])) AND va.sid <> $2
        ORDER BY vn_title, sid
      `, [names, sid]);
      const grouped = new Map<string, StaffSibling>();
      for (const row of result.rows) {
        let sibling = grouped.get(row.sid);
        if (!sibling) {
          sibling = { sid: row.sid, name: row.name, original: row.original, vns: [] };
          grouped.set(row.sid, sibling);
        }
        if (!sibling.vns.some((vn) => vn.vn_id === row.vn_id)) {
          sibling.vns.push({ vn_id: row.vn_id, vn_title: row.vn_title });
        }
      }
      return [...grouped.values()];
    },
    async voiceActorsForCharacter(characterId) {
      const result = await postgresQuery<{
        sid: string;
        va_name: string;
        va_original: string | null;
        va_lang: string | null;
        id: string;
        title: string;
        released: string | null;
        in_collection: boolean;
      } & QueryResultRow>(`
        SELECT va.sid, va.va_name, va.va_original, va.va_lang,
          v.id, v.title, v.released, (c.vn_id IS NOT NULL) AS in_collection
        FROM vn_va_credit va
        JOIN vn v ON v.id = va.vn_id
        LEFT JOIN collection c ON c.vn_id = va.vn_id
        WHERE va.c_id = $1
        ORDER BY v.released DESC NULLS LAST, app_search_normalize(v.title) COLLATE "C", v.id
      `, [characterId]);
      const grouped = new Map<string, CharacterVoiceCredit>();
      for (const row of result.rows) {
        let credit = grouped.get(row.sid);
        if (!credit) {
          credit = {
            sid: row.sid,
            va_name: row.va_name,
            va_original: row.va_original,
            va_lang: row.va_lang,
            vns: [],
          };
          grouped.set(row.sid, credit);
        }
        credit.vns.push({
          id: row.id,
          title: row.title,
          released: row.released,
          in_collection: row.in_collection,
        });
      }
      return [...grouped.values()];
    },
    async searchCharacters(options = {}) {
      const result = await postgresQuery<{ body: string } & QueryResultRow>(`
        SELECT vc.body
        FROM vndb_cache vc
        WHERE LEFT(vc.cache_key, 10) = 'char_full:'
          AND (
            EXISTS (
              SELECT 1
              FROM character_vn_index ci
              JOIN collection c ON c.vn_id = ci.vn_id
              WHERE ci.character_id = SUBSTRING(vc.cache_key FROM 11)
            )
            OR EXISTS (
              SELECT 1
              FROM vn_va_credit va
              JOIN collection c ON c.vn_id = va.vn_id
              WHERE va.c_id = SUBSTRING(vc.cache_key FROM 11)
            )
          )
        ORDER BY vc.cache_key COLLATE "C"
        LIMIT 5000
      `);
      const needle = options.q?.trim().toLocaleLowerCase('und') ?? '';
      const limit = options.limit ?? 200;
      const profiles: VndbCharacter[] = [];
      for (const row of result.rows) {
        const profile = parseCharacterProfile(row.body);
        if (!profile) continue;
        if (needle) {
          const haystack = [profile.id, profile.name, profile.original ?? '', ...profile.aliases]
            .join('\n')
            .toLocaleLowerCase('und');
          if (!haystack.includes(needle)) continue;
        }
        profiles.push(profile);
        if (profiles.length >= limit) break;
      }
      if (profiles.length === 0) return [];
      const languages = await postgresQuery<{
        c_id: string;
        va_lang: string;
      } & QueryResultRow>(`
        SELECT DISTINCT c_id, va_lang
        FROM vn_va_credit
        WHERE c_id = ANY($1::text[]) AND va_lang IS NOT NULL
        ORDER BY c_id, va_lang
      `, [profiles.map((profile) => profile.id)]);
      const languagesByCharacter = new Map<string, string[]>();
      for (const row of languages.rows) {
        const values = languagesByCharacter.get(row.c_id) ?? [];
        values.push(row.va_lang);
        languagesByCharacter.set(row.c_id, values);
      }
      return profiles.map((profile) => ({
        profile,
        voice_languages: languagesByCharacter.get(profile.id) ?? [],
      }));
    },
    async searchStaff(options = {}) {
      const predicates: string[] = [];
      const values: Array<string | number> = [];
      if (options.q?.trim()) {
        values.push(postgresContainsPattern(options.q.trim()));
        const parameter = `$${values.length}`;
        predicates.push(`(
          app_search_normalize(sc.name) LIKE ${parameter} ESCAPE '\\'
          OR app_search_normalize(COALESCE(sc.original, '')) LIKE ${parameter} ESCAPE '\\'
          OR app_search_normalize(sc.sid) LIKE ${parameter} ESCAPE '\\'
        )`);
      }
      if (options.role) {
        values.push(options.role);
        predicates.push(`sc.role = $${values.length}`);
      }
      if (options.lang) {
        values.push(options.lang);
        predicates.push(`sc.lang = $${values.length}`);
      }
      values.push(Math.min(Math.max(options.limit ?? 100, 1), 500));
      const limitParameter = `$${values.length}`;
      const where = predicates.length > 0 ? `WHERE ${predicates.join(' AND ')}` : '';
      const result = await postgresQuery<{
        sid: string;
        name: string;
        original: string | null;
        lang: string | null;
        roles: string;
        vn_count: number;
      } & QueryResultRow>(`
        SELECT sc.sid,
          MAX(sc.name) AS name,
          MAX(sc.original) AS original,
          MAX(sc.lang) AS lang,
          STRING_AGG(DISTINCT sc.role, ',' ORDER BY sc.role) AS roles,
          COUNT(DISTINCT sc.vn_id)::BIGINT AS vn_count
        FROM vn_staff_credit sc
        JOIN collection c ON c.vn_id = sc.vn_id
        ${where}
        GROUP BY sc.sid
        ORDER BY vn_count DESC, app_search_normalize(MAX(sc.name)) COLLATE "C", sc.sid
        LIMIT ${limitParameter}
      `, values);
      return result.rows.map((row) => ({
        id: row.sid,
        name: row.name,
        original: row.original,
        lang: row.lang,
        roles: row.roles.split(',').filter(Boolean),
        vn_count: row.vn_count,
      }));
    },
    async characterImage(characterId) {
      const result = await postgresQuery<CharacterImageRecord & QueryResultRow>(`
        SELECT url, local_path, fetched_at
        FROM character_image
        WHERE char_id = $1
      `, [characterId]);
      return result.rows[0] ?? null;
    },
    async characterImages(characterIds) {
      const output = new Map<string, CharacterImageRecord>();
      if (characterIds.length === 0) return output;
      const result = await postgresQuery<(CharacterImageRecord & { char_id: string }) & QueryResultRow>(`
        SELECT char_id, url, local_path, fetched_at
        FROM character_image
        WHERE char_id = ANY($1::text[])
      `, [characterIds]);
      for (const row of result.rows) {
        output.set(row.char_id, {
          url: row.url,
          local_path: row.local_path,
          fetched_at: row.fetched_at,
        });
      }
      return output;
    },
    async upsertCharacterImage(characterId, url, localPath) {
      await postgresQuery(`
        INSERT INTO character_image (char_id, url, local_path, fetched_at)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (char_id) DO UPDATE SET
          url = EXCLUDED.url,
          local_path = EXCLUDED.local_path,
          fetched_at = EXCLUDED.fetched_at
      `, [characterId, url, localPath, Date.now()]);
    },
    async characterIdsForVn(vnId) {
      const result = await postgresQuery<{ character_id: string } & QueryResultRow>(`
        SELECT character_id FROM character_vn_index
        WHERE vn_id = $1
        ORDER BY character_id COLLATE "C"
      `, [vnId]);
      return result.rows.map((row) => row.character_id);
    },
    async voiceCharacterIdsForVn(vnId) {
      const result = await postgresQuery<{ c_id: string } & QueryResultRow>(`
        SELECT DISTINCT c_id COLLATE "C" AS c_id FROM vn_va_credit
        WHERE vn_id = $1
        ORDER BY c_id
      `, [vnId]);
      return result.rows.map((row) => row.c_id);
    },
    async persistCharacterFullCache(input) {
      await withPostgresTransaction(async (client) => {
        const cacheKey = `char_full:${input.characterId.toLowerCase()}`;
        await client.query(`
          INSERT INTO vndb_cache (
            cache_key, body, etag, last_modified, fetched_at, expires_at
          ) VALUES ($1, $2, NULL, NULL, $3, $4)
          ON CONFLICT(cache_key) DO UPDATE SET
            body = EXCLUDED.body,
            fetched_at = EXCLUDED.fetched_at,
            expires_at = EXCLUDED.expires_at
        `, [cacheKey, input.body, input.fetchedAt, input.expiresAt]);
        await client.query(
          'DELETE FROM character_vn_index WHERE character_id = $1',
          [input.characterId],
        );
        for (const vnId of new Set(input.vnIds)) {
          await client.query(`
            INSERT INTO character_vn_index (character_id, vn_id) VALUES ($1, $2)
            ON CONFLICT(character_id, vn_id) DO NOTHING
          `, [input.characterId, vnId]);
        }
      });
    },
  };
}

const sqliteRepository: PeopleRepository = {
  async staffProfile(sid) {
    return (await import('@/lib/db')).getStaffProfileFromCredits(sid);
  },
  async productionCredits(sid, options) {
    return (await import('@/lib/db')).listStaffProductionCredits(sid, options);
  },
  async voiceCredits(sid, options) {
    return (await import('@/lib/db')).listStaffVaCredits(sid, options);
  },
  async voiceTimeline(sid) {
    return (await import('@/lib/db')).getVaTimeline(sid);
  },
  async characterSiblings(characterId) {
    return (await import('@/lib/db')).findCharacterSiblings(characterId);
  },
  async staffSiblings(sid) {
    return (await import('@/lib/db')).findStaffSiblings(sid);
  },
  async voiceActorsForCharacter(characterId) {
    return (await import('@/lib/db')).getVasForCharacter(characterId);
  },
  async searchCharacters(options) {
    return (await import('@/lib/db')).searchLocalCharacters(options);
  },
  async searchStaff(options) {
    return (await import('@/lib/db')).searchLocalStaff(options);
  },
  async characterImage(characterId) {
    return (await import('@/lib/db')).getCharacterImage(characterId);
  },
  async characterImages(characterIds) {
    return (await import('@/lib/db')).getCharacterImages([...characterIds]);
  },
  async upsertCharacterImage(characterId, url, localPath) {
    (await import('@/lib/db')).upsertCharacterImage(characterId, url, localPath);
  },
  async characterIdsForVn(vnId) {
    const { db } = await import('@/lib/db');
    const rows = db.prepare(`
      SELECT character_id FROM character_vn_index
      WHERE vn_id = ?
      ORDER BY character_id COLLATE NOCASE
    `).all(vnId) as Array<{ character_id: string }>;
    return rows.map((row) => row.character_id);
  },
  async voiceCharacterIdsForVn(vnId) {
    const { db } = await import('@/lib/db');
    const rows = db.prepare(`
      SELECT DISTINCT c_id FROM vn_va_credit
      WHERE vn_id = ?
      ORDER BY c_id COLLATE NOCASE
    `).all(vnId) as Array<{ c_id: string }>;
    return rows.map((row) => row.c_id);
  },
  async persistCharacterFullCache(input) {
    const { db } = await import('@/lib/db');
    db.transaction(() => {
      db.prepare(`
        INSERT INTO vndb_cache (
          cache_key, body, etag, last_modified, fetched_at, expires_at
        ) VALUES (?, ?, NULL, NULL, ?, ?)
        ON CONFLICT(cache_key) DO UPDATE SET
          body = excluded.body,
          fetched_at = excluded.fetched_at,
          expires_at = excluded.expires_at
      `).run(
        `char_full:${input.characterId.toLowerCase()}`,
        input.body,
        input.fetchedAt,
        input.expiresAt,
      );
      db.prepare('DELETE FROM character_vn_index WHERE character_id = ?').run(input.characterId);
      const insert = db.prepare(`
        INSERT OR IGNORE INTO character_vn_index (character_id, vn_id) VALUES (?, ?)
      `);
      for (const vnId of new Set(input.vnIds)) insert.run(input.characterId, vnId);
    })();
  },
};

let postgresRepository: PeopleRepository | null = null;

/** Return the people repository selected by the configured backend. */
export function getPeopleRepository(): PeopleRepository {
  if (readDatabaseConfig().backend !== 'postgres') return sqliteRepository;
  postgresRepository ??= createPostgresPeopleRepository();
  return postgresRepository;
}
