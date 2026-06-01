export interface EgsCoverRawRow {
  vn_id: string | null;
  banner_url: string | null;
  surugaya_1: string | null;
  dmm: string | null;
  dlsite_id: string | null;
  gyutto_id: string | null;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asNullableString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

/**
 * Decode the EGS fields used for cover resolution.
 *
 * @param value Parsed EGS snapshot or upstream raw payload.
 * @param vnId Preferred linked VN id from the local row.
 * @returns A cover snapshot containing only nullable strings.
 */
export function decodeEgsCoverRaw(value: unknown, vnId: string | null = null): EgsCoverRawRow {
  const row = asRecord(value);
  return {
    vn_id: asNullableString(vnId) ?? asNullableString(row.vn_id) ?? asNullableString(row.vndb_id),
    banner_url: asNullableString(row.banner_url),
    surugaya_1: asNullableString(row.surugaya_1),
    dmm: asNullableString(row.dmm),
    dlsite_id: asNullableString(row.dlsite_id),
    gyutto_id: asNullableString(row.gyutto_id),
  };
}

/**
 * Decode a stored EGS cover snapshot without throwing on corrupt JSON.
 *
 * @param raw Stored JSON string.
 * @param vnId Preferred linked VN id from the local row.
 * @returns A cover snapshot containing only nullable strings.
 */
export function decodeEgsCoverRawJson(raw: string | null | undefined, vnId: string | null = null): EgsCoverRawRow {
  if (!raw) return decodeEgsCoverRaw(null, vnId);
  try {
    return decodeEgsCoverRaw(JSON.parse(raw), vnId);
  } catch {
    return decodeEgsCoverRaw(null, vnId);
  }
}

/**
 * Decode one cached EGS cover redirect.
 *
 * @param value Parsed cache payload.
 * @returns A cached URL, an intentional negative-cache `null`, or `undefined` for malformed payloads.
 */
export function decodeCachedEgsCoverUrl(value: unknown): string | null | undefined {
  const row = asRecord(value);
  return typeof row.url === 'string' || row.url === null ? row.url : undefined;
}
