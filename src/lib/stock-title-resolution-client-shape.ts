import { asJsonRecord } from './json-shape';
import { isValidVnId, normalizeVnId } from './vn-id-shape';

/** One VN match returned by stock title resolution. */
export interface StockTitleResolution {
  vnId: string;
  title: string;
}

/**
 * Decode a stock title-resolution response before related-game links render.
 *
 * @param value Parsed local API payload.
 * @returns Safe title-to-match map, or `null` for malformed input.
 */
export function decodeStockTitleResolutionMap(
  value: unknown,
): Record<string, StockTitleResolution | null> | null {
  const record = asJsonRecord(value);
  if (!record) return null;
  const entries = Object.entries(record);
  if (entries.length > 50) return null;

  const out: Record<string, StockTitleResolution | null> = Object.create(null) as Record<
    string,
    StockTitleResolution | null
  >;
  for (const [query, rawMatch] of entries) {
    if (!query) return null;
    if (rawMatch === null) {
      out[query] = null;
      continue;
    }
    const match = asJsonRecord(rawMatch);
    if (
      !match ||
      typeof match.vnId !== 'string' ||
      !isValidVnId(match.vnId) ||
      typeof match.title !== 'string'
    ) {
      return null;
    }
    out[query] = {
      vnId: normalizeVnId(match.vnId),
      title: match.title,
    };
  }
  return out;
}
