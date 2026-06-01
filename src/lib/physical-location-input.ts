import type { ValidationResult } from '@/lib/input-validators';

const MAX_LOCATIONS = 32;
const MAX_LOCATION_LENGTH = 200;

/**
 * Validate physical-location annotations without silently truncating operator
 * input. The database serializer keeps its defensive limits for internal
 * callers, while HTTP mutations reject values that would lose information.
 *
 * @param value Raw JSON body field.
 * @returns Trimmed, deduplicated location tags.
 */
export function parsePhysicalLocations(value: unknown): ValidationResult<string[]> {
  if (value == null) return { ok: true, value: [] };
  let raw: string[];
  if (Array.isArray(value)) {
    if (!value.every((entry) => typeof entry === 'string')) {
      return { ok: false, error: 'physical_location entries must be strings' };
    }
    raw = value;
  } else if (typeof value === 'string') {
    raw = value.split(',');
  } else {
    return { ok: false, error: 'physical_location must be array or string' };
  }
  const trimmed = raw.map((entry) => entry.trim()).filter(Boolean);
  if (trimmed.length > MAX_LOCATIONS) {
    return { ok: false, error: `physical_location accepts at most ${MAX_LOCATIONS} entries` };
  }
  if (trimmed.some((entry) => entry.length > MAX_LOCATION_LENGTH)) {
    return { ok: false, error: `physical_location entries must be at most ${MAX_LOCATION_LENGTH} characters` };
  }
  return { ok: true, value: [...new Set(trimmed)] };
}
