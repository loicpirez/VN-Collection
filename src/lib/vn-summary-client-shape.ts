import { asJsonRecord } from './json-shape';

/**
 * Decode the title projected from a VN-detail response.
 *
 * @param value Parsed local VN API payload.
 * @returns VN title, or `null` for malformed input.
 */
export function decodeVnTitleResponse(value: unknown): string | null {
  const vn = asJsonRecord(asJsonRecord(value)?.vn);
  return vn && typeof vn.title === 'string' ? vn.title : null;
}
