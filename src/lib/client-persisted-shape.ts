import { asJsonRecord, parseJsonArray, parseJsonRecord } from './json-shape';
import { isVndbVnId, normalizeVnId } from './vn-id-shape';

/** Named identifier row persisted in presentation metadata. */
export interface NamedIdRow {
  id: string;
  name: string;
}

/** Candidate row persisted for VNDB remapping controls. */
export interface VndbCandidateRow {
  id: string;
  title: string;
  alttitle: string | null;
  released: string | null;
}

/**
 * Parse one browser-persisted preference record.
 *
 * @param raw Persisted JSON text.
 * @returns Parsed record, or an empty record for absent or malformed input.
 */
export function parseClientPreferenceRecord(raw: string | null): Record<string, unknown> {
  return parseJsonRecord(raw) ?? {};
}

/**
 * Parse one browser-persisted boolean map.
 *
 * @param raw Persisted JSON text.
 * @returns Record containing only boolean entries.
 */
export function parseClientBooleanMap(raw: string | null): Record<string, boolean> {
  const record = parseJsonRecord(raw);
  if (!record) return {};
  const out: Record<string, boolean> = {};
  for (const [key, value] of Object.entries(record)) {
    if (typeof value === 'boolean') out[key] = value;
  }
  return out;
}

/**
 * Parse a persisted list of display strings.
 *
 * @param raw Persisted JSON text.
 * @returns Valid string rows, excluding malformed siblings.
 */
export function parseClientStringList(raw: string | null): string[] {
  return parseJsonArray(raw).filter((value): value is string => typeof value === 'string');
}

/**
 * Parse persisted named identifier rows.
 *
 * @param raw Persisted JSON text.
 * @returns Structurally valid rows, excluding malformed siblings.
 */
export function parseNamedIdRows(raw: string | null): NamedIdRow[] {
  const out: NamedIdRow[] = [];
  for (const value of parseJsonArray(raw)) {
    const record = asJsonRecord(value);
    if (!record || typeof record.id !== 'string' || typeof record.name !== 'string') continue;
    out.push({ id: record.id, name: record.name });
  }
  return out;
}

/**
 * Parse persisted VNDB candidate rows.
 *
 * @param raw Persisted JSON text.
 * @returns Structurally valid VNDB rows, excluding malformed siblings.
 */
export function parseVndbCandidateRows(raw: string | null): VndbCandidateRow[] {
  const out: VndbCandidateRow[] = [];
  for (const value of parseJsonArray(raw)) {
    const record = asJsonRecord(value);
    if (
      !record ||
      typeof record.id !== 'string' ||
      !isVndbVnId(record.id) ||
      typeof record.title !== 'string' ||
      !(record.alttitle === null || typeof record.alttitle === 'string') ||
      !(record.released === null || typeof record.released === 'string')
    ) {
      continue;
    }
    out.push({
      id: normalizeVnId(record.id),
      title: record.title,
      alttitle: record.alttitle,
      released: record.released,
    });
  }
  return out;
}
