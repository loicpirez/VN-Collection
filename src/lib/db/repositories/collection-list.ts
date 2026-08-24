import type { PoolClient, QueryResultRow } from 'pg';
import { aspectKeyForResolution, isAspectKey, parseResolutionValue, type AspectKey } from '@/lib/aspect-ratio';
import type { CollectionTagAggregate, ListOptions } from '@/lib/db';
import type { CollectionCardItem, CollectionItem, EgsLite, SeriesLite, Stats, Status } from '@/lib/types';
import { readDatabaseConfig } from '../postgres-config';
import { postgresQuery, withPostgresTransaction, type PostgresParameter } from '../postgres';
import { postgresContainsPattern } from '../postgres-search';
import {
  mapCollectionItemRow,
  type CollectionItemDatabaseRow,
} from '../collection-item-mapper';

/** Asynchronous persistence contract for collection listings and facets. */
export interface CollectionListRepository {
  /** Return fully enriched collection items matching the supplied options. */
  list(options?: ListOptions): Promise<CollectionItem[]>;
  /** Return the lightweight card projection matching the supplied options. */
  listCards(options?: ListOptions): Promise<CollectionCardItem[]>;
  /** Return personal-list membership counts keyed by VN id. */
  listMembershipCounts(): Promise<Map<string, number>>;
  /** Return every VN id currently in the reading queue. */
  readingQueueIds(): Promise<Set<string>>;
  /** Return collection-only tag facets. */
  listTags(): Promise<CollectionTagAggregate[]>;
  /** Return live collection counters used by the library response. */
  stats(): Promise<Stats>;
  /** Return lightweight EGS summaries keyed by VN id. */
  egsSummaries(vnIds: readonly string[]): Promise<Map<string, EgsLite>>;
  /** Materialize cached release/screenshot aspect signals for filter accuracy. */
  prepareAspectData(vnIds: readonly string[]): Promise<void>;
}

interface Bindable {
  readonly values: PostgresParameter[];
  add(value: PostgresParameter): string;
}

class Bindings implements Bindable {
  readonly values: PostgresParameter[] = [];

  add(value: PostgresParameter): string {
    this.values.push(value);
    return `$${this.values.length}`;
  }
}

interface EgsRow extends QueryResultRow {
  vn_id: string;
  egs_id: number | null;
  median: number | null;
  average: number | null;
  count: number | null;
  playtime_median_minutes: number | null;
  source: EgsLite['source'];
  okazu: number | null;
  erogame: number | null;
}

interface AspectRow extends QueryResultRow {
  vn_id: string;
  aspect_key: string | null;
}

interface ScreenshotRow extends QueryResultRow {
  id: string;
  screenshots: string;
}

const CARD_VN_COLUMNS =
  'v.id, v.title, v.alttitle, v.image_url, v.image_thumb, v.image_sexual, ' +
  'v.released, v.length_minutes, v.rating, v.developers, v.publishers, ' +
  'v.tags, v.relations, v.local_image, v.local_image_thumb, v.custom_cover, ' +
  'v.banner_image, v.banner_position, v.cover_rotation, v.banner_rotation, v.fetched_at';

const FULL_NO_RAW_VN_COLUMNS =
  'v.id, v.title, v.alttitle, v.image_url, v.image_thumb, v.image_sexual, ' +
  'v.image_violence, v.released, v.olang, v.languages, v.platforms, ' +
  'v.length_minutes, v.length, v.rating, v.votecount, v.description, ' +
  'v.developers, v.publishers, v.tags, v.screenshots, v.release_images, ' +
  'v.local_image, v.local_image_thumb, v.custom_cover, v.banner_image, ' +
  'v.banner_position, v.cover_rotation, v.banner_rotation, v.relations, ' +
  'v.aliases, v.extlinks, v.length_votes, v.average, v.has_anime, ' +
  'v.devstatus, v.titles, v.editions, v.staff, v.va, v.fetched_at';

function sortExpression(sort: NonNullable<ListOptions['sort']>): string {
  const expressions: Record<NonNullable<ListOptions['sort']>, string> = {
    updated_at: 'c.updated_at',
    added_at: 'c.added_at',
    title: 'app_search_normalize(v.title) COLLATE "C"',
    rating: 'v.rating',
    user_rating: 'c.user_rating',
    playtime: 'NULLIF(c.playtime_minutes, 0)',
    length_minutes: 'v.length_minutes',
    egs_playtime: 'e.playtime_median_minutes',
    combined_playtime:
      '(COALESCE(v.length_minutes, 0) + COALESCE(e.playtime_median_minutes, 0) + COALESCE(NULLIF(c.playtime_minutes, 0), 0)) ' +
      '/ NULLIF((CASE WHEN v.length_minutes IS NULL OR v.length_minutes = 0 THEN 0 ELSE 1 END) + ' +
      '(CASE WHEN e.playtime_median_minutes IS NULL OR e.playtime_median_minutes = 0 THEN 0 ELSE 1 END) + ' +
      '(CASE WHEN c.playtime_minutes IS NULL OR c.playtime_minutes = 0 THEN 0 ELSE 1 END), 0)',
    released: 'v.released',
    producer: 'app_search_normalize(developer_sort.name) COLLATE "C"',
    publisher: 'app_search_normalize(publisher_sort.name) COLLATE "C"',
    egs_rating: 'e.median',
    combined_rating:
      'CASE WHEN v.rating IS NULL AND e.median IS NULL THEN NULL ' +
      'WHEN v.rating IS NULL THEN e.median WHEN e.median IS NULL THEN v.rating ' +
      'ELSE (v.rating + e.median) / 2.0 END',
    custom: 'c.custom_order',
  };
  return expressions[sort];
}

function needsEgs(options: ListOptions): boolean {
  return options.sort === 'egs_rating' ||
    options.sort === 'combined_rating' ||
    options.sort === 'egs_playtime' ||
    options.sort === 'combined_playtime' ||
    typeof options.ratingMin === 'number' ||
    typeof options.ratingMax === 'number' ||
    typeof options.playtimeMinHours === 'number' ||
    typeof options.playtimeMaxHours === 'number' ||
    typeof options.matchEgs === 'boolean' ||
    typeof options.isNsfw === 'boolean' ||
    options.excludeNsfw === true;
}

function pushBooleanClause(
  where: string[],
  value: boolean | undefined,
  clause: string,
): void {
  if (typeof value === 'boolean') where.push(value ? `(${clause})` : `NOT (${clause})`);
}

function addAspectFilter(
  where: string[],
  bindings: Bindable,
  aspect: AspectKey | undefined,
  aspects: readonly AspectKey[] | undefined,
): void {
  const selected = new Set<AspectKey>();
  if (aspect) selected.add(aspect);
  for (const value of aspects ?? []) selected.add(value);
  const wantUnknown = selected.delete('unknown');
  const known = [...selected];
  const branches: string[] = [];
  if (known.length > 0) {
    const values = bindings.add(known);
    branches.push(`(
      EXISTS (
        SELECT 1 FROM vn_aspect_override vo
        WHERE vo.vn_id = c.vn_id AND vo.aspect_key = ANY(${values}::text[])
      ) OR (
        NOT EXISTS (
          SELECT 1 FROM vn_aspect_override vo
          WHERE vo.vn_id = c.vn_id AND vo.aspect_key <> 'unknown'
        ) AND (
          EXISTS (
            SELECT 1 FROM owned_release owned
            LEFT JOIN owned_release_aspect_override aspect_override
              ON aspect_override.vn_id = owned.vn_id AND aspect_override.release_id = owned.release_id
            LEFT JOIN release_resolution_cache resolution
              ON resolution.release_id = owned.release_id
            WHERE owned.vn_id = c.vn_id
              AND COALESCE(aspect_override.aspect_key, resolution.aspect_key) = ANY(${values}::text[])
          ) OR EXISTS (
            SELECT 1 FROM release_resolution_cache resolution
            WHERE resolution.vn_id = c.vn_id AND resolution.aspect_key = ANY(${values}::text[])
          )
        )
      )
    )`);
  }
  if (wantUnknown) {
    branches.push(`(
      NOT EXISTS (
        SELECT 1 FROM vn_aspect_override vo
        WHERE vo.vn_id = c.vn_id AND vo.aspect_key <> 'unknown'
      ) AND NOT EXISTS (
        SELECT 1 FROM owned_release owned
        LEFT JOIN owned_release_aspect_override aspect_override
          ON aspect_override.vn_id = owned.vn_id AND aspect_override.release_id = owned.release_id
        LEFT JOIN release_resolution_cache resolution
          ON resolution.release_id = owned.release_id
        WHERE owned.vn_id = c.vn_id
          AND COALESCE(aspect_override.aspect_key, resolution.aspect_key) IS NOT NULL
          AND COALESCE(aspect_override.aspect_key, resolution.aspect_key) <> 'unknown'
      ) AND NOT EXISTS (
        SELECT 1 FROM release_resolution_cache resolution
        WHERE resolution.vn_id = c.vn_id AND resolution.aspect_key <> 'unknown'
      )
    )`);
  }
  if (branches.length > 0) where.push(`(${branches.join(' OR ')})`);
}

function buildCollectionQuery(options: ListOptions): { text: string; values: PostgresParameter[] } | null {
  if (options.vnIds && options.vnIds.length === 0) return null;
  const bindings = new Bindings();
  const where: string[] = [];
  const sort = options.sort ?? 'updated_at';
  const direction = options.order === 'asc' ? 'ASC' : 'DESC';
  if (options.status) where.push(`c.status = ${bindings.add(options.status)}`);
  if (options.q) {
    const pattern = bindings.add(postgresContainsPattern(options.q));
    where.push(`(app_search_normalize(v.title) LIKE ${pattern} ESCAPE '\\' OR app_search_normalize(v.alttitle) LIKE ${pattern} ESCAPE '\\')`);
  }
  if (options.producer) where.push(`EXISTS (SELECT 1 FROM vn_developer_index WHERE vn_id = c.vn_id AND producer_id = ${bindings.add(options.producer)})`);
  if (options.publisher) where.push(`EXISTS (SELECT 1 FROM vn_publisher_index WHERE vn_id = c.vn_id AND producer_id = ${bindings.add(options.publisher)})`);
  if (options.tag) where.push(`EXISTS (SELECT 1 FROM vn_tag_index WHERE vn_id = c.vn_id AND tag_id = ${bindings.add(options.tag)})`);
  if (options.place) where.push(`EXISTS (SELECT 1 FROM collection_place_index WHERE vn_id = c.vn_id AND place = ${bindings.add(options.place)})`);
  if (options.edition) where.push(`c.edition_type = ${bindings.add(options.edition)}`);
  if (typeof options.yearMin === 'number') where.push(`SUBSTRING(v.released FROM 1 FOR 4) >= ${bindings.add(String(options.yearMin))}`);
  if (typeof options.yearMax === 'number') where.push(`SUBSTRING(v.released FROM 1 FOR 4) <= ${bindings.add(String(options.yearMax))}`);

  const score = `ROUND((COALESCE(c.user_rating, 0) + COALESCE(v.rating, 0) + COALESCE(e.median, 0)) /
    NULLIF((CASE WHEN c.user_rating IS NULL THEN 0 ELSE 1 END) +
      (CASE WHEN v.rating IS NULL THEN 0 ELSE 1 END) +
      (CASE WHEN e.median IS NULL THEN 0 ELSE 1 END), 0))`;
  if (typeof options.ratingMin === 'number') where.push(`${score} >= ${bindings.add(options.ratingMin)}`);
  if (typeof options.ratingMax === 'number') where.push(`${score} <= ${bindings.add(options.ratingMax)}`);
  const hours = `ROUND(COALESCE(NULLIF(c.playtime_minutes, 0), NULLIF(e.playtime_median_minutes, 0), NULLIF(v.length_minutes, 0)) / 60.0)`;
  if (typeof options.playtimeMinHours === 'number') where.push(`${hours} >= ${bindings.add(options.playtimeMinHours)}`);
  if (typeof options.playtimeMaxHours === 'number') where.push(`${hours} <= ${bindings.add(options.playtimeMaxHours)}`);
  if (typeof options.dumped === 'boolean') where.push(`c.dumped = ${bindings.add(options.dumped ? 1 : 0)}`);

  pushBooleanClause(where, options.onlyEgsOnly, "SUBSTRING(v.id FROM 1 FOR 4) = 'egs_'");
  pushBooleanClause(where, options.matchVndb, "SUBSTRING(v.id FROM 1 FOR 4) <> 'egs_'");
  pushBooleanClause(where, options.matchEgs, 'e.vn_id IS NOT NULL');
  pushBooleanClause(where, options.fanDisc, `EXISTS (
    SELECT 1 FROM vn_relation_index relation
    WHERE relation.vn_id = v.id AND relation.relation = 'orig'
  )`);
  pushBooleanClause(where, options.hasNotes, "NULLIF(TRIM(c.notes), '') IS NOT NULL");
  pushBooleanClause(where, options.hasCustomCover, "NULLIF(TRIM(v.custom_cover), '') IS NOT NULL");
  pushBooleanClause(where, options.hasBanner, "NULLIF(TRIM(v.banner_image), '') IS NOT NULL");
  pushBooleanClause(where, options.isFavorite, 'c.favorite = 1');
  pushBooleanClause(where, options.hasReleased, "NULLIF(TRIM(v.released), '') IS NOT NULL");
  if (options.excludeNsfw || typeof options.isNsfw === 'boolean') {
    const threshold = bindings.add(options.nsfwThreshold ?? 1);
    const adult = `(
      COALESCE(v.image_sexual, 0) >= ${threshold}
      OR COALESCE(e.erogame, 0) = 1
      OR COALESCE(e.okazu, 0) = 1
      OR EXISTS (
        SELECT 1 FROM vn_tag_index adult_tag
        WHERE adult_tag.vn_id = v.id AND adult_tag.category = 'ero'
      )
    )`;
    if (options.excludeNsfw) where.push(`NOT ${adult}`);
    pushBooleanClause(where, options.isNsfw, adult);
  }
  pushBooleanClause(where, options.isNukige, `EXISTS (
    SELECT 1 FROM vn_tag_index nukige_tag
    WHERE nukige_tag.vn_id = v.id AND app_search_normalize(nukige_tag.tag_name) = 'nukige'
  )`);
  pushBooleanClause(where, options.inReadingQueue, 'EXISTS (SELECT 1 FROM reading_queue queue WHERE queue.vn_id = v.id)');
  pushBooleanClause(where, options.inList, 'EXISTS (SELECT 1 FROM user_list_vn membership WHERE membership.vn_id = v.id)');
  addAspectFilter(where, bindings, options.aspect, options.aspects);
  if (options.vnIds && options.vnIds.length > 0) where.push(`v.id = ANY(${bindings.add(options.vnIds)}::text[])`);

  let joins = '';
  if (options.series) {
    joins += ' JOIN series_vn selected_series ON selected_series.vn_id = v.id ';
    where.push(`selected_series.series_id = ${bindings.add(options.series)}`);
  }
  if (sort === 'producer') {
    joins += ` LEFT JOIN (
      SELECT developer_index.vn_id, MIN(producer.name) AS name
      FROM vn_developer_index developer_index
      LEFT JOIN producer ON producer.id = developer_index.producer_id
      GROUP BY developer_index.vn_id
    ) developer_sort ON developer_sort.vn_id = v.id `;
  }
  if (sort === 'publisher') {
    joins += ` LEFT JOIN (
      SELECT publisher_index.vn_id, MIN(producer.name) AS name
      FROM vn_publisher_index publisher_index
      LEFT JOIN producer ON producer.id = publisher_index.producer_id
      GROUP BY publisher_index.vn_id
    ) publisher_sort ON publisher_sort.vn_id = v.id `;
  }
  if (needsEgs(options)) joins += ' LEFT JOIN egs_game e ON e.vn_id = v.id ';

  const projection = options._projection === 'cards'
    ? CARD_VN_COLUMNS
    : options._projection === 'full-no-raw'
      ? FULL_NO_RAW_VN_COLUMNS
      : 'v.*';
  const safeLimit = Number.isFinite(options.limit) && (options.limit ?? 0) > 0
    ? Math.min(10_000, Math.floor(options.limit!))
    : 10_000;
  const safeOffset = Number.isFinite(options.offset) && (options.offset ?? 0) > 0
    ? Math.min(10_000_000, Math.floor(options.offset!))
    : 0;
  const limit = bindings.add(safeLimit);
  const offset = bindings.add(safeOffset);
  const orderBy = sort === 'custom'
    ? `CASE WHEN c.custom_order = 0 THEN 1 ELSE 0 END ASC, c.custom_order ${direction} NULLS LAST`
    : `${sortExpression(sort)} ${direction} NULLS LAST`;
  return {
    text: `
      SELECT ${projection}, c.status, c.user_rating, c.playtime_minutes, c.started_date,
        c.finished_date, c.notes, c.favorite, c.location, c.edition_type,
        c.edition_label, c.physical_location, c.box_type, c.download_url,
        c.dumped, c.dumped_ignored, c.custom_description, c.added_at, c.updated_at
      FROM collection c JOIN vn v ON v.id = c.vn_id
      ${joins}
      ${where.length > 0 ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY ${orderBy}, app_search_normalize(v.title) COLLATE "C", v.id
      LIMIT ${limit} OFFSET ${offset}
    `,
    values: bindings.values,
  };
}

async function enrichItems(items: CollectionItem[]): Promise<void> {
  if (items.length === 0) return;
  const ids = items.map((item) => item.id);
  const [seriesResult, egsResult, placeResult, manualResult, ownedResult, directResult] = await Promise.all([
    postgresQuery<{ vn_id: string; id: number; name: string } & QueryResultRow>(`
      SELECT series_vn.vn_id, series.id, series.name
      FROM series_vn JOIN series ON series.id = series_vn.series_id
      WHERE series_vn.vn_id = ANY($1::text[])
      ORDER BY series_vn.vn_id, series_vn.order_index, series.name, series.id
    `, [ids]),
    postgresQuery<EgsRow>(`
      SELECT vn_id, egs_id, median, average, count, playtime_median_minutes,
        source, okazu, erogame
      FROM egs_game WHERE vn_id = ANY($1::text[])
    `, [ids]),
    postgresQuery<{ vn_id: string; place: string } & QueryResultRow>(`
      SELECT vn_id, place FROM collection_place_index
      WHERE vn_id = ANY($1::text[]) ORDER BY vn_id, place
    `, [ids]),
    postgresQuery<AspectRow>(`
      SELECT vn_id, aspect_key FROM vn_aspect_override
      WHERE vn_id = ANY($1::text[]) AND aspect_key <> 'unknown'
    `, [ids]),
    postgresQuery<AspectRow>(`
      SELECT owned.vn_id, COALESCE(aspect_override.aspect_key, resolution.aspect_key) AS aspect_key
      FROM owned_release owned
      LEFT JOIN owned_release_aspect_override aspect_override
        ON aspect_override.vn_id = owned.vn_id AND aspect_override.release_id = owned.release_id
      LEFT JOIN release_resolution_cache resolution ON resolution.release_id = owned.release_id
      WHERE owned.vn_id = ANY($1::text[])
    `, [ids]),
    postgresQuery<AspectRow>(`
      SELECT vn_id, aspect_key FROM release_resolution_cache
      WHERE vn_id = ANY($1::text[])
    `, [ids]),
  ]);
  const series = new Map<string, SeriesLite[]>();
  for (const row of seriesResult.rows) {
    const values = series.get(row.vn_id) ?? [];
    values.push({ id: row.id, name: row.name });
    series.set(row.vn_id, values);
  }
  const egs = new Map(egsResult.rows.map((row) => [row.vn_id, row]));
  const places = new Map<string, string[]>();
  for (const row of placeResult.rows) {
    const values = places.get(row.vn_id) ?? [];
    values.push(row.place);
    places.set(row.vn_id, values);
  }
  const manual = new Map<string, AspectKey>();
  for (const row of manualResult.rows) {
    if (isAspectKey(row.aspect_key) && row.aspect_key !== 'unknown') manual.set(row.vn_id, row.aspect_key);
  }
  const aspectSets = new Map<string, Set<AspectKey>>();
  const addAspect = (row: AspectRow): void => {
    if (manual.has(row.vn_id) || !isAspectKey(row.aspect_key) || row.aspect_key === 'unknown') return;
    const values = aspectSets.get(row.vn_id) ?? new Set<AspectKey>();
    values.add(row.aspect_key);
    aspectSets.set(row.vn_id, values);
  };
  ownedResult.rows.forEach(addAspect);
  directResult.rows.forEach(addAspect);
  for (const item of items) {
    item.series = series.get(item.id) ?? [];
    item.physical_location = places.get(item.id) ?? item.physical_location ?? [];
    item.aspect_keys = manual.has(item.id)
      ? [manual.get(item.id)!]
      : [...(aspectSets.get(item.id) ?? new Set<AspectKey>())];
    if (item.aspect_keys.length === 0) item.aspect_keys = ['unknown'];
    const summary = egs.get(item.id);
    item.egs = summary ? {
      egs_id: summary.egs_id,
      median: summary.median,
      average: summary.average,
      count: summary.count,
      playtime_median_minutes: summary.playtime_median_minutes,
      source: summary.source,
      okazu: summary.okazu == null ? null : Boolean(summary.okazu),
      erogame: summary.erogame == null ? null : Boolean(summary.erogame),
    } : null;
  }
}

async function listPostgres(options: ListOptions = {}): Promise<CollectionItem[]> {
  const query = buildCollectionQuery(options);
  if (!query) return [];
  const result = await postgresQuery<CollectionItemDatabaseRow & QueryResultRow>(query.text, query.values);
  const items = result.rows.flatMap((row) => {
    const item = mapCollectionItemRow(row);
    return item ? [item] : [];
  });
  await enrichItems(items);
  return items;
}

function cardProjection(item: CollectionItem): CollectionCardItem {
  const {
    image_violence: _imageViolence,
    olang: _olang,
    languages: _languages,
    platforms: _platforms,
    length: _length,
    votecount: _votecount,
    description: _description,
    screenshots: _screenshots,
    release_images: _releaseImages,
    aliases: _aliases,
    extlinks: _extlinks,
    length_votes: _lengthVotes,
    average: _average,
    has_anime: _hasAnime,
    devstatus: _devstatus,
    titles: _titles,
    editions: _editions,
    staff: _staff,
    va: _va,
    ...card
  } = item;
  return card;
}

async function hasAspectSignal(client: PoolClient, vnIds: readonly string[]): Promise<Set<string>> {
  const result = await client.query<{ vn_id: string } & QueryResultRow>(`
    SELECT v.id AS vn_id FROM vn v
    WHERE v.id = ANY($1::text[]) AND (
      EXISTS (SELECT 1 FROM vn_aspect_override manual WHERE manual.vn_id = v.id AND manual.aspect_key <> 'unknown')
      OR EXISTS (
        SELECT 1 FROM owned_release owned
        LEFT JOIN owned_release_aspect_override aspect_override
          ON aspect_override.vn_id = owned.vn_id AND aspect_override.release_id = owned.release_id
        LEFT JOIN release_resolution_cache resolution ON resolution.release_id = owned.release_id
        WHERE owned.vn_id = v.id
          AND COALESCE(aspect_override.aspect_key, resolution.aspect_key) IS NOT NULL
          AND COALESCE(aspect_override.aspect_key, resolution.aspect_key) <> 'unknown'
      )
      OR EXISTS (
        SELECT 1 FROM release_resolution_cache resolution
        WHERE resolution.vn_id = v.id AND resolution.aspect_key <> 'unknown'
      )
    )
  `, [vnIds]);
  return new Set(result.rows.map((row) => row.vn_id));
}

async function preparePostgresAspectData(vnIds: readonly string[]): Promise<void> {
  if (vnIds.length === 0) return;
  await withPostgresTransaction(async (client) => {
    const releaseRows = await client.query<{
      release_id: string;
      vn_id: string;
      resolution: string;
    } & QueryResultRow>(`
      SELECT release_id, vn_id, resolution FROM release_meta_cache
      WHERE vn_id = ANY($1::text[]) AND NULLIF(resolution, '') IS NOT NULL
    `, [vnIds]);
    const now = Date.now();
    for (const row of releaseRows.rows) {
      const parsed = parseResolutionValue(row.resolution);
      if (!parsed) continue;
      await client.query(`
        INSERT INTO release_resolution_cache (
          release_id, vn_id, width, height, raw_resolution, aspect_key, fetched_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT(release_id) DO UPDATE SET
          vn_id = COALESCE(EXCLUDED.vn_id, release_resolution_cache.vn_id),
          width = EXCLUDED.width,
          height = EXCLUDED.height,
          raw_resolution = EXCLUDED.raw_resolution,
          aspect_key = EXCLUDED.aspect_key,
          fetched_at = EXCLUDED.fetched_at
      `, [row.release_id, row.vn_id, parsed.width, parsed.height, row.resolution, aspectKeyForResolution(parsed.width, parsed.height), now]);
    }
    await client.query(`
      UPDATE owned_release owned SET owned_platform = release.platform
      FROM (
        SELECT release_id, MIN(platform) AS platform
        FROM release_platform_index
        GROUP BY release_id
        HAVING COUNT(*) = 1
      ) release
      WHERE owned.release_id = release.release_id
        AND owned.vn_id = ANY($1::text[])
        AND owned.owned_platform IS NULL
    `, [vnIds]);
    const signaled = await hasAspectSignal(client, vnIds);
    const missing = vnIds.filter((vnId) => !signaled.has(vnId));
    if (missing.length === 0) return;
    const screenshotRows = await client.query<ScreenshotRow>(`
      SELECT id, screenshots FROM vn
      WHERE id = ANY($1::text[]) AND NULLIF(screenshots, '') IS NOT NULL
    `, [missing]);
    for (const row of screenshotRows.rows) {
      let screenshots: unknown;
      try {
        screenshots = JSON.parse(row.screenshots);
      } catch {
        continue;
      }
      if (!Array.isArray(screenshots)) continue;
      const tally = new Map<AspectKey, number>();
      for (const screenshot of screenshots) {
        if (!screenshot || typeof screenshot !== 'object' || !('dims' in screenshot)) continue;
        const dims = (screenshot as { dims?: unknown }).dims;
        if (!Array.isArray(dims) || dims.length < 2) continue;
        const [width, height] = dims;
        if (typeof width !== 'number' || typeof height !== 'number') continue;
        const key = aspectKeyForResolution(width, height);
        if (key === 'unknown') continue;
        tally.set(key, (tally.get(key) ?? 0) + 1);
      }
      let best: AspectKey | null = null;
      let count = 0;
      for (const [key, occurrences] of tally) {
        if (occurrences > count) {
          best = key;
          count = occurrences;
        }
      }
      if (!best) continue;
      await client.query(`
        INSERT INTO release_resolution_cache (
          release_id, vn_id, width, height, raw_resolution, aspect_key, fetched_at
        ) VALUES ($1, $2, NULL, NULL, NULL, $3, $4)
        ON CONFLICT(release_id) DO UPDATE SET
          vn_id = EXCLUDED.vn_id,
          aspect_key = EXCLUDED.aspect_key,
          fetched_at = EXCLUDED.fetched_at
      `, [`screenshot:${row.id}`, row.id, best, now]);
    }
  });
}

/** Create the PostgreSQL-backed collection-list repository. */
export function createPostgresCollectionListRepository(): CollectionListRepository {
  return {
    list: listPostgres,
    async listCards(options = {}) {
      return (await listPostgres({ ...options, _projection: 'cards' })).map(cardProjection);
    },
    async listMembershipCounts() {
      const result = await postgresQuery<{ vn_id: string; count: number } & QueryResultRow>(`
        SELECT vn_id, COUNT(*) AS count FROM user_list_vn GROUP BY vn_id
      `);
      return new Map(result.rows.map((row) => [row.vn_id, row.count]));
    },
    async readingQueueIds() {
      const result = await postgresQuery<{ vn_id: string } & QueryResultRow>('SELECT vn_id FROM reading_queue');
      return new Set(result.rows.map((row) => row.vn_id));
    },
    async listTags() {
      const result = await postgresQuery<{
        tag_id: string;
        tag_name: string;
        tag_category: string | null;
        tag_count: number;
      } & QueryResultRow>(`
        SELECT tag_index.tag_id,
          COALESCE(MAX(tag_index.tag_name), tag_index.tag_id) AS tag_name,
          MAX(tag_index.category) AS tag_category,
          COUNT(*) AS tag_count
        FROM collection JOIN vn_tag_index tag_index ON tag_index.vn_id = collection.vn_id
        WHERE tag_index.spoiler = 0
        GROUP BY tag_index.tag_id
        ORDER BY tag_count DESC, app_search_normalize(COALESCE(MAX(tag_index.tag_name), tag_index.tag_id)) COLLATE "C"
        LIMIT 500
      `);
      return result.rows.map((row) => ({
        id: row.tag_id,
        name: row.tag_name,
        category: row.tag_category,
        count: row.tag_count,
      }));
    },
    async stats() {
      const [total, statuses, playtime] = await Promise.all([
        postgresQuery<{ count: number } & QueryResultRow>('SELECT COUNT(*) AS count FROM collection'),
        postgresQuery<{ status: Status; count: number } & QueryResultRow>(`
          SELECT status, COUNT(*) AS count FROM collection GROUP BY status ORDER BY status
        `),
        postgresQuery<{ minutes: number } & QueryResultRow>(`
          SELECT COALESCE(SUM(playtime_minutes), 0)::BIGINT AS minutes FROM collection
        `),
      ]);
      return {
        total: total.rows[0]?.count ?? 0,
        byStatus: statuses.rows.map((row) => ({ status: row.status, n: row.count })),
        playtime_minutes: playtime.rows[0]?.minutes ?? 0,
      };
    },
    async egsSummaries(vnIds) {
      if (vnIds.length === 0) return new Map();
      const result = await postgresQuery<EgsRow>(`
        SELECT vn_id, egs_id, median, average, count, playtime_median_minutes,
          source, okazu, erogame
        FROM egs_game WHERE vn_id = ANY($1::text[])
      `, [vnIds]);
      return new Map(result.rows.map((row) => [row.vn_id, {
        egs_id: row.egs_id,
        median: row.median,
        average: row.average,
        count: row.count,
        playtime_median_minutes: row.playtime_median_minutes,
        source: row.source,
        okazu: row.okazu == null ? null : Boolean(row.okazu),
        erogame: row.erogame == null ? null : Boolean(row.erogame),
      }]));
    },
    prepareAspectData: preparePostgresAspectData,
  };
}

const sqliteRepository: CollectionListRepository = {
  async list(options) {
    return (await import('@/lib/db')).listCollection(options);
  },
  async listCards(options) {
    return (await import('@/lib/db')).listCollectionForCards(options);
  },
  async listMembershipCounts() {
    return (await import('@/lib/db')).countListMembershipsByVn();
  },
  async readingQueueIds() {
    return (await import('@/lib/db')).getReadingQueueVnIds();
  },
  async listTags() {
    return (await import('@/lib/db')).listCollectionTags();
  },
  async stats() {
    return (await import('@/lib/db')).getStats();
  },
  async egsSummaries(vnIds) {
    const rows = (await import('@/lib/db')).getEgsSummariesForVns([...vnIds]);
    return new Map([...rows].map(([vnId, row]) => [vnId, {
      egs_id: row.egs_id,
      median: row.median,
      average: row.average,
      count: row.count,
      playtime_median_minutes: row.playtime_median_minutes,
      source: row.source,
      okazu: row.okazu == null ? null : Boolean(row.okazu),
      erogame: row.erogame == null ? null : Boolean(row.erogame),
    }]));
  },
  async prepareAspectData(vnIds) {
    const legacy = await import('@/lib/db');
    legacy.materializeReleaseAspectsForCollectionVns([...vnIds]);
    legacy.materializeReleaseMetaForCollectionVns([...vnIds]);
    legacy.materializeAspectForCollectionVns([...vnIds]);
  },
};

let postgresRepository: CollectionListRepository | null = null;

/** Return the collection-list repository selected by the configured backend. */
export function getCollectionListRepository(): CollectionListRepository {
  if (readDatabaseConfig().backend !== 'postgres') return sqliteRepository;
  postgresRepository ??= createPostgresCollectionListRepository();
  return postgresRepository;
}
