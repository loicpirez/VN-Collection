import type { QueryResultRow } from 'pg';
import { readDatabaseConfig } from '../postgres-config';
import { postgresQuery, type PostgresParameter } from '../postgres';

/** Character voiced by one shared seiyuu in one compared VN. */
export interface SharedVaCharacterCredit {
  c_id: string;
  c_name: string;
}

/** Per-VN character list for one shared seiyuu. */
export interface SharedVaVnCredit {
  vn_id: string;
  characters: SharedVaCharacterCredit[];
}

/** Voice actor credited on every compared VN. */
export interface SharedVa {
  sid: string;
  va_name: string;
  va_original: string | null;
  creditsByVn: SharedVaVnCredit[];
  totalCharacters: number;
}

/** Character appearing in every compared VN. */
export interface SharedCharacter {
  c_id: string;
  c_name: string;
  per_vn: Array<{ vn_id: string; va_name: string }>;
}

interface VoiceCreditRow extends QueryResultRow {
  vn_id: string;
  sid: string;
  va_name: string;
  va_original: string | null;
  c_id: string;
  c_name: string;
}

type CompareQuery = <Row extends QueryResultRow>(
  text: string,
  values?: readonly PostgresParameter[],
) => Promise<{ rows: Row[] }>;

/** Asynchronous compare-credit contract shared by SQLite and PostgreSQL. */
export interface CompareRepository {
  /** Find voice actors credited on every supplied VN. */
  findSharedVas(vnIds: readonly string[]): Promise<SharedVa[]>;
  /** Find characters credited on every supplied VN. */
  findSharedCharacters(vnIds: readonly string[]): Promise<SharedCharacter[]>;
}

function uniqueIds(vnIds: readonly string[]): string[] {
  return Array.from(new Set(vnIds));
}

function groupSharedVas(ids: readonly string[], rows: readonly VoiceCreditRow[]): SharedVa[] {
  const bySid = new Map<string, {
    va_name: string;
    va_original: string | null;
    vnIds: Set<string>;
    byVn: Map<string, Map<string, SharedVaCharacterCredit>>;
  }>();
  for (const row of rows) {
    let bucket = bySid.get(row.sid);
    if (!bucket) {
      bucket = {
        va_name: row.va_name,
        va_original: row.va_original,
        vnIds: new Set(),
        byVn: new Map(),
      };
      bySid.set(row.sid, bucket);
    }
    bucket.vnIds.add(row.vn_id);
    let characters = bucket.byVn.get(row.vn_id);
    if (!characters) {
      characters = new Map();
      bucket.byVn.set(row.vn_id, characters);
    }
    characters.set(row.c_id, { c_id: row.c_id, c_name: row.c_name });
  }
  return Array.from(bySid.entries())
    .filter(([, bucket]) => bucket.vnIds.size === ids.length)
    .map(([sid, bucket]) => {
      const creditsByVn = ids.map((vn_id) => ({
        vn_id,
        characters: Array.from(bucket.byVn.get(vn_id)?.values() ?? []),
      }));
      return {
        sid,
        va_name: bucket.va_name,
        va_original: bucket.va_original,
        creditsByVn,
        totalCharacters: creditsByVn.reduce((sum, credit) => sum + credit.characters.length, 0),
      };
    })
    .sort((left, right) => right.totalCharacters - left.totalCharacters || left.va_name.localeCompare(right.va_name));
}

function groupSharedCharacters(ids: readonly string[], rows: readonly VoiceCreditRow[]): SharedCharacter[] {
  const byCharacter = new Map<string, {
    vnIds: Set<string>;
    name: string;
    perVn: Map<string, string>;
  }>();
  for (const row of rows) {
    let bucket = byCharacter.get(row.c_id);
    if (!bucket) {
      bucket = { vnIds: new Set(), name: row.c_name, perVn: new Map() };
      byCharacter.set(row.c_id, bucket);
    }
    bucket.vnIds.add(row.vn_id);
    if (!bucket.perVn.has(row.vn_id)) bucket.perVn.set(row.vn_id, row.va_name);
  }
  return Array.from(byCharacter.entries())
    .filter(([, bucket]) => bucket.vnIds.size === ids.length)
    .map(([c_id, bucket]) => ({
      c_id,
      c_name: bucket.name,
      per_vn: ids.map((vn_id) => ({ vn_id, va_name: bucket.perVn.get(vn_id) ?? '' })),
    }));
}

function createRepository(
  loadRows: (ids: readonly string[]) => Promise<VoiceCreditRow[]>,
): CompareRepository {
  const rowsFor = async (vnIds: readonly string[]): Promise<{ ids: string[]; rows: VoiceCreditRow[] } | null> => {
    const ids = uniqueIds(vnIds);
    if (ids.length < 2) return null;
    return { ids, rows: await loadRows(ids) };
  };
  return {
    async findSharedVas(vnIds) {
      const loaded = await rowsFor(vnIds);
      return loaded ? groupSharedVas(loaded.ids, loaded.rows) : [];
    },
    async findSharedCharacters(vnIds) {
      const loaded = await rowsFor(vnIds);
      return loaded ? groupSharedCharacters(loaded.ids, loaded.rows) : [];
    },
  };
}

/**
 * Create the PostgreSQL-backed compare repository.
 *
 * @param query Parameterized query executor, injectable for isolated contracts.
 * @returns A compare-credit repository.
 */
export function createPostgresCompareRepository(query: CompareQuery = postgresQuery): CompareRepository {
  return createRepository(async (ids) => (
    await query<VoiceCreditRow>(`
      SELECT vn_id, sid, va_name, va_original, c_id, c_name
      FROM vn_va_credit
      WHERE vn_id = ANY($1::text[])
      ORDER BY vn_id, sid, c_id, COALESCE(aid, -1), COALESCE(note, '')
    `, [ids])
  ).rows);
}

const sqliteRepository = createRepository(async (ids) => {
  const placeholders = ids.map(() => '?').join(',');
  return (await import('@/lib/db')).db.prepare(`
    SELECT vn_id, sid, va_name, va_original, c_id, c_name
    FROM vn_va_credit
    WHERE vn_id IN (${placeholders})
    ORDER BY vn_id, sid, c_id, COALESCE(aid, -1), COALESCE(note, '')
  `).all(...ids) as VoiceCreditRow[];
});

let postgresRepository: CompareRepository | null = null;

/** Return the compare repository for the configured database backend. */
export function getCompareRepository(): CompareRepository {
  if (readDatabaseConfig().backend !== 'postgres') return sqliteRepository;
  postgresRepository ??= createPostgresCompareRepository();
  return postgresRepository;
}
