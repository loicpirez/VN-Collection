import { asJsonRecord } from './json-shape';
import type { VndbQuote } from './vndb-types';
import { isValidVnId, normalizeVnId } from './vn-id-shape';

const MAX_QUOTES = 200;

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === 'string';
}

function decodeQuote(value: unknown): VndbQuote | null {
  const row = asJsonRecord(value);
  const rawVn = row?.vn;
  const rawCharacter = row?.character;
  if (
    !row ||
    typeof row.id !== 'string' ||
    typeof row.quote !== 'string' ||
    typeof row.score !== 'number' ||
    !Number.isFinite(row.score) ||
    !(rawVn === null || asJsonRecord(rawVn)) ||
    !(rawCharacter === null || asJsonRecord(rawCharacter))
  ) {
    return null;
  }
  const vn = asJsonRecord(rawVn);
  let decodedVn: VndbQuote['vn'] = null;
  if (vn) {
    const { id, title, image_url, local_image, local_image_thumb } = vn;
    if (
      typeof id !== 'string' ||
      !isValidVnId(id) ||
      typeof title !== 'string' ||
      !(image_url === undefined || isNullableString(image_url)) ||
      !(local_image === undefined || isNullableString(local_image)) ||
      !(local_image_thumb === undefined || isNullableString(local_image_thumb))
    ) {
      return null;
    }
    decodedVn = {
      id: normalizeVnId(id),
      title,
      ...(image_url === undefined ? {} : { image_url }),
      ...(local_image === undefined ? {} : { local_image }),
      ...(local_image_thumb === undefined ? {} : { local_image_thumb }),
    };
  }
  const character = asJsonRecord(rawCharacter);
  let decodedCharacter: VndbQuote['character'] = null;
  if (character) {
    const { id, name, original } = character;
    if (
      typeof id !== 'string' ||
      !/^c\d+$/i.test(id) ||
      typeof name !== 'string' ||
      !isNullableString(original)
    ) {
      return null;
    }
    let decodedImage: NonNullable<VndbQuote['character']>['image'];
    if (character.image === null) {
      decodedImage = null;
    } else if (character.image !== undefined) {
      const image = asJsonRecord(character.image);
      if (!image) return null;
      const localPath = image.local_path;
      if (!(localPath === undefined || isNullableString(localPath))) return null;
      decodedImage = localPath === undefined ? {} : { local_path: localPath };
    }
    decodedCharacter = {
      id: id.toLowerCase(),
      name,
      original,
      ...(decodedImage === undefined ? {} : { image: decodedImage }),
    };
  }
  return {
    id: row.id,
    quote: row.quote,
    score: row.score,
    vn: decodedVn,
    character: decodedCharacter,
  };
}

/**
 * Decode a per-VN quote listing response.
 *
 * @param value Parsed local API payload.
 * @returns Safe quote rows, or `null` for malformed input.
 */
export function decodeQuotesResponse(value: unknown): VndbQuote[] | null {
  const quotes = asJsonRecord(value)?.quotes;
  if (!Array.isArray(quotes) || quotes.length > MAX_QUOTES) return null;
  const out: VndbQuote[] = [];
  for (const quote of quotes) {
    const decoded = decodeQuote(quote);
    if (!decoded) return null;
    out.push(decoded);
  }
  return out;
}

/**
 * Decode the random-quote response consumed by the footer.
 *
 * @param value Parsed local API payload.
 * @returns Safe quote or `null` when the response is malformed.
 */
export function decodeRandomQuoteResponse(value: unknown): VndbQuote | null | undefined {
  const row = asJsonRecord(value);
  if (!row || !(row.source === 'all' || row.source === 'mine')) return undefined;
  if (row.quote === null) return null;
  return decodeQuote(row.quote) ?? undefined;
}
