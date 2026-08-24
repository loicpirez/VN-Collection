import type { PoolClient } from 'pg';
import type { RawVnPayload } from '@/lib/db';
import { readDatabaseConfig } from '../postgres-config';
import { withPostgresTransaction, type PostgresParameter } from '../postgres';

interface StaffEntry {
  eid?: number | null;
  role?: string;
  note?: string | null;
  id?: string;
  aid?: number;
  name?: string;
  original?: string | null;
  lang?: string | null;
}

interface VaEntry {
  note?: string | null;
  character?: {
    id?: string;
    name?: string;
    original?: string | null;
    image?: { url?: string } | null;
  } | null;
  staff?: {
    id?: string;
    aid?: number;
    name?: string;
    original?: string | null;
    lang?: string | null;
  } | null;
}

type CompleteStaffEntry = StaffEntry & { id: string; name: string };
type CompleteVaEntry = VaEntry & {
  character: NonNullable<VaEntry['character']> & { id: string; name: string };
  staff: NonNullable<VaEntry['staff']> & { id: string; name: string };
};

function hasStaffIdentity(entry: StaffEntry): entry is CompleteStaffEntry {
  return Boolean(entry?.id && entry.name);
}

function hasVaIdentity(entry: VaEntry): entry is CompleteVaEntry {
  return Boolean(entry?.staff?.id && entry.character?.id && entry.character.name && entry.staff.name);
}

/** Asynchronous persistence contract for canonical VNDB VN payloads. */
export interface VnWriteRepository {
  /** Upsert one VN and rebuild all materialized indexes atomically. */
  upsert(vn: RawVnPayload): Promise<void>;
}

async function insertRows(
  client: PoolClient,
  table: string,
  columns: readonly string[],
  rows: readonly (readonly PostgresParameter[])[],
): Promise<void> {
  if (rows.length === 0) return;
  for (let offset = 0; offset < rows.length; offset += 250) {
    const batch = rows.slice(offset, offset + 250);
    const values: PostgresParameter[] = [];
    const tuples = batch.map((row) => {
      const start = values.length;
      values.push(...row);
      return `(${row.map((_value, index) => `$${start + index + 1}`).join(', ')})`;
    });
    await client.query(
      `INSERT INTO ${table} (${columns.join(', ')}) VALUES ${tuples.join(', ')} ON CONFLICT DO NOTHING`,
      values,
    );
  }
}

function serializedVnValues(vn: RawVnPayload, fetchedAt: number): PostgresParameter[] {
  return [
    vn.id,
    vn.title,
    vn.alttitle ?? null,
    vn.image?.url ?? null,
    vn.image?.thumbnail ?? null,
    vn.image?.sexual ?? null,
    vn.image?.violence ?? null,
    vn.released ?? null,
    vn.olang ?? null,
    vn.devstatus ?? null,
    JSON.stringify(vn.titles ?? []),
    JSON.stringify(vn.languages ?? []),
    JSON.stringify(vn.platforms ?? []),
    vn.length_minutes ?? null,
    vn.length ?? null,
    vn.length_votes ?? null,
    vn.rating ?? null,
    vn.votecount ?? null,
    vn.average ?? null,
    vn.description ?? null,
    JSON.stringify((vn.developers ?? []).map((developer) => ({ id: developer.id, name: developer.name }))),
    JSON.stringify((vn.tags ?? []).map((tag) => ({
      id: tag.id,
      name: tag.name,
      rating: tag.rating,
      spoiler: tag.spoiler,
      lie: Boolean(tag.lie),
      category: tag.category ?? null,
    }))),
    JSON.stringify(vn.screenshots ?? []),
    JSON.stringify((vn.relations ?? []).map((relation) => ({
      id: relation.id,
      title: relation.title,
      alttitle: relation.alttitle ?? null,
      released: relation.released ?? null,
      rating: relation.rating ?? null,
      votecount: relation.votecount ?? null,
      length_minutes: relation.length_minutes ?? null,
      languages: relation.languages ?? [],
      platforms: relation.platforms ?? [],
      developers: (relation.developers ?? []).map((developer) => ({ id: developer.id, name: developer.name })),
      image_url: relation.image?.url ?? null,
      image_thumb: relation.image?.thumbnail ?? null,
      image_sexual: relation.image?.sexual ?? null,
      relation: relation.relation,
      relation_official: Boolean(relation.relation_official),
    }))),
    JSON.stringify(vn.aliases ?? []),
    JSON.stringify(vn.extlinks ?? []),
    vn.has_anime == null ? null : vn.has_anime ? 1 : 0,
    JSON.stringify(vn.editions ?? []),
    JSON.stringify(vn.staff ?? []),
    JSON.stringify(vn.va ?? []),
    JSON.stringify(vn),
    fetchedAt,
  ];
}

async function rebuildCredits(client: PoolClient, vn: RawVnPayload): Promise<void> {
  await client.query('DELETE FROM vn_staff_credit WHERE vn_id = $1', [vn.id]);
  await client.query('DELETE FROM vn_va_credit WHERE vn_id = $1', [vn.id]);
  const staffRows = ((vn.staff as StaffEntry[] | undefined) ?? [])
    .filter(hasStaffIdentity)
    .map((entry) => [
      vn.id,
      entry.id,
      entry.aid ?? null,
      entry.eid ?? null,
      entry.role ?? '',
      entry.note ?? null,
      entry.name,
      entry.original ?? null,
      entry.lang ?? null,
    ] satisfies PostgresParameter[]);
  await insertRows(client, 'vn_staff_credit', ['vn_id', 'sid', 'aid', 'eid', 'role', 'note', 'name', 'original', 'lang'], staffRows);
  const vaRows = ((vn.va as VaEntry[] | undefined) ?? [])
    .filter(hasVaIdentity)
    .map((entry) => [
      vn.id,
      entry.staff.id,
      entry.staff.aid ?? null,
      entry.character.id,
      entry.character.name,
      entry.character.original ?? null,
      entry.character.image?.url ?? null,
      entry.staff.name,
      entry.staff.original ?? null,
      entry.staff.lang ?? null,
      entry.note ?? null,
    ] satisfies PostgresParameter[]);
  await insertRows(client, 'vn_va_credit', ['vn_id', 'sid', 'aid', 'c_id', 'c_name', 'c_original', 'c_image_url', 'va_name', 'va_original', 'va_lang', 'note'], vaRows);
}

async function rebuildIndexes(client: PoolClient, vn: RawVnPayload): Promise<void> {
  await client.query('DELETE FROM vn_tag_index WHERE vn_id = $1', [vn.id]);
  const tagRows = (vn.tags ?? []).filter((tag) => Boolean(tag.id)).map((tag) => [
    vn.id,
    tag.id,
    typeof tag.name === 'string' && tag.name.trim() ? tag.name : tag.id,
    typeof tag.spoiler === 'number' ? tag.spoiler : 0,
    typeof tag.category === 'string' ? tag.category : null,
  ] satisfies PostgresParameter[]);
  await insertRows(client, 'vn_tag_index', ['vn_id', 'tag_id', 'tag_name', 'spoiler', 'category'], tagRows);

  const developers = vn.developers ?? [];
  if (developers.length > 0) {
    await client.query('DELETE FROM vn_developer_index WHERE vn_id = $1', [vn.id]);
    const developerRows = developers.filter((developer) => Boolean(developer.id)).map((developer) => [vn.id, developer.id] satisfies PostgresParameter[]);
    await insertRows(client, 'vn_developer_index', ['vn_id', 'producer_id'], developerRows);
  }

  await client.query('DELETE FROM vn_language_index WHERE vn_id = $1', [vn.id]);
  const languageRows = (vn.languages ?? []).filter((language) => typeof language === 'string' && language.length > 0).map((language) => [vn.id, language] satisfies PostgresParameter[]);
  await insertRows(client, 'vn_language_index', ['vn_id', 'lang'], languageRows);

  await client.query('DELETE FROM vn_platform_index WHERE vn_id = $1', [vn.id]);
  const platformRows = (vn.platforms ?? []).filter((platform) => typeof platform === 'string' && platform.length > 0).map((platform) => [vn.id, platform] satisfies PostgresParameter[]);
  await insertRows(client, 'vn_platform_index', ['vn_id', 'platform'], platformRows);
}

/** Create the PostgreSQL-backed canonical VN writer. */
export function createPostgresVnWriteRepository(): VnWriteRepository {
  return {
    async upsert(vn) {
      const fetchedAt = Date.now();
      await withPostgresTransaction(async (client) => {
        const columns = [
          'id', 'title', 'alttitle', 'image_url', 'image_thumb', 'image_sexual', 'image_violence',
          'released', 'olang', 'devstatus', 'titles', 'languages', 'platforms', 'length_minutes', 'length',
          'length_votes', 'rating', 'votecount', 'average', 'description', 'developers', 'tags', 'screenshots',
          'relations', 'aliases', 'extlinks', 'has_anime', 'editions', 'staff', 'va', 'raw', 'fetched_at',
        ];
        const values = serializedVnValues(vn, fetchedAt);
        const placeholders = values.map((_value, index) => `$${index + 1}`);
        const upsertResult = await client.query(`
          INSERT INTO vn (${columns.join(', ')}) VALUES (${placeholders.join(', ')})
          ON CONFLICT(id) DO UPDATE SET
            title = EXCLUDED.title,
            alttitle = EXCLUDED.alttitle,
            image_url = EXCLUDED.image_url,
            image_thumb = EXCLUDED.image_thumb,
            image_sexual = EXCLUDED.image_sexual,
            image_violence = EXCLUDED.image_violence,
            released = EXCLUDED.released,
            olang = EXCLUDED.olang,
            devstatus = EXCLUDED.devstatus,
            titles = EXCLUDED.titles,
            languages = EXCLUDED.languages,
            platforms = EXCLUDED.platforms,
            length_minutes = EXCLUDED.length_minutes,
            length = EXCLUDED.length,
            length_votes = EXCLUDED.length_votes,
            rating = EXCLUDED.rating,
            votecount = EXCLUDED.votecount,
            average = EXCLUDED.average,
            description = EXCLUDED.description,
            developers = CASE WHEN EXCLUDED.developers IS NULL OR EXCLUDED.developers IN ('[]', '') THEN vn.developers ELSE EXCLUDED.developers END,
            tags = EXCLUDED.tags,
            screenshots = EXCLUDED.screenshots,
            relations = EXCLUDED.relations,
            aliases = EXCLUDED.aliases,
            extlinks = EXCLUDED.extlinks,
            has_anime = EXCLUDED.has_anime,
            editions = EXCLUDED.editions,
            staff = EXCLUDED.staff,
            va = EXCLUDED.va,
            raw = EXCLUDED.raw,
            fetched_at = EXCLUDED.fetched_at
          WHERE EXCLUDED.fetched_at >= vn.fetched_at
        `, values);
        if ((upsertResult.rowCount ?? 0) === 0) return;
        await rebuildCredits(client, vn);
        await rebuildIndexes(client, vn);
      });
    },
  };
}

const sqliteRepository: VnWriteRepository = {
  async upsert(vn) {
    (await import('@/lib/db')).upsertVn(vn);
  },
};

let postgresRepository: VnWriteRepository | null = null;

/** Return the configured canonical VN writer. */
export function getVnWriteRepository(): VnWriteRepository {
  if (readDatabaseConfig().backend !== 'postgres') return sqliteRepository;
  postgresRepository ??= createPostgresVnWriteRepository();
  return postgresRepository;
}
