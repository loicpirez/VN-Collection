import { asJsonRecord } from './json-shape';
import type { VndbSearchHit } from './types';
import { isVndbVnId, normalizeVnId } from './vn-id-shape';

export type VndbSearchRow = Omit<VndbSearchHit, 'in_collection'>;

export interface VndbCoverRow {
  id: string;
  image: { url: string; thumbnail?: string; sexual?: number } | null;
}

function isString(value: unknown): value is string {
  return typeof value === 'string';
}

function isNullableString(value: unknown): value is string | null {
  return value === null || isString(value);
}

function isNullableFiniteNumber(value: unknown): value is number | null {
  return value === null || (typeof value === 'number' && Number.isFinite(value));
}

function decodeStringArray(value: unknown): string[] | null {
  return Array.isArray(value) && value.every(isString) ? value : null;
}

function decodeOptionalStringArray(value: unknown): string[] | undefined | null {
  return value === undefined ? undefined : decodeStringArray(value);
}

function decodeSearchImage(value: unknown): VndbSearchRow['image'] | undefined {
  if (value === null) return null;
  const record = asJsonRecord(value);
  return record && isString(record.url) && isString(record.thumbnail)
    ? { url: record.url, thumbnail: record.thumbnail }
    : undefined;
}

function decodeTitles(value: unknown): VndbSearchRow['titles'] | undefined | null {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) return null;
  const out: NonNullable<VndbSearchRow['titles']> = [];
  for (const item of value) {
    const row = asJsonRecord(item);
    if (
      !row ||
      !isString(row.lang) ||
      !isString(row.title) ||
      !isNullableString(row.latin) ||
      typeof row.official !== 'boolean' ||
      typeof row.main !== 'boolean'
    ) {
      return null;
    }
    out.push({
      lang: row.lang,
      title: row.title,
      latin: row.latin,
      official: row.official,
      main: row.main,
    });
  }
  return out;
}

function decodeDevelopers(value: unknown): { name: string }[] | null {
  if (!Array.isArray(value)) return null;
  const out: { name: string }[] = [];
  for (const item of value) {
    const row = asJsonRecord(item);
    if (!row || !isString(row.id) || !/^p\d+$/i.test(row.id) || !isString(row.name)) return null;
    out.push({ name: row.name });
  }
  return out;
}

/** Decode one VNDB VN-search row before it reaches matching or rendering paths. */
export function decodeVndbSearchRow(value: unknown): VndbSearchRow | null {
  const row = asJsonRecord(value);
  const aliases = decodeOptionalStringArray(row?.aliases);
  const titles = decodeTitles(row?.titles);
  const languages = decodeStringArray(row?.languages);
  const platforms = decodeStringArray(row?.platforms);
  const image = decodeSearchImage(row?.image);
  const developers = decodeDevelopers(row?.developers);
  if (
    !row ||
    !isString(row.id) ||
    !isVndbVnId(row.id) ||
    !isString(row.title) ||
    !isNullableString(row.alttitle) ||
    aliases === null ||
    titles === null ||
    !isNullableString(row.released) ||
    !isNullableFiniteNumber(row.rating) ||
    !isNullableFiniteNumber(row.votecount) ||
    !isNullableFiniteNumber(row.length_minutes) ||
    !languages ||
    !platforms ||
    image === undefined ||
    !developers
  ) {
    return null;
  }
  return {
    id: normalizeVnId(row.id),
    title: row.title,
    alttitle: row.alttitle,
    ...(aliases ? { aliases } : {}),
    ...(titles ? { titles } : {}),
    released: row.released,
    rating: row.rating,
    votecount: row.votecount,
    length_minutes: row.length_minutes,
    languages,
    platforms,
    image,
    developers,
  };
}

/** Decode one cover-only VNDB row used by batched mapped-feed enrichment. */
export function decodeVndbCoverRow(value: unknown): VndbCoverRow | null {
  const row = asJsonRecord(value);
  if (!row || !isString(row.id) || !isVndbVnId(row.id)) return null;
  if (row.image === null) return { id: normalizeVnId(row.id), image: null };
  const image = asJsonRecord(row.image);
  if (
    !image ||
    !isString(image.url) ||
    (image.thumbnail !== undefined && !isString(image.thumbnail)) ||
    (image.sexual !== undefined && (typeof image.sexual !== 'number' || !Number.isFinite(image.sexual)))
  ) {
    return null;
  }
  return {
    id: normalizeVnId(row.id),
    image: {
      url: image.url,
      ...(isString(image.thumbnail) ? { thumbnail: image.thumbnail } : {}),
      ...(typeof image.sexual === 'number' ? { sexual: image.sexual } : {}),
    },
  };
}
