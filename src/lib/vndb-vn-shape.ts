import { asJsonRecord } from './json-shape';
import type { Screenshot } from './types';
import type {
  VndbCharImage,
  VndbExtLink,
  VndbImage,
  VndbRelationEntry,
  VndbStaffAlias,
  VndbTitleRecord,
  VndbVn,
  VndbVnDeveloper,
  VndbVnStaff,
  VndbVnTag,
  VndbVnVa,
} from './vndb';
import { isVndbVnId, normalizeVnId } from './vn-id-shape';

const MAX_NESTED_ROWS = 5000;
const TAG_CATEGORIES = new Set(['cont', 'ero', 'tech']);

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

function decodeArray<T>(value: unknown, decode: (row: unknown) => T | null): T[] | null {
  if (!Array.isArray(value) || value.length > MAX_NESTED_ROWS) return null;
  const out: T[] = [];
  for (const row of value) {
    const decoded = decode(row);
    if (!decoded) return null;
    out.push(decoded);
  }
  return out;
}

function decodeOptionalArray<T>(value: unknown, decode: (row: unknown) => T | null): T[] | undefined | null {
  return value === undefined ? undefined : decodeArray(value, decode);
}

function decodeStringArray(value: unknown): string[] | null {
  return decodeArray(value, (row) => isString(row) ? row : null);
}

function decodeOptionalStringArray(value: unknown): string[] | undefined | null {
  return value === undefined ? undefined : decodeStringArray(value);
}

function decodeDims(value: unknown): [number, number] | undefined {
  return Array.isArray(value) && value.length === 2 && value.every(isFiniteNumber)
    ? [value[0] as number, value[1] as number]
    : undefined;
}

function decodeExtLink(value: unknown): VndbExtLink | null {
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

function decodeImage(value: unknown): VndbImage | null | undefined {
  if (value === null) return null;
  const row = asJsonRecord(value);
  const dims = row?.dims === undefined ? undefined : decodeDims(row.dims);
  const thumbnailDims = row?.thumbnail_dims === undefined ? undefined : decodeDims(row.thumbnail_dims);
  if (
    !row ||
    !isString(row.url) ||
    (row.id !== undefined && !isString(row.id)) ||
    (row.thumbnail !== undefined && !isString(row.thumbnail)) ||
    (row.dims !== undefined && dims === undefined) ||
    (row.thumbnail_dims !== undefined && thumbnailDims === undefined) ||
    (row.sexual !== undefined && !isFiniteNumber(row.sexual)) ||
    (row.violence !== undefined && !isFiniteNumber(row.violence)) ||
    (row.votecount !== undefined && !isFiniteNumber(row.votecount))
  ) {
    return undefined;
  }
  return {
    ...(isString(row.id) ? { id: row.id } : {}),
    url: row.url,
    ...(isString(row.thumbnail) ? { thumbnail: row.thumbnail } : {}),
    ...(dims ? { dims } : {}),
    ...(thumbnailDims ? { thumbnail_dims: thumbnailDims } : {}),
    ...(isFiniteNumber(row.sexual) ? { sexual: row.sexual } : {}),
    ...(isFiniteNumber(row.violence) ? { violence: row.violence } : {}),
    ...(isFiniteNumber(row.votecount) ? { votecount: row.votecount } : {}),
  };
}

function decodeCharImage(value: unknown): VndbCharImage | null | undefined {
  const image = decodeImage(value);
  return image === undefined ? undefined : image;
}

function decodeTitle(value: unknown): VndbTitleRecord | null {
  const row = asJsonRecord(value);
  return row &&
    isString(row.lang) &&
    isString(row.title) &&
    isNullableString(row.latin) &&
    typeof row.official === 'boolean' &&
    typeof row.main === 'boolean'
    ? { lang: row.lang, title: row.title, latin: row.latin, official: row.official, main: row.main }
    : null;
}

function decodeDeveloper(value: unknown): VndbVnDeveloper | null {
  const row = asJsonRecord(value);
  const aliases = decodeOptionalStringArray(row?.aliases);
  const extlinks = decodeOptionalArray(row?.extlinks, decodeExtLink);
  if (
    !row ||
    !isString(row.id) ||
    !/^p\d+$/i.test(row.id) ||
    !isString(row.name) ||
    (row.original !== undefined && !isNullableString(row.original)) ||
    aliases === null ||
    (row.lang !== undefined && !isNullableString(row.lang)) ||
    (row.type !== undefined && !isNullableString(row.type)) ||
    (row.description !== undefined && !isNullableString(row.description)) ||
    extlinks === null
  ) {
    return null;
  }
  return {
    id: row.id.toLowerCase(),
    name: row.name,
    ...(row.original === null || isString(row.original) ? { original: row.original } : {}),
    ...(aliases ? { aliases } : {}),
    ...(row.lang === null || isString(row.lang) ? { lang: row.lang } : {}),
    ...(row.type === null || isString(row.type) ? { type: row.type } : {}),
    ...(row.description === null || isString(row.description) ? { description: row.description } : {}),
    ...(extlinks ? { extlinks } : {}),
  };
}

function decodeTag(value: unknown): VndbVnTag | null {
  const row = asJsonRecord(value);
  const aliases = decodeOptionalStringArray(row?.aliases);
  if (
    !row ||
    !isString(row.id) ||
    !/^g\d+$/i.test(row.id) ||
    !isString(row.name) ||
    !isFiniteNumber(row.rating) ||
    !isFiniteNumber(row.spoiler) ||
    (row.lie !== undefined && typeof row.lie !== 'boolean') ||
    (row.category !== undefined && row.category !== null && (!isString(row.category) || !TAG_CATEGORIES.has(row.category))) ||
    aliases === null ||
    (row.description !== undefined && !isNullableString(row.description)) ||
    (row.searchable !== undefined && typeof row.searchable !== 'boolean') ||
    (row.applicable !== undefined && typeof row.applicable !== 'boolean') ||
    (row.vn_count !== undefined && !isFiniteNumber(row.vn_count))
  ) {
    return null;
  }
  return {
    id: row.id.toLowerCase(),
    name: row.name,
    rating: row.rating,
    spoiler: row.spoiler,
    ...(typeof row.lie === 'boolean' ? { lie: row.lie } : {}),
    ...(row.category === null || isString(row.category) ? { category: row.category as VndbVnTag['category'] } : {}),
    ...(aliases ? { aliases } : {}),
    ...(row.description === null || isString(row.description) ? { description: row.description } : {}),
    ...(typeof row.searchable === 'boolean' ? { searchable: row.searchable } : {}),
    ...(typeof row.applicable === 'boolean' ? { applicable: row.applicable } : {}),
    ...(isFiniteNumber(row.vn_count) ? { vn_count: row.vn_count } : {}),
  };
}

function decodeStaffAlias(value: unknown): VndbStaffAlias | null {
  const row = asJsonRecord(value);
  return row &&
    isSafeInteger(row.aid) &&
    isString(row.name) &&
    isNullableString(row.latin) &&
    typeof row.ismain === 'boolean'
    ? { aid: row.aid, name: row.name, latin: row.latin, ismain: row.ismain }
    : null;
}

function decodeStaff(value: unknown): VndbVnStaff | null {
  const row = asJsonRecord(value);
  const aliases = decodeOptionalArray(row?.aliases, decodeStaffAlias);
  const extlinks = decodeOptionalArray(row?.extlinks, decodeExtLink);
  if (
    !row ||
    !isString(row.id) ||
    !/^s\d+$/i.test(row.id) ||
    !(row.eid === null || isSafeInteger(row.eid)) ||
    !isString(row.role) ||
    !isNullableString(row.note) ||
    !isSafeInteger(row.aid) ||
    !isString(row.name) ||
    !isNullableString(row.original) ||
    !isNullableString(row.lang) ||
    (row.ismain !== undefined && typeof row.ismain !== 'boolean') ||
    (row.gender !== undefined && !isNullableString(row.gender)) ||
    (row.description !== undefined && !isNullableString(row.description)) ||
    aliases === null ||
    extlinks === null
  ) {
    return null;
  }
  return {
    eid: row.eid,
    role: row.role,
    note: row.note,
    id: row.id.toLowerCase(),
    aid: row.aid,
    name: row.name,
    original: row.original,
    lang: row.lang,
    ...(typeof row.ismain === 'boolean' ? { ismain: row.ismain } : {}),
    ...(row.gender === null || isString(row.gender) ? { gender: row.gender } : {}),
    ...(row.description === null || isString(row.description) ? { description: row.description } : {}),
    ...(aliases ? { aliases } : {}),
    ...(extlinks ? { extlinks } : {}),
  };
}

function decodeVa(value: unknown): VndbVnVa | null {
  const row = asJsonRecord(value);
  const character = asJsonRecord(row?.character);
  const staff = asJsonRecord(row?.staff);
  const aliases = decodeOptionalStringArray(character?.aliases);
  const characterImage = character?.image === undefined ? undefined : decodeCharImage(character.image);
  const staffAliases = decodeOptionalArray(staff?.aliases, decodeStaffAlias);
  const staffExtlinks = decodeOptionalArray(staff?.extlinks, decodeExtLink);
  if (
    !row ||
    !isNullableString(row.note) ||
    !character ||
    !isString(character.id) ||
    !/^c\d+$/i.test(character.id) ||
    !isString(character.name) ||
    !isNullableString(character.original) ||
    aliases === null ||
    characterImage === undefined && character.image !== undefined ||
    !staff ||
    !isString(staff.id) ||
    !/^s\d+$/i.test(staff.id) ||
    !isSafeInteger(staff.aid) ||
    !isString(staff.name) ||
    !isNullableString(staff.original) ||
    !isNullableString(staff.lang) ||
    (staff.ismain !== undefined && typeof staff.ismain !== 'boolean') ||
    (staff.gender !== undefined && !isNullableString(staff.gender)) ||
    (staff.description !== undefined && !isNullableString(staff.description)) ||
    staffAliases === null ||
    staffExtlinks === null
  ) {
    return null;
  }
  return {
    note: row.note,
    character: {
      id: character.id.toLowerCase(),
      name: character.name,
      original: character.original,
      ...(aliases ? { aliases } : {}),
      ...(characterImage !== undefined ? { image: characterImage } : {}),
    },
    staff: {
      id: staff.id.toLowerCase(),
      aid: staff.aid,
      name: staff.name,
      original: staff.original,
      lang: staff.lang,
      ...(typeof staff.ismain === 'boolean' ? { ismain: staff.ismain } : {}),
      ...(staff.gender === null || isString(staff.gender) ? { gender: staff.gender } : {}),
      ...(staff.description === null || isString(staff.description) ? { description: staff.description } : {}),
      ...(staffAliases ? { aliases: staffAliases } : {}),
      ...(staffExtlinks ? { extlinks: staffExtlinks } : {}),
    },
  };
}

function decodeScreenshot(value: unknown): Screenshot | null {
  const row = asJsonRecord(value);
  const dims = row?.dims === undefined ? undefined : decodeDims(row.dims);
  const release = row?.release === undefined || row.release === null ? row?.release : asJsonRecord(row.release);
  if (
    !row ||
    !isString(row.url) ||
    !isString(row.thumbnail) ||
    (row.id !== undefined && !isString(row.id)) ||
    (row.sexual !== undefined && !isFiniteNumber(row.sexual)) ||
    (row.violence !== undefined && !isFiniteNumber(row.violence)) ||
    (row.dims !== undefined && dims === undefined) ||
    (release !== undefined && release !== null && (!isString(release.id) || !/^r\d+$/i.test(release.id)))
  ) {
    return null;
  }
  return {
    ...(isString(row.id) ? { id: row.id } : {}),
    url: row.url,
    thumbnail: row.thumbnail,
    ...(isFiniteNumber(row.sexual) ? { sexual: row.sexual } : {}),
    ...(isFiniteNumber(row.violence) ? { violence: row.violence } : {}),
    ...(dims ? { dims } : {}),
    ...(release === null ? { release: null } : release ? { release: { id: (release.id as string).toLowerCase() } } : {}),
  };
}

function decodeRelation(value: unknown): VndbRelationEntry | null {
  const row = asJsonRecord(value);
  const titles = decodeOptionalArray(row?.titles, decodeTitle);
  const aliases = decodeOptionalStringArray(row?.aliases);
  const languages = decodeOptionalStringArray(row?.languages);
  const platforms = decodeOptionalStringArray(row?.platforms);
  const developers = decodeOptionalArray(row?.developers, decodeDeveloper);
  const extlinks = decodeOptionalArray(row?.extlinks, decodeExtLink);
  const image = row?.image === null ? null : decodeImage(row?.image);
  if (
    !row ||
    !isString(row.id) ||
    !isVndbVnId(row.id) ||
    !isString(row.title) ||
    !isNullableString(row.released) ||
    !isString(row.relation) ||
    typeof row.relation_official !== 'boolean' ||
    (row.alttitle !== undefined && !isNullableString(row.alttitle)) ||
    titles === null ||
    aliases === null ||
    (row.olang !== undefined && !isNullableString(row.olang)) ||
    (row.devstatus !== undefined && row.devstatus !== null && row.devstatus !== 0 && row.devstatus !== 1 && row.devstatus !== 2) ||
    (row.rating !== undefined && !isNullableFiniteNumber(row.rating)) ||
    (row.votecount !== undefined && !isNullableFiniteNumber(row.votecount)) ||
    (row.average !== undefined && !isNullableFiniteNumber(row.average)) ||
    (row.length !== undefined && !isNullableFiniteNumber(row.length)) ||
    (row.length_minutes !== undefined && !isNullableFiniteNumber(row.length_minutes)) ||
    (row.length_votes !== undefined && !isNullableFiniteNumber(row.length_votes)) ||
    languages === null ||
    platforms === null ||
    (row.description !== undefined && !isNullableString(row.description)) ||
    developers === null ||
    image === undefined ||
    extlinks === null
  ) {
    return null;
  }
  return {
    id: normalizeVnId(row.id),
    title: row.title,
    released: row.released,
    relation: row.relation,
    relation_official: row.relation_official,
    ...(row.alttitle === null || isString(row.alttitle) ? { alttitle: row.alttitle } : {}),
    ...(titles ? { titles } : {}),
    ...(aliases ? { aliases } : {}),
    ...(row.olang === null || isString(row.olang) ? { olang: row.olang } : {}),
    ...(row.devstatus === null || row.devstatus === 0 || row.devstatus === 1 || row.devstatus === 2 ? { devstatus: row.devstatus } : {}),
    ...(row.rating === null || isFiniteNumber(row.rating) ? { rating: row.rating } : {}),
    ...(row.votecount === null || isFiniteNumber(row.votecount) ? { votecount: row.votecount } : {}),
    ...(row.average === null || isFiniteNumber(row.average) ? { average: row.average } : {}),
    ...(row.length === null || isFiniteNumber(row.length) ? { length: row.length } : {}),
    ...(row.length_minutes === null || isFiniteNumber(row.length_minutes) ? { length_minutes: row.length_minutes } : {}),
    ...(row.length_votes === null || isFiniteNumber(row.length_votes) ? { length_votes: row.length_votes } : {}),
    ...(languages ? { languages } : {}),
    ...(platforms ? { platforms } : {}),
    ...(row.description === null || isString(row.description) ? { description: row.description } : {}),
    ...(developers ? { developers } : {}),
    image,
    ...(extlinks ? { extlinks } : {}),
  };
}

/** Decode one complete VNDB VN-detail row before it enters local persistence. */
export function decodeVndbVnDetail(value: unknown): VndbVn | null {
  const row = asJsonRecord(value);
  const titles = decodeOptionalArray(row?.titles, decodeTitle);
  const aliases = decodeOptionalStringArray(row?.aliases);
  const languages = decodeStringArray(row?.languages);
  const platforms = decodeStringArray(row?.platforms);
  const image = row?.image === null ? null : decodeImage(row?.image);
  const extlinks = decodeOptionalArray(row?.extlinks, decodeExtLink);
  const editions = decodeOptionalArray(row?.editions, (value) => {
    const edition = asJsonRecord(value);
    return edition &&
      isSafeInteger(edition.eid) &&
      isNullableString(edition.lang) &&
      isString(edition.name) &&
      typeof edition.official === 'boolean'
      ? { eid: edition.eid, lang: edition.lang, name: edition.name, official: edition.official }
      : null;
  });
  const staff = decodeOptionalArray(row?.staff, decodeStaff);
  const va = decodeOptionalArray(row?.va, decodeVa);
  const developers = decodeArray(row?.developers, decodeDeveloper);
  const tags = decodeArray(row?.tags, decodeTag);
  const screenshots = decodeArray(row?.screenshots, decodeScreenshot);
  const relations = decodeOptionalArray(row?.relations, decodeRelation);
  if (
    !row ||
    !isString(row.id) ||
    !isVndbVnId(row.id) ||
    !isString(row.title) ||
    !isNullableString(row.alttitle) ||
    titles === null ||
    aliases === null ||
    !isNullableString(row.olang) ||
    (row.devstatus !== undefined && row.devstatus !== null && row.devstatus !== 0 && row.devstatus !== 1 && row.devstatus !== 2) ||
    !isNullableString(row.released) ||
    !languages ||
    !platforms ||
    !isNullableFiniteNumber(row.length) ||
    !isNullableFiniteNumber(row.length_minutes) ||
    (row.length_votes !== undefined && !isNullableFiniteNumber(row.length_votes)) ||
    !isNullableFiniteNumber(row.rating) ||
    !isNullableFiniteNumber(row.votecount) ||
    (row.average !== undefined && !isNullableFiniteNumber(row.average)) ||
    !isNullableString(row.description) ||
    image === undefined ||
    extlinks === null ||
    (row.has_anime !== undefined && row.has_anime !== null && typeof row.has_anime !== 'boolean') ||
    editions === null ||
    staff === null ||
    va === null ||
    !developers ||
    !tags ||
    !screenshots ||
    relations === null
  ) {
    return null;
  }
  return {
    id: normalizeVnId(row.id),
    title: row.title,
    alttitle: row.alttitle,
    olang: row.olang,
    released: row.released,
    languages,
    platforms,
    length: row.length,
    length_minutes: row.length_minutes,
    rating: row.rating,
    votecount: row.votecount,
    description: row.description,
    image,
    developers,
    tags,
    screenshots,
    ...(titles ? { titles } : {}),
    ...(aliases ? { aliases } : {}),
    ...(row.devstatus === null || row.devstatus === 0 || row.devstatus === 1 || row.devstatus === 2 ? { devstatus: row.devstatus } : {}),
    ...(row.length_votes === null || isFiniteNumber(row.length_votes) ? { length_votes: row.length_votes } : {}),
    ...(row.average === null || isFiniteNumber(row.average) ? { average: row.average } : {}),
    ...(extlinks ? { extlinks } : {}),
    ...(row.has_anime === null || typeof row.has_anime === 'boolean' ? { has_anime: row.has_anime } : {}),
    ...(editions ? { editions } : {}),
    ...(staff ? { staff } : {}),
    ...(va ? { va } : {}),
    ...(relations ? { relations } : {}),
  };
}
