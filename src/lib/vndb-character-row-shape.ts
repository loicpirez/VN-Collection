import { asJsonRecord } from './json-shape';
import type {
  VndbCharImage,
  VndbCharacter,
  VndbCharacterTrait,
  VndbCharacterVn,
  VndbImage,
} from './vndb';
import type { VndbReleaseLanguage } from './vndb-types';
import { isVndbVnId, normalizeVnId } from './vn-id-shape';

const MAX_NESTED_ROWS = 5000;
const CHARACTER_ROLES = new Set(['main', 'primary', 'side', 'appears']);

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

function decodeArray<T>(value: unknown, decode: (item: unknown) => T | null): T[] | null {
  if (!Array.isArray(value) || value.length > MAX_NESTED_ROWS) return null;
  const out: T[] = [];
  for (const item of value) {
    const decoded = decode(item);
    if (!decoded) return null;
    out.push(decoded);
  }
  return out;
}

function decodeStringArray(value: unknown): string[] | null {
  return decodeArray(value, (item) => isString(item) ? item : null);
}

function decodeOptionalStringArray(value: unknown): string[] | undefined | null {
  return value === undefined ? undefined : decodeStringArray(value);
}

function decodeNumberPair(value: unknown): [number, number] | null | undefined {
  if (value === null) return null;
  return Array.isArray(value) && value.length === 2 && value.every(isFiniteNumber)
    ? [value[0] as number, value[1] as number]
    : undefined;
}

function decodeStringPair(value: unknown): [string | null, string | null] | null | undefined {
  if (value === null) return null;
  return Array.isArray(value) && value.length === 2 && value.every(isNullableString)
    ? [value[0] as string | null, value[1] as string | null]
    : undefined;
}

function decodeImage(value: unknown): VndbImage | null | undefined {
  if (value === null) return null;
  const row = asJsonRecord(value);
  const dims = row?.dims === undefined ? undefined : decodeNumberPair(row.dims);
  const thumbnailDims = row?.thumbnail_dims === undefined ? undefined : decodeNumberPair(row.thumbnail_dims);
  if (
    !row ||
    !isString(row.url) ||
    (row.id !== undefined && !isString(row.id)) ||
    (row.thumbnail !== undefined && !isString(row.thumbnail)) ||
    (row.dims !== undefined && !Array.isArray(dims)) ||
    (row.thumbnail_dims !== undefined && !Array.isArray(thumbnailDims)) ||
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
    ...(Array.isArray(dims) ? { dims } : {}),
    ...(Array.isArray(thumbnailDims) ? { thumbnail_dims: thumbnailDims } : {}),
    ...(isFiniteNumber(row.sexual) ? { sexual: row.sexual } : {}),
    ...(isFiniteNumber(row.violence) ? { violence: row.violence } : {}),
    ...(isFiniteNumber(row.votecount) ? { votecount: row.votecount } : {}),
  };
}

function decodeCharImage(value: unknown): VndbCharImage | null | undefined {
  const image = decodeImage(value);
  if (!image || image === null) return image;
  return {
    ...(image.id ? { id: image.id } : {}),
    url: image.url,
    ...(image.dims ? { dims: image.dims } : {}),
    ...(isFiniteNumber(image.sexual) ? { sexual: image.sexual } : {}),
    ...(isFiniteNumber(image.violence) ? { violence: image.violence } : {}),
    ...(isFiniteNumber(image.votecount) ? { votecount: image.votecount } : {}),
  };
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

function decodeAppearanceRelease(value: unknown): NonNullable<VndbCharacterVn['release']> | null {
  const row = asJsonRecord(value);
  const languages = row?.languages === undefined ? undefined : decodeArray(row.languages, decodeReleaseLanguage);
  const platforms = row?.platforms === undefined ? undefined : decodeStringArray(row.platforms);
  if (
    !row ||
    !isString(row.id) ||
    !/^r\d+$/i.test(row.id) ||
    (row.title !== undefined && !isString(row.title)) ||
    (row.alttitle !== undefined && !isNullableString(row.alttitle)) ||
    (row.released !== undefined && !isNullableString(row.released)) ||
    (row.minage !== undefined && !isNullableFiniteNumber(row.minage)) ||
    (row.official !== undefined && typeof row.official !== 'boolean') ||
    (row.patch !== undefined && typeof row.patch !== 'boolean') ||
    (row.freeware !== undefined && typeof row.freeware !== 'boolean') ||
    (row.has_ero !== undefined && typeof row.has_ero !== 'boolean') ||
    languages === null ||
    platforms === null
  ) {
    return null;
  }
  return {
    id: row.id.toLowerCase(),
    ...(isString(row.title) ? { title: row.title } : {}),
    ...(row.alttitle === null || isString(row.alttitle) ? { alttitle: row.alttitle } : {}),
    ...(row.released === null || isString(row.released) ? { released: row.released } : {}),
    ...(row.minage === null || isFiniteNumber(row.minage) ? { minage: row.minage } : {}),
    ...(typeof row.official === 'boolean' ? { official: row.official } : {}),
    ...(typeof row.patch === 'boolean' ? { patch: row.patch } : {}),
    ...(typeof row.freeware === 'boolean' ? { freeware: row.freeware } : {}),
    ...(typeof row.has_ero === 'boolean' ? { has_ero: row.has_ero } : {}),
    ...(languages ? { languages } : {}),
    ...(platforms ? { platforms } : {}),
  };
}

function decodeAppearanceDeveloper(value: unknown): { id: string; name: string } | null {
  const row = asJsonRecord(value);
  return row && isString(row.id) && /^p\d+$/i.test(row.id) && isString(row.name)
    ? { id: row.id.toLowerCase(), name: row.name }
    : null;
}

function decodeAppearance(value: unknown): VndbCharacterVn | null {
  const row = asJsonRecord(value);
  const languages = decodeOptionalStringArray(row?.languages);
  const platforms = decodeOptionalStringArray(row?.platforms);
  const image = row?.image === undefined ? undefined : decodeImage(row.image);
  const developers = row?.developers === undefined ? undefined : decodeArray(row.developers, decodeAppearanceDeveloper);
  const release = row?.release === undefined || row.release === null ? row?.release : decodeAppearanceRelease(row.release);
  if (
    !row ||
    !isString(row.id) ||
    !isVndbVnId(row.id) ||
    !isString(row.role) ||
    !CHARACTER_ROLES.has(row.role) ||
    !isFiniteNumber(row.spoiler) ||
    (row.title !== undefined && !isString(row.title)) ||
    (row.alttitle !== undefined && !isNullableString(row.alttitle)) ||
    (row.released !== undefined && !isNullableString(row.released)) ||
    (row.olang !== undefined && !isNullableString(row.olang)) ||
    languages === null ||
    platforms === null ||
    (row.length_minutes !== undefined && !isNullableFiniteNumber(row.length_minutes)) ||
    (row.rating !== undefined && !isNullableFiniteNumber(row.rating)) ||
    (row.votecount !== undefined && !isNullableFiniteNumber(row.votecount)) ||
    (row.image !== undefined && image === undefined) ||
    developers === null ||
    (row.release !== undefined && row.release !== null && release === null)
  ) {
    return null;
  }
  return {
    id: normalizeVnId(row.id),
    role: row.role as VndbCharacterVn['role'],
    spoiler: row.spoiler,
    ...(isString(row.title) ? { title: row.title } : {}),
    ...(row.alttitle === null || isString(row.alttitle) ? { alttitle: row.alttitle } : {}),
    ...(row.released === null || isString(row.released) ? { released: row.released } : {}),
    ...(row.olang === null || isString(row.olang) ? { olang: row.olang } : {}),
    ...(languages ? { languages } : {}),
    ...(platforms ? { platforms } : {}),
    ...(row.length_minutes === null || isFiniteNumber(row.length_minutes) ? { length_minutes: row.length_minutes } : {}),
    ...(row.rating === null || isFiniteNumber(row.rating) ? { rating: row.rating } : {}),
    ...(row.votecount === null || isFiniteNumber(row.votecount) ? { votecount: row.votecount } : {}),
    ...(image === undefined ? {} : { image }),
    ...(developers ? { developers } : {}),
    ...(release === undefined ? {} : { release }),
  };
}

function decodeTrait(value: unknown): VndbCharacterTrait | null {
  const row = asJsonRecord(value);
  const aliases = decodeOptionalStringArray(row?.aliases);
  if (
    !row ||
    !isString(row.id) ||
    !/^i\d+$/i.test(row.id) ||
    !isFiniteNumber(row.spoiler) ||
    (row.lie !== undefined && typeof row.lie !== 'boolean') ||
    (row.name !== undefined && !isString(row.name)) ||
    aliases === null ||
    (row.description !== undefined && !isNullableString(row.description)) ||
    (row.searchable !== undefined && typeof row.searchable !== 'boolean') ||
    (row.applicable !== undefined && typeof row.applicable !== 'boolean') ||
    (row.sexual !== undefined && typeof row.sexual !== 'boolean') ||
    (row.group_id !== undefined && !isNullableString(row.group_id)) ||
    (row.group_id !== undefined && row.group_id !== null && !/^i\d+$/i.test(row.group_id)) ||
    (row.group_name !== undefined && !isNullableString(row.group_name)) ||
    (row.char_count !== undefined && !isFiniteNumber(row.char_count))
  ) {
    return null;
  }
  return {
    id: row.id.toLowerCase(),
    spoiler: row.spoiler,
    ...(typeof row.lie === 'boolean' ? { lie: row.lie } : {}),
    ...(isString(row.name) ? { name: row.name } : {}),
    ...(aliases ? { aliases } : {}),
    ...(row.description === null || isString(row.description) ? { description: row.description } : {}),
    ...(typeof row.searchable === 'boolean' ? { searchable: row.searchable } : {}),
    ...(typeof row.applicable === 'boolean' ? { applicable: row.applicable } : {}),
    ...(typeof row.sexual === 'boolean' ? { sexual: row.sexual } : {}),
    ...(row.group_id === null || isString(row.group_id) ? { group_id: row.group_id?.toLowerCase() ?? null } : {}),
    ...(row.group_name === null || isString(row.group_name) ? { group_name: row.group_name } : {}),
    ...(isFiniteNumber(row.char_count) ? { char_count: row.char_count } : {}),
  };
}

/** Decode one complete VNDB character row before nested metadata reaches consumers. */
export function decodeVndbCharacter(value: unknown): VndbCharacter | null {
  const row = asJsonRecord(value);
  const aliases = decodeStringArray(row?.aliases);
  const image = row?.image === null ? null : decodeCharImage(row?.image);
  const birthday = decodeNumberPair(row?.birthday);
  const sex = decodeStringPair(row?.sex);
  const gender = decodeStringPair(row?.gender);
  const vns = decodeArray(row?.vns, decodeAppearance);
  const traits = decodeArray(row?.traits, decodeTrait);
  if (
    !row ||
    !isString(row.id) ||
    !/^c\d+$/i.test(row.id) ||
    !isString(row.name) ||
    !isNullableString(row.original) ||
    !aliases ||
    !isNullableString(row.description) ||
    image === undefined ||
    !isNullableString(row.blood_type) ||
    !isNullableFiniteNumber(row.height) ||
    !isNullableFiniteNumber(row.weight) ||
    !isNullableFiniteNumber(row.bust) ||
    !isNullableFiniteNumber(row.waist) ||
    !isNullableFiniteNumber(row.hips) ||
    !isNullableString(row.cup) ||
    !isNullableFiniteNumber(row.age) ||
    birthday === undefined ||
    sex === undefined ||
    gender === undefined ||
    !vns ||
    !traits
  ) {
    return null;
  }
  return {
    id: row.id.toLowerCase(),
    name: row.name,
    original: row.original,
    aliases,
    description: row.description,
    image,
    blood_type: row.blood_type,
    height: row.height,
    weight: row.weight,
    bust: row.bust,
    waist: row.waist,
    hips: row.hips,
    cup: row.cup,
    age: row.age,
    birthday,
    sex,
    gender,
    vns,
    traits,
  };
}
