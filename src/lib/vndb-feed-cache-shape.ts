import { asJsonRecord } from './json-shape';
import { isVndbVnId } from './vn-id-shape';
import type { ProducerCompletionSourceRow } from './producer-completion';
import type { VndbReleaseRow, VndbVnSummary } from './producer-associations';
import type { SteamReleaseLinkRow } from './steam';
import type { VndbTopRanked } from './top-ranked';
import type { UpcomingRelease } from './upcoming';
import type { RecHit } from './vndb-recommend';

const MAX_FEED_ROWS = 1000;

function isString(value: unknown): value is string {
  return typeof value === 'string';
}

function isNullableString(value: unknown): value is string | null {
  return value === null || isString(value);
}

function isNullableNumber(value: unknown): value is number | null {
  return value === null || (typeof value === 'number' && Number.isFinite(value));
}

function decodeStringArray(value: unknown): string[] | null {
  return Array.isArray(value) && value.every(isString) ? value : null;
}

function decodeImage(
  value: unknown,
): { url: string; thumbnail?: string; sexual?: number } | null | undefined {
  if (value === null) return null;
  const record = asJsonRecord(value);
  if (
    !record ||
    !isString(record.url) ||
    !(record.thumbnail === undefined || isString(record.thumbnail)) ||
    !(record.sexual === undefined || (typeof record.sexual === 'number' && Number.isFinite(record.sexual)))
  ) {
    return undefined;
  }
  return {
    url: record.url,
    ...(record.thumbnail !== undefined ? { thumbnail: record.thumbnail } : {}),
    ...(record.sexual !== undefined ? { sexual: record.sexual } : {}),
  };
}

function decodeImageWithThumbnail(
  value: unknown,
): { url: string; thumbnail: string; sexual?: number } | null | undefined {
  const image = decodeImage(value);
  if (image === null || image === undefined) return image;
  return typeof image.thumbnail === 'string' ? { ...image, thumbnail: image.thumbnail } : undefined;
}

function decodeDeveloperRows(value: unknown): { id: string; name: string }[] | null {
  if (!Array.isArray(value)) return null;
  return value.flatMap((developer) => {
    const item = asJsonRecord(developer);
    const id = item && isString(item.id) ? item.id : '';
    return item && /^p\d+$/i.test(id) && isString(item.name)
      ? [{ id: id.toLowerCase(), name: item.name }]
      : [];
  });
}

function decodeTopRankedRow(value: unknown): VndbTopRanked | null {
  const record = asJsonRecord(value);
  if (!record) return null;
  const id = isString(record.id) ? record.id : null;
  const image = decodeImage(record.image);
  const languages = decodeStringArray(record.languages);
  const platforms = decodeStringArray(record.platforms);
  if (
    !isVndbVnId(id) ||
    !isString(record.title) ||
    !isNullableString(record.alttitle) ||
    !isNullableString(record.released) ||
    image === undefined ||
    !isNullableNumber(record.rating) ||
    !isNullableNumber(record.votecount) ||
    !isNullableNumber(record.length_minutes) ||
    !languages ||
    !platforms ||
    !Array.isArray(record.developers)
  ) {
    return null;
  }
  const developers = decodeDeveloperRows(record.developers) ?? [];
  return {
    id: id.toLowerCase(),
    title: record.title,
    alttitle: record.alttitle,
    released: record.released,
    image,
    rating: record.rating,
    votecount: record.votecount,
    length_minutes: record.length_minutes,
    languages,
    platforms,
    developers,
  };
}

function decodeRecommendationRow(value: unknown): RecHit | null {
  const record = asJsonRecord(value);
  if (!record) return null;
  const id = isString(record.id) ? record.id : null;
  const image = decodeImageWithThumbnail(record.image);
  const developers = decodeDeveloperRows(record.developers);
  if (
    !isVndbVnId(id) ||
    !isString(record.title) ||
    !isNullableString(record.alttitle) ||
    !isNullableString(record.released) ||
    !isNullableNumber(record.rating) ||
    !isNullableNumber(record.votecount) ||
    !isNullableNumber(record.length_minutes) ||
    image === undefined ||
    !developers
  ) {
    return null;
  }
  return {
    id: id.toLowerCase(),
    title: record.title,
    alttitle: record.alttitle,
    released: record.released,
    rating: record.rating,
    votecount: record.votecount,
    length_minutes: record.length_minutes,
    image,
    developers,
  };
}

function decodeProducerCompletionRow(value: unknown): ProducerCompletionSourceRow | null {
  const record = asJsonRecord(value);
  if (!record) return null;
  const id = isString(record.id) ? record.id : null;
  const image = decodeImageWithThumbnail(record.image);
  if (
    !isVndbVnId(id) ||
    !isString(record.title) ||
    !isNullableString(record.alttitle) ||
    !isNullableString(record.released) ||
    !isNullableNumber(record.rating) ||
    image === undefined
  ) {
    return null;
  }
  return {
    id: id.toLowerCase(),
    title: record.title,
    alttitle: record.alttitle,
    released: record.released,
    rating: record.rating,
    image,
  };
}

function decodeVnSummary(value: unknown): VndbVnSummary | null {
  const record = asJsonRecord(value);
  if (!record) return null;
  const id = isString(record.id) ? record.id : null;
  const image = record.image === undefined ? undefined : decodeImageWithThumbnail(record.image);
  if (
    !isVndbVnId(id) ||
    !isString(record.title) ||
    !(record.alttitle === undefined || isNullableString(record.alttitle)) ||
    !(record.released === undefined || isNullableString(record.released)) ||
    !(record.rating === undefined || isNullableNumber(record.rating)) ||
    (record.image !== undefined && image === undefined)
  ) {
    return null;
  }
  return {
    id: id.toLowerCase(),
    title: record.title,
    ...(record.alttitle !== undefined ? { alttitle: record.alttitle } : {}),
    ...(record.released !== undefined ? { released: record.released } : {}),
    ...(record.rating !== undefined ? { rating: record.rating } : {}),
    ...(image !== undefined ? { image } : {}),
  };
}

function decodeProducerReleaseRow(value: unknown): VndbReleaseRow | null {
  const record = asJsonRecord(value);
  const id = record && isString(record.id) ? record.id : '';
  if (
    !record ||
    !/^r\d+$/i.test(id) ||
    !Array.isArray(record.vns) ||
    !Array.isArray(record.producers)
  ) {
    return null;
  }
  const vns = record.vns.flatMap((vn) => decodeVnSummary(vn) ?? []);
  const producers = record.producers.flatMap((producer) => {
    const item = asJsonRecord(producer);
    const id = item && isString(item.id) ? item.id : '';
    return item &&
      /^p\d+$/i.test(id) &&
      typeof item.developer === 'boolean' &&
      typeof item.publisher === 'boolean' &&
      (item.name === undefined || isNullableString(item.name))
      ? [{
          id: id.toLowerCase(),
          developer: item.developer,
          publisher: item.publisher,
          ...(item.name !== undefined ? { name: item.name } : {}),
        }]
      : [];
  });
  return { id: id.toLowerCase(), vns, producers };
}

function decodeSteamReleaseRow(value: unknown): SteamReleaseLinkRow | null {
  const record = asJsonRecord(value);
  if (!record || !isString(record.title) || !Array.isArray(record.extlinks) || !Array.isArray(record.vns)) return null;
  const extlinks = record.extlinks.flatMap((extlink) => {
    const item = asJsonRecord(extlink);
    const id = item?.id;
    return item &&
      isString(item.url) &&
      isString(item.name) &&
      (id === undefined || isString(id) || (typeof id === 'number' && Number.isFinite(id)))
      ? [{ url: item.url, name: item.name, ...(id !== undefined ? { id } : {}) }]
      : [];
  });
  const vns = record.vns.flatMap((vn) => {
    const item = asJsonRecord(vn);
    const id = item && isString(item.id) ? item.id : null;
    return isVndbVnId(id) ? [{ id: id.toLowerCase() }] : [];
  });
  return { title: record.title, extlinks, vns };
}

function decodeLanguageCodes(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  return value.flatMap((language) => {
    if (isString(language)) return [language];
    const record = asJsonRecord(language);
    return record && isString(record.lang) ? [record.lang] : [];
  });
}

function decodeUpcomingRow(value: unknown): UpcomingRelease | null {
  const record = asJsonRecord(value);
  if (!record) return null;
  const id = isString(record.id) ? record.id : '';
  const languages = decodeLanguageCodes(record.languages);
  const platforms = decodeStringArray(record.platforms);
  if (
    !/^r\d+$/i.test(id) ||
    !isString(record.title) ||
    !isNullableString(record.alttitle) ||
    !isString(record.released) ||
    !languages ||
    !platforms ||
    !Array.isArray(record.producers) ||
    !Array.isArray(record.vns) ||
    typeof record.patch !== 'boolean' ||
    typeof record.freeware !== 'boolean' ||
    typeof record.has_ero !== 'boolean'
  ) {
    return null;
  }
  const producers = record.producers.flatMap((producer) => {
    const item = asJsonRecord(producer);
    const id = item && isString(item.id) ? item.id : '';
    return item && /^p\d+$/i.test(id) && isString(item.name)
      ? [{ id: id.toLowerCase(), name: item.name }]
      : [];
  });
  const vns = record.vns.flatMap((vn) => {
    const item = asJsonRecord(vn);
    const vnId = item && isString(item.id) ? item.id : null;
    if (!item || !isVndbVnId(vnId) || !isString(item.title)) return [];
    const image = decodeImage(item.image);
    return image === undefined
      ? []
      : [{ id: vnId.toLowerCase(), title: item.title, image }];
  });
  return {
    id: id.toLowerCase(),
    title: record.title,
    alttitle: record.alttitle,
    released: record.released,
    languages,
    platforms,
    producers,
    vns,
    patch: record.patch,
    freeware: record.freeware,
    has_ero: record.has_ero,
  };
}

function decodePage<T>(value: unknown, decodeRow: (row: unknown) => T | null): { results: T[]; more: boolean } | null {
  const record = asJsonRecord(value);
  if (!record || !Array.isArray(record.results) || record.results.length > MAX_FEED_ROWS || typeof record.more !== 'boolean') {
    return null;
  }
  const results: T[] = [];
  for (const row of record.results) {
    const decoded = decodeRow(row);
    if (decoded !== null) results.push(decoded);
  }
  return { results, more: record.more };
}

function decodeResults<T>(value: unknown, decodeRow: (row: unknown) => T | null): { results: T[] } | null {
  const record = asJsonRecord(value);
  if (!record || !Array.isArray(record.results) || record.results.length > MAX_FEED_ROWS) return null;
  return { results: record.results.flatMap((row) => decodeRow(row) ?? []) };
}

/**
 * Decode one VNDB top-ranked cache or upstream payload.
 *
 * @param value Decoded JSON payload.
 * @returns A normalized feed page, or `null` when the envelope is malformed.
 */
export function decodeVndbTopRankedPage(value: unknown): { results: VndbTopRanked[]; more: boolean } | null {
  return decodePage(value, decodeTopRankedRow);
}

/**
 * Decode one VNDB upcoming-release cache or upstream payload.
 *
 * @param value Decoded JSON payload.
 * @returns A normalized feed page, or `null` when the envelope is malformed.
 */
export function decodeUpcomingReleasePage(value: unknown): { results: UpcomingRelease[]; more: boolean } | null {
  return decodePage(value, decodeUpcomingRow);
}

/**
 * Decode one VNDB recommendation cache or upstream payload.
 *
 * @param value Decoded JSON payload.
 * @returns Normalized recommendation hits, or `null` when the envelope is malformed.
 */
export function decodeRecommendationResults(value: unknown): { results: RecHit[] } | null {
  return decodeResults(value, decodeRecommendationRow);
}

/**
 * Decode one VNDB producer-completion cache or upstream payload.
 *
 * @param value Decoded JSON payload.
 * @returns Normalized VN rows, or `null` when the envelope is malformed.
 */
export function decodeProducerCompletionResults(value: unknown): { results: ProducerCompletionSourceRow[] } | null {
  return decodeResults(value, decodeProducerCompletionRow);
}

/**
 * Decode one VNDB producer-association VN page.
 *
 * @param value Decoded JSON payload.
 * @returns Normalized VN summary rows, or `null` when the envelope is malformed.
 */
export function decodeProducerAssociationVnPage(value: unknown): { results: VndbVnSummary[]; more: boolean } | null {
  return decodePage(value, decodeVnSummary);
}

/**
 * Decode one VNDB producer-association release page.
 *
 * @param value Decoded JSON payload.
 * @returns Normalized release rows, or `null` when the envelope is malformed.
 */
export function decodeProducerAssociationReleasePage(value: unknown): { results: VndbReleaseRow[]; more: boolean } | null {
  return decodePage(value, decodeProducerReleaseRow);
}

/**
 * Decode one VNDB Steam-link release payload.
 *
 * @param value Decoded JSON payload.
 * @returns Normalized release rows, or `null` when the envelope is malformed.
 */
export function decodeSteamReleaseResults(value: unknown): { results: SteamReleaseLinkRow[] } | null {
  return decodeResults(value, decodeSteamReleaseRow);
}
