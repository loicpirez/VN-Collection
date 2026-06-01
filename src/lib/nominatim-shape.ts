import { asJsonRecord } from './json-shape';
import { hasFiniteCoordinates } from './place-coordinates';

const MAX_NOMINATIM_RESULTS = 20;

/** Safe geocoding row consumed by map search surfaces. */
export interface NominatimResult {
  display_name: string;
  lat: string;
  lon: string;
}

/**
 * Decode the bounded Nominatim search response used by map controls.
 *
 * @param value Parsed upstream payload.
 * @returns Valid geocoding rows, or `null` for a malformed envelope.
 */
export function decodeNominatimResults(value: unknown): NominatimResult[] | null {
  if (!Array.isArray(value) || value.length > MAX_NOMINATIM_RESULTS) return null;

  const results: NominatimResult[] = [];
  for (const row of value) {
    const record = asJsonRecord(row);
    if (
      !record ||
      typeof record.display_name !== 'string' ||
      typeof record.lat !== 'string' ||
      typeof record.lon !== 'string' ||
      !hasFiniteCoordinates({ lat: Number(record.lat), lng: Number(record.lon) })
    ) {
      continue;
    }
    results.push({
      display_name: record.display_name,
      lat: record.lat,
      lon: record.lon,
    });
  }
  return results;
}
