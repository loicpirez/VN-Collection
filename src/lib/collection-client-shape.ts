import { isAspectKey, type AspectKey } from './aspect-ratio';
import { asJsonRecord } from './json-shape';
import {
  EDITION_TYPES,
  STATUSES,
  type CollectionCardApiItem,
  type EditionType,
  type EgsLite,
  type Stats,
  type Status,
  type VnRelation,
} from './types';
import { isValidVnId, normalizeVnId } from './vn-id-shape';

const MAX_PAGE_ITEMS = 500;
const MAX_NESTED_ITEMS = 5_000;

/** Pagination metadata returned by the collection listing endpoint. */
export interface CollectionPage {
  page: number;
  page_size: number;
  returned: number;
  has_more: boolean;
}

/** Validated collection page with a caller-selected row projection. */
export interface CollectionPageResult<T> {
  items: T[];
  pagination: CollectionPage;
}

/** Collection row needed by the bulk asset downloader. */
export interface CollectionBulkRow {
  id: string;
  title: string;
}

/** Collection row needed by the compare picker. */
export interface CollectionCompareRow extends CollectionBulkRow {
  alttitle: string | null;
  released: string | null;
}

/** Collection row needed by the selective full-download picker. */
export interface CollectionSelectiveRow extends CollectionCompareRow {
  status: string | null;
  rating: number | null;
  user_rating: number | null;
  playtime_minutes: number | null;
  added_at: number | null;
  updated_at: number | null;
  full_downloaded?: boolean;
}

/** Compact developer or publisher facet rendered by the library drawer. */
export interface LibraryProducerFacet {
  id: string;
  name: string;
  vn_count: number;
}

/** Compact series facet rendered by the library drawer. */
export interface LibrarySeriesFacet {
  id: number;
  name: string;
}

/** Compact tag facet rendered by the library drawer. */
export interface LibraryTagFacet {
  id: string;
  name: string;
  vn_count: number;
}

/** Durable library defaults loaded from the settings endpoint. */
export interface LibraryDefaults {
  default_sort: string;
  default_order: 'asc' | 'desc';
  default_group: string;
}

function isString(value: unknown): value is string {
  return typeof value === 'string';
}

function isNullableString(value: unknown): value is string | null {
  return value === null || isString(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isNullableFiniteNumber(value: unknown): value is number | null {
  return value === null || isFiniteNumber(value);
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function decodeArray<T>(value: unknown, decode: (row: unknown) => T | null): T[] | null {
  if (!Array.isArray(value) || value.length > MAX_NESTED_ITEMS) return null;
  const rows: T[] = [];
  for (const row of value) {
    const decoded = decode(row);
    if (!decoded) return null;
    rows.push(decoded);
  }
  return rows;
}

function decodeStringArray(value: unknown): string[] | null {
  return decodeArray(value, (row) => (isString(row) ? row : null));
}

function decodeProducer(value: unknown): { id: string; name: string } | null {
  const row = asJsonRecord(value);
  if (!row || !isString(row.id) || !/^p\d+$/i.test(row.id) || !isString(row.name)) return null;
  return { id: row.id.toLowerCase(), name: row.name };
}

function decodeTag(value: unknown): CollectionCardApiItem['tags'][number] | null {
  const row = asJsonRecord(value);
  if (
    !row ||
    !isString(row.id) ||
    !/^g\d+$/i.test(row.id) ||
    !isString(row.name) ||
    !isFiniteNumber(row.rating) ||
    !isFiniteNumber(row.spoiler) ||
    !(row.lie === undefined || typeof row.lie === 'boolean') ||
    !(
      row.category === undefined ||
      row.category === null ||
      row.category === 'cont' ||
      row.category === 'ero' ||
      row.category === 'tech'
    )
  ) {
    return null;
  }
  return {
    id: row.id.toLowerCase(),
    name: row.name,
    rating: row.rating,
    spoiler: row.spoiler,
    ...(row.lie === undefined ? {} : { lie: row.lie }),
    ...(row.category === undefined ? {} : { category: row.category }),
  };
}

function decodeRelation(value: unknown): VnRelation | null {
  const row = asJsonRecord(value);
  const languages = decodeStringArray(row?.languages);
  const platforms = decodeStringArray(row?.platforms);
  const developers = decodeArray(row?.developers, (value) => {
    const producer = asJsonRecord(value);
    if (!producer || !isString(producer.name) || !(producer.id === undefined || isString(producer.id))) return null;
    return producer.id === undefined
      ? { name: producer.name }
      : { id: producer.id.toLowerCase(), name: producer.name };
  });
  const publishers = decodeArray(row?.publishers, (value) => {
    const producer = asJsonRecord(value);
    if (!producer || !isString(producer.name) || !(producer.id === undefined || isString(producer.id))) return null;
    return producer.id === undefined
      ? { name: producer.name }
      : { id: producer.id.toLowerCase(), name: producer.name };
  });
  if (
    !row ||
    !isString(row.id) ||
    !isValidVnId(row.id) ||
    !isString(row.title) ||
    !isNullableString(row.alttitle) ||
    !isNullableString(row.released) ||
    !isNullableFiniteNumber(row.rating) ||
    !isNullableFiniteNumber(row.votecount) ||
    !isNullableFiniteNumber(row.length_minutes) ||
    !languages ||
    !platforms ||
    !developers ||
    !publishers ||
    !isNullableString(row.image_url) ||
    !isNullableString(row.image_thumb) ||
    !isNullableFiniteNumber(row.image_sexual) ||
    !isString(row.relation) ||
    typeof row.relation_official !== 'boolean'
  ) {
    return null;
  }
  return {
    id: normalizeVnId(row.id),
    title: row.title,
    alttitle: row.alttitle,
    released: row.released,
    rating: row.rating,
    votecount: row.votecount,
    length_minutes: row.length_minutes,
    languages,
    platforms,
    developers,
    publishers,
    image_url: row.image_url,
    image_thumb: row.image_thumb,
    image_sexual: row.image_sexual,
    relation: row.relation,
    relation_official: row.relation_official,
  };
}

function decodeSeries(value: unknown): { id: number; name: string } | null {
  const row = asJsonRecord(value);
  if (!row || !isNonNegativeInteger(row.id) || !isString(row.name)) return null;
  return { id: row.id, name: row.name };
}

function decodeEgs(value: unknown): EgsLite | null {
  const row = asJsonRecord(value);
  if (
    !row ||
    !isNullableFiniteNumber(row.egs_id) ||
    !isNullableFiniteNumber(row.median) ||
    !isNullableFiniteNumber(row.average) ||
    !isNullableFiniteNumber(row.count) ||
    !isNullableFiniteNumber(row.playtime_median_minutes) ||
    !(row.source === null || row.source === 'extlink' || row.source === 'search' || row.source === 'manual') ||
    !(row.okazu === null || typeof row.okazu === 'boolean') ||
    !(row.erogame === null || typeof row.erogame === 'boolean')
  ) {
    return null;
  }
  return {
    egs_id: row.egs_id,
    median: row.median,
    average: row.average,
    count: row.count,
    playtime_median_minutes: row.playtime_median_minutes,
    source: row.source,
    okazu: row.okazu,
    erogame: row.erogame,
  };
}

function decodeOptional<T>(value: unknown, decode: (row: unknown) => T | null): T | undefined | null {
  if (value === undefined) return undefined;
  return decode(value);
}

function isRotation(value: unknown): value is 0 | 90 | 180 | 270 {
  return value === 0 || value === 90 || value === 180 || value === 270;
}

function isOptionalStatus(value: unknown): value is Status | undefined {
  return value === undefined || (isString(value) && (STATUSES as readonly string[]).includes(value));
}

function isOptionalEditionType(value: unknown): value is EditionType | undefined {
  return value === undefined || (isString(value) && (EDITION_TYPES as readonly string[]).includes(value));
}

function isOptionalBoolean(value: unknown): value is boolean | undefined {
  return value === undefined || typeof value === 'boolean';
}

function isOptionalNullableFiniteNumber(value: unknown): value is number | null | undefined {
  return value === undefined || isNullableFiniteNumber(value);
}

function isOptionalFiniteNumber(value: unknown): value is number | undefined {
  return value === undefined || isFiniteNumber(value);
}

/**
 * Decode a public collection card row before it enters the library grid.
 *
 * @param value Parsed row from the collection API.
 * @returns Safe card row, or `null` for malformed input.
 */
export function decodeCollectionCardItem(value: unknown): CollectionCardApiItem | null {
  const row = asJsonRecord(value);
  const developers = decodeArray(row?.developers, decodeProducer);
  const publishers = decodeArray(row?.publishers, decodeProducer);
  const tags = decodeArray(row?.tags, decodeTag);
  const relations = decodeArray(row?.relations, decodeRelation);
  const physicalLocation = decodeOptional(row?.physical_location, decodeStringArray);
  const series = decodeOptional(row?.series, (value) => decodeArray(value, decodeSeries));
  const egs = row?.egs === null ? null : decodeOptional(row?.egs, decodeEgs);
  const aspectKeys = decodeOptional(row?.aspect_keys, (value) =>
    decodeArray(value, (key) => (isAspectKey(key) ? key : null)),
  );
  if (
    !row ||
    !isString(row.id) ||
    !isValidVnId(row.id) ||
    !isString(row.title) ||
    !isNullableString(row.alttitle) ||
    !isNullableString(row.image_url) ||
    !isNullableString(row.image_thumb) ||
    !isNullableFiniteNumber(row.image_sexual) ||
    !isNullableString(row.released) ||
    !isNullableFiniteNumber(row.length_minutes) ||
    !isNullableFiniteNumber(row.rating) ||
    !developers ||
    !publishers ||
    !tags ||
    !relations ||
    !isNullableString(row.local_image) ||
    !isNullableString(row.local_image_thumb) ||
    !isNullableString(row.custom_cover) ||
    !isNullableString(row.banner_image) ||
    !isNullableString(row.banner_position) ||
    !isRotation(row.cover_rotation) ||
    !isRotation(row.banner_rotation) ||
    !isFiniteNumber(row.fetched_at) ||
    !isOptionalStatus(row.status) ||
    !isOptionalNullableFiniteNumber(row.user_rating) ||
    !isOptionalFiniteNumber(row.playtime_minutes) ||
    !isOptionalBoolean(row.favorite) ||
    !isOptionalEditionType(row.edition_type) ||
    physicalLocation === null ||
    !isOptionalBoolean(row.dumped) ||
    !isOptionalFiniteNumber(row.added_at) ||
    !isOptionalFiniteNumber(row.updated_at) ||
    series === null ||
    egs === null && row.egs !== null ||
    aspectKeys === null ||
    typeof row.has_notes !== 'boolean' ||
    !isNonNegativeInteger(row.list_count) ||
    typeof row.in_reading_queue !== 'boolean'
  ) {
    return null;
  }
  return {
    id: normalizeVnId(row.id),
    title: row.title,
    alttitle: row.alttitle,
    image_url: row.image_url,
    image_thumb: row.image_thumb,
    image_sexual: row.image_sexual,
    released: row.released,
    length_minutes: row.length_minutes,
    rating: row.rating,
    developers,
    publishers,
    tags,
    relations,
    local_image: row.local_image,
    local_image_thumb: row.local_image_thumb,
    custom_cover: row.custom_cover,
    banner_image: row.banner_image,
    banner_position: row.banner_position,
    cover_rotation: row.cover_rotation,
    banner_rotation: row.banner_rotation,
    fetched_at: row.fetched_at,
    ...(row.status === undefined ? {} : { status: row.status }),
    ...(row.user_rating === undefined ? {} : { user_rating: row.user_rating }),
    ...(row.playtime_minutes === undefined ? {} : { playtime_minutes: row.playtime_minutes }),
    ...(row.favorite === undefined ? {} : { favorite: row.favorite }),
    ...(row.edition_type === undefined ? {} : { edition_type: row.edition_type }),
    ...(physicalLocation === undefined ? {} : { physical_location: physicalLocation }),
    ...(row.dumped === undefined ? {} : { dumped: row.dumped }),
    ...(row.added_at === undefined ? {} : { added_at: row.added_at }),
    ...(row.updated_at === undefined ? {} : { updated_at: row.updated_at }),
    ...(series === undefined ? {} : { series }),
    ...(egs === undefined ? {} : { egs }),
    ...(aspectKeys === undefined ? {} : { aspect_keys: aspectKeys as AspectKey[] }),
    has_notes: row.has_notes,
    list_count: row.list_count,
    in_reading_queue: row.in_reading_queue,
  };
}

/**
 * Decode one bounded collection page.
 *
 * @param value Parsed collection API payload.
 * @param decodeItem Caller-specific row decoder.
 * @returns Safe page envelope, or `null` for malformed input.
 */
export function decodeCollectionPage<T>(
  value: unknown,
  decodeItem: (value: unknown) => T | null,
): CollectionPageResult<T> | null {
  const row = asJsonRecord(value);
  const pagination = asJsonRecord(row?.pagination);
  if (
    !row ||
    !Array.isArray(row.items) ||
    row.items.length > MAX_PAGE_ITEMS ||
    !pagination ||
    !isNonNegativeInteger(pagination.page) ||
    pagination.page < 1 ||
    !isNonNegativeInteger(pagination.page_size) ||
    pagination.page_size < 1 ||
    pagination.page_size > MAX_PAGE_ITEMS ||
    !isNonNegativeInteger(pagination.returned) ||
    pagination.returned !== row.items.length ||
    typeof pagination.has_more !== 'boolean'
  ) {
    return null;
  }
  const items = decodeArray(row.items, decodeItem);
  return items
    ? {
        items,
        pagination: {
          page: pagination.page,
          page_size: pagination.page_size,
          returned: pagination.returned,
          has_more: pagination.has_more,
        },
      }
    : null;
}

function decodeStats(value: unknown): Stats | null {
  const row = asJsonRecord(value);
  const byStatus = decodeArray(row?.byStatus, (value) => {
    const entry = asJsonRecord(value);
    return entry &&
      isString(entry.status) &&
      (STATUSES as readonly string[]).includes(entry.status) &&
      isNonNegativeInteger(entry.n)
      ? { status: entry.status as Status, n: entry.n }
      : null;
  });
  return row && isNonNegativeInteger(row.total) && byStatus && isFiniteNumber(row.playtime_minutes)
    ? { total: row.total, byStatus, playtime_minutes: row.playtime_minutes }
    : null;
}

/**
 * Decode a library grid response with cards, stats, and pagination.
 *
 * @param value Parsed collection API payload.
 * @returns Safe library state, or `null` for malformed input.
 */
export function decodeLibraryCollectionResponse(value: unknown): {
  items: CollectionCardApiItem[];
  stats: Stats;
  pagination: CollectionPage;
} | null {
  const row = asJsonRecord(value);
  const page = decodeCollectionPage(row, decodeCollectionCardItem);
  const stats = decodeStats(row?.stats);
  return page && stats ? { ...page, stats } : null;
}

function decodeBulkRow(value: unknown): CollectionBulkRow | null {
  const row = asJsonRecord(value);
  return row && isString(row.id) && isValidVnId(row.id) && isString(row.title)
    ? { id: normalizeVnId(row.id), title: row.title }
    : null;
}

/**
 * Decode collection rows consumed by the bulk asset downloader.
 *
 * @param value Parsed collection row.
 * @returns Safe row projection, or `null` for malformed input.
 */
export function decodeCollectionBulkRow(value: unknown): CollectionBulkRow | null {
  return decodeBulkRow(value);
}

/**
 * Decode collection rows consumed by the compare picker.
 *
 * @param value Parsed collection row.
 * @returns Safe row projection, or `null` for malformed input.
 */
export function decodeCollectionCompareRow(value: unknown): CollectionCompareRow | null {
  const row = asJsonRecord(value);
  const bulk = decodeBulkRow(value);
  return row && bulk && isNullableString(row.alttitle) && isNullableString(row.released)
    ? { ...bulk, alttitle: row.alttitle, released: row.released }
    : null;
}

/**
 * Decode collection rows consumed by the selective full-download picker.
 *
 * @param value Parsed collection row.
 * @returns Safe row projection, or `null` for malformed input.
 */
export function decodeCollectionSelectiveRow(value: unknown): CollectionSelectiveRow | null {
  const row = asJsonRecord(value);
  const compare = decodeCollectionCompareRow(value);
  return row &&
    compare &&
    (row.status === null || isString(row.status)) &&
    isNullableFiniteNumber(row.rating) &&
    isNullableFiniteNumber(row.user_rating) &&
    isNullableFiniteNumber(row.playtime_minutes) &&
    isNullableFiniteNumber(row.added_at) &&
    isNullableFiniteNumber(row.updated_at) &&
    (row.full_downloaded === undefined || typeof row.full_downloaded === 'boolean')
    ? {
        ...compare,
        status: row.status,
        rating: row.rating,
        user_rating: row.user_rating,
        playtime_minutes: row.playtime_minutes,
        added_at: row.added_at,
        updated_at: row.updated_at,
        ...(row.full_downloaded === undefined ? {} : { full_downloaded: row.full_downloaded }),
      }
    : null;
}

/**
 * Decode developer and publisher facets returned to the library drawer.
 *
 * @param value Parsed producers API payload.
 * @returns Safe facet rows, or `null` for malformed input.
 */
export function decodeLibraryProducerFacets(value: unknown): {
  producers: LibraryProducerFacet[];
  publishers: LibraryProducerFacet[];
} | null {
  const row = asJsonRecord(value);
  const decode = (value: unknown): LibraryProducerFacet | null => {
    const entry = asJsonRecord(value);
    return entry &&
      isString(entry.id) &&
      /^p\d+$/i.test(entry.id) &&
      isString(entry.name) &&
      isNonNegativeInteger(entry.vn_count)
      ? { id: entry.id.toLowerCase(), name: entry.name, vn_count: entry.vn_count }
      : null;
  };
  const producers = decodeArray(row?.producers, decode);
  const publishers = decodeArray(row?.publishers, decode);
  return producers && publishers ? { producers, publishers } : null;
}

/**
 * Decode series facets returned to the library drawer.
 *
 * @param value Parsed series API payload.
 * @returns Safe facet rows, or `null` for malformed input.
 */
export function decodeLibrarySeriesFacets(value: unknown): LibrarySeriesFacet[] | null {
  return decodeArray(asJsonRecord(value)?.series, decodeSeries);
}

/**
 * Decode tag facets returned to the library drawer.
 *
 * @param value Parsed collection-tags API payload.
 * @returns Safe facet rows, or `null` for malformed input.
 */
export function decodeLibraryTagFacets(value: unknown): LibraryTagFacet[] | null {
  return decodeArray(asJsonRecord(value)?.tags, (value) => {
    const row = asJsonRecord(value);
    return row &&
      isString(row.id) &&
      /^g\d+$/i.test(row.id) &&
      isString(row.name) &&
      isNonNegativeInteger(row.vn_count)
      ? { id: row.id.toLowerCase(), name: row.name, vn_count: row.vn_count }
      : null;
  });
}

/**
 * Decode durable library defaults from the settings endpoint.
 *
 * @param value Parsed settings API payload.
 * @returns Safe defaults, or `null` for malformed input.
 */
export function decodeLibraryDefaults(value: unknown): LibraryDefaults | null {
  const row = asJsonRecord(value);
  return row &&
    isString(row.default_sort) &&
    (row.default_order === 'asc' || row.default_order === 'desc') &&
    isString(row.default_group)
    ? {
        default_sort: row.default_sort,
        default_order: row.default_order,
        default_group: row.default_group,
      }
    : null;
}
