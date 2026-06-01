import { asJsonRecord } from './json-shape';
import { isValidVnId, normalizeVnId } from './vn-id-shape';

/** Local collection title match with cover columns for picker surfaces. */
export interface CollectionFindMatch {
  id: string;
  title: string;
  alttitle: string | null;
  image_url: string | null;
  image_thumb: string | null;
  local_image: string | null;
  local_image_thumb: string | null;
  image_sexual: number | null;
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === 'string';
}

function isNullableFiniteNumber(value: unknown): value is number | null {
  return value === null || (typeof value === 'number' && Number.isFinite(value));
}

/**
 * Decode local collection title matches before autocomplete surfaces render.
 *
 * @param value Parsed local API payload.
 * @returns Safe collection matches, or `null` for malformed input.
 */
export function decodeCollectionFindMatches(value: unknown): CollectionFindMatch[] | null {
  const matches = asJsonRecord(value)?.matches;
  if (!Array.isArray(matches) || matches.length > 100) return null;
  const out: CollectionFindMatch[] = [];
  for (const value of matches) {
    const row = asJsonRecord(value);
    if (
      !row ||
      typeof row.id !== 'string' ||
      !isValidVnId(row.id) ||
      typeof row.title !== 'string' ||
      !isNullableString(row.alttitle) ||
      !isNullableString(row.image_url) ||
      !isNullableString(row.image_thumb) ||
      !isNullableString(row.local_image) ||
      !isNullableString(row.local_image_thumb) ||
      !isNullableFiniteNumber(row.image_sexual)
    ) {
      return null;
    }
    out.push({
      id: normalizeVnId(row.id),
      title: row.title,
      alttitle: row.alttitle,
      image_url: row.image_url,
      image_thumb: row.image_thumb,
      local_image: row.local_image,
      local_image_thumb: row.local_image_thumb,
      image_sexual: row.image_sexual,
    });
  }
  return out;
}
