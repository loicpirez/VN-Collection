import { asJsonRecord } from './json-shape';
import type {
  VndbRelease,
  VndbReleaseExtLink,
  VndbReleaseImage,
  VndbReleaseLanguage,
  VndbReleaseProducer,
  VndbReleaseVn,
  VndbReleaseVnImage,
} from './vndb-types';
import { isVndbVnId, normalizeVnId } from './vn-id-shape';

const IMAGE_TYPES = new Set(['pkgfront', 'pkgback', 'pkgcontent', 'pkgside', 'pkgmed', 'dig']);
const RELEASE_TYPES = new Set(['trial', 'partial', 'complete']);

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

function isSafeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value);
}

function decodeStringArray(value: unknown): string[] | null {
  return Array.isArray(value) && value.every(isString) ? value : null;
}

function decodeDims(value: unknown): [number, number] | undefined {
  return Array.isArray(value) && value.length === 2 && value.every(isFiniteNumber)
    ? [value[0] as number, value[1] as number]
    : undefined;
}

function decodeReleaseLanguage(value: unknown): VndbReleaseLanguage | null {
  const row = asJsonRecord(value);
  return row &&
    isString(row.lang) &&
    isNullableString(row.title) &&
    isNullableString(row.latin) &&
    typeof row.mtl === 'boolean' &&
    typeof row.main === 'boolean'
    ? { lang: row.lang, title: row.title, latin: row.latin, mtl: row.mtl, main: row.main }
    : null;
}

function decodeReleaseExtLink(value: unknown): VndbReleaseExtLink | null {
  const row = asJsonRecord(value);
  if (
    !row ||
    !isString(row.url) ||
    !isString(row.label) ||
    !isString(row.name) ||
    (row.id !== undefined && row.id !== null && !isString(row.id) && !isFiniteNumber(row.id))
  ) {
    return null;
  }
  return {
    url: row.url,
    label: row.label,
    name: row.name,
    ...(row.id !== undefined ? { id: row.id as string | number | null } : {}),
  };
}

function decodeReleaseVnImage(value: unknown): VndbReleaseVnImage | null {
  const row = asJsonRecord(value);
  if (
    !row ||
    !isString(row.url) ||
    (row.thumbnail !== undefined && !isString(row.thumbnail)) ||
    (row.sexual !== undefined && !isFiniteNumber(row.sexual))
  ) {
    return null;
  }
  return {
    url: row.url,
    ...(isString(row.thumbnail) ? { thumbnail: row.thumbnail } : {}),
    ...(isFiniteNumber(row.sexual) ? { sexual: row.sexual } : {}),
  };
}

function decodeReleaseVn(value: unknown): VndbReleaseVn | null {
  const row = asJsonRecord(value);
  const image = row?.image === null ? null : row?.image === undefined ? undefined : decodeReleaseVnImage(row.image);
  if (
    !row ||
    !isString(row.id) ||
    !isVndbVnId(row.id) ||
    !isString(row.rtype) ||
    !RELEASE_TYPES.has(row.rtype) ||
    (row.title !== undefined && !isString(row.title)) ||
    (row.alttitle !== undefined && !isNullableString(row.alttitle)) ||
    (row.released !== undefined && !isNullableString(row.released)) ||
    (row.rating !== undefined && !isNullableFiniteNumber(row.rating)) ||
    (image === null && row.image !== null)
  ) {
    return null;
  }
  return {
    id: normalizeVnId(row.id),
    rtype: row.rtype as VndbReleaseVn['rtype'],
    ...(isString(row.title) ? { title: row.title } : {}),
    ...(row.alttitle === null || isString(row.alttitle) ? { alttitle: row.alttitle } : {}),
    ...(row.released === null || isString(row.released) ? { released: row.released } : {}),
    ...(row.rating === null || isFiniteNumber(row.rating) ? { rating: row.rating } : {}),
    ...(image !== undefined ? { image } : {}),
  };
}

function decodeReleaseProducer(value: unknown): VndbReleaseProducer | null {
  const row = asJsonRecord(value);
  const aliases = row?.aliases === undefined ? undefined : decodeStringArray(row.aliases);
  const extlinks = row?.extlinks === undefined
    ? undefined
    : Array.isArray(row.extlinks)
      ? row.extlinks.map(decodeReleaseExtLink)
      : null;
  if (
    !row ||
    !isString(row.id) ||
    !/^p\d+$/i.test(row.id) ||
    typeof row.developer !== 'boolean' ||
    typeof row.publisher !== 'boolean' ||
    !isString(row.name) ||
    (row.original !== undefined && !isNullableString(row.original)) ||
    (row.aliases !== undefined && aliases === null) ||
    (row.lang !== undefined && !isNullableString(row.lang)) ||
    (row.type !== undefined && !isNullableString(row.type)) ||
    (row.description !== undefined && !isNullableString(row.description)) ||
    extlinks === null ||
    extlinks?.some((link) => link === null)
  ) {
    return null;
  }
  return {
    id: row.id.toLowerCase(),
    developer: row.developer,
    publisher: row.publisher,
    name: row.name,
    ...(row.original === null || isString(row.original) ? { original: row.original } : {}),
    ...(aliases ? { aliases } : {}),
    ...(row.lang === null || isString(row.lang) ? { lang: row.lang } : {}),
    ...(row.type === null || isString(row.type) ? { type: row.type } : {}),
    ...(row.description === null || isString(row.description) ? { description: row.description } : {}),
    ...(extlinks ? { extlinks: extlinks as VndbReleaseExtLink[] } : {}),
  };
}

function decodeReleaseImage(value: unknown): VndbReleaseImage | null {
  const row = asJsonRecord(value);
  const dims = row?.dims === undefined ? undefined : decodeDims(row.dims);
  const thumbnailDims = row?.thumbnail_dims === undefined ? undefined : decodeDims(row.thumbnail_dims);
  const languages = row?.languages === undefined || row.languages === null ? row?.languages : decodeStringArray(row.languages);
  if (
    !row ||
    !isString(row.id) ||
    !isString(row.url) ||
    !isString(row.type) ||
    !IMAGE_TYPES.has(row.type) ||
    (row.thumbnail !== undefined && !isString(row.thumbnail)) ||
    (row.dims !== undefined && dims === undefined) ||
    (row.thumbnail_dims !== undefined && thumbnailDims === undefined) ||
    (row.sexual !== undefined && !isFiniteNumber(row.sexual)) ||
    (row.violence !== undefined && !isFiniteNumber(row.violence)) ||
    (row.votecount !== undefined && !isFiniteNumber(row.votecount)) ||
    (row.languages !== undefined && row.languages !== null && languages === null) ||
    (row.photo !== undefined && typeof row.photo !== 'boolean') ||
    (row.vn !== undefined && !isNullableString(row.vn))
  ) {
    return null;
  }
  return {
    id: row.id,
    url: row.url,
    type: row.type as VndbReleaseImage['type'],
    ...(isString(row.thumbnail) ? { thumbnail: row.thumbnail } : {}),
    ...(dims ? { dims } : {}),
    ...(thumbnailDims ? { thumbnail_dims: thumbnailDims } : {}),
    ...(isFiniteNumber(row.sexual) ? { sexual: row.sexual } : {}),
    ...(isFiniteNumber(row.violence) ? { violence: row.violence } : {}),
    ...(isFiniteNumber(row.votecount) ? { votecount: row.votecount } : {}),
    ...(Array.isArray(languages) ? { languages } : languages === null ? { languages: null } : {}),
    ...(typeof row.photo === 'boolean' ? { photo: row.photo } : {}),
    ...(row.vn === null || isString(row.vn) ? { vn: row.vn } : {}),
  };
}

/** Decode one complete VNDB release row without discarding selected nested metadata. */
export function decodeVndbRelease(value: unknown): VndbRelease | null {
  const row = asJsonRecord(value);
  const resolution = row?.resolution === null || isString(row?.resolution)
    ? row.resolution
    : decodeDims(row?.resolution);
  if (
    !row ||
    !isString(row.id) ||
    !/^r\d+$/i.test(row.id) ||
    !isString(row.title) ||
    !isNullableString(row.alttitle) ||
    !Array.isArray(row.languages) ||
    !Array.isArray(row.platforms) ||
    !Array.isArray(row.media) ||
    !isNullableString(row.released) ||
    !isNullableFiniteNumber(row.minage) ||
    typeof row.patch !== 'boolean' ||
    typeof row.freeware !== 'boolean' ||
    !isNullableFiniteNumber(row.voiced) ||
    typeof row.official !== 'boolean' ||
    typeof row.has_ero !== 'boolean' ||
    !(row.uncensored === null || typeof row.uncensored === 'boolean') ||
    resolution === undefined ||
    !isNullableString(row.engine) ||
    !isNullableString(row.notes) ||
    !isNullableString(row.gtin) ||
    !isNullableString(row.catalog) ||
    !Array.isArray(row.producers) ||
    !Array.isArray(row.extlinks) ||
    !Array.isArray(row.vns) ||
    !Array.isArray(row.images)
  ) {
    return null;
  }
  const languages = row.languages.map(decodeReleaseLanguage);
  const platforms = decodeStringArray(row.platforms);
  const media = row.media.map((value) => {
    const item = asJsonRecord(value);
    return item && isString(item.medium) && isSafeInteger(item.qty) && item.qty >= 0
      ? { medium: item.medium, qty: item.qty }
      : null;
  });
  const producers = row.producers.map(decodeReleaseProducer);
  const extlinks = row.extlinks.map(decodeReleaseExtLink);
  const vns = row.vns.map(decodeReleaseVn);
  const images = row.images.map(decodeReleaseImage);
  if (
    !platforms ||
    languages.some((value) => value === null) ||
    media.some((value) => value === null) ||
    producers.some((value) => value === null) ||
    extlinks.some((value) => value === null) ||
    vns.some((value) => value === null) ||
    images.some((value) => value === null)
  ) {
    return null;
  }
  return {
    id: row.id.toLowerCase(),
    title: row.title,
    alttitle: row.alttitle,
    languages: languages as VndbReleaseLanguage[],
    platforms,
    media: media as { medium: string; qty: number }[],
    released: row.released,
    minage: row.minage,
    patch: row.patch,
    freeware: row.freeware,
    uncensored: row.uncensored,
    official: row.official,
    has_ero: row.has_ero,
    resolution,
    engine: row.engine,
    voiced: row.voiced,
    notes: row.notes,
    gtin: row.gtin,
    catalog: row.catalog,
    producers: producers as VndbReleaseProducer[],
    extlinks: extlinks as VndbReleaseExtLink[],
    vns: vns as VndbReleaseVn[],
    images: images as VndbReleaseImage[],
  };
}
