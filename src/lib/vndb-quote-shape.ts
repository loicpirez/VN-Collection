import { asJsonRecord } from './json-shape';
import type { VndbCharImage, VndbImage, VndbQuote } from './vndb';
import { isVndbVnId, normalizeVnId } from './vn-id-shape';

const MAX_ALIASES = 5000;

function isString(value: unknown): value is string {
  return typeof value === 'string';
}

function isNullableString(value: unknown): value is string | null {
  return value === null || isString(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function decodeDims(value: unknown): [number, number] | undefined {
  return Array.isArray(value) && value.length === 2 && value.every(isFiniteNumber)
    ? [value[0] as number, value[1] as number]
    : undefined;
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

function decodeAliases(value: unknown): string[] | undefined | null {
  if (value === undefined) return undefined;
  return Array.isArray(value) && value.length <= MAX_ALIASES && value.every(isString) ? value : null;
}

/** Decode one VNDB quote row before it reaches persistence or rendering paths. */
export function decodeVndbQuote(value: unknown): VndbQuote | null {
  const row = asJsonRecord(value);
  const vn = row?.vn === null ? null : asJsonRecord(row?.vn);
  const character = row?.character === null ? null : asJsonRecord(row?.character);
  const vnImage = vn?.image === undefined ? undefined : decodeImage(vn.image);
  const aliases = decodeAliases(character?.aliases);
  const characterImage = character?.image === undefined ? undefined : decodeCharImage(character.image);
  if (
    !row ||
    !isString(row.id) ||
    !/^q\d+$/i.test(row.id) ||
    !isString(row.quote) ||
    !isFiniteNumber(row.score) ||
    !(row.vn === null || vn) ||
    !(row.character === null || character) ||
    (vn && (
      !isString(vn.id) ||
      !isVndbVnId(vn.id) ||
      !isString(vn.title) ||
      (vn.alttitle !== undefined && !isNullableString(vn.alttitle)) ||
      (vn.released !== undefined && !isNullableString(vn.released)) ||
      (vn.image !== undefined && vnImage === undefined)
    )) ||
    (character && (
      !isString(character.id) ||
      !/^c\d+$/i.test(character.id) ||
      !isString(character.name) ||
      !isNullableString(character.original) ||
      aliases === null ||
      (character.image !== undefined && characterImage === undefined)
    ))
  ) {
    return null;
  }
  return {
    id: row.id.toLowerCase(),
    quote: row.quote,
    score: row.score,
    vn: vn
      ? {
          id: normalizeVnId(vn.id as string),
          title: vn.title as string,
          ...(vn.alttitle === null || isString(vn.alttitle) ? { alttitle: vn.alttitle } : {}),
          ...(vn.released === null || isString(vn.released) ? { released: vn.released } : {}),
          ...(vnImage === undefined ? {} : { image: vnImage }),
        }
      : null,
    character: character
      ? {
          id: (character.id as string).toLowerCase(),
          name: character.name as string,
          original: character.original as string | null,
          ...(aliases ? { aliases } : {}),
          ...(characterImage === undefined ? {} : { image: characterImage }),
        }
      : null,
  };
}
