/**
 * Narrow one decoded JSON value to a plain object.
 *
 * @param value Decoded JSON value.
 * @returns The object value, or `null` for arrays and primitives.
 */
export function asJsonRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/**
 * Decode a stored JSON object without throwing on malformed input.
 *
 * @param raw Stored JSON text.
 * @returns The decoded object, or `null` when input is absent or malformed.
 */
export function parseJsonRecord(raw: string | null | undefined): Record<string, unknown> | null {
  if (!raw) return null;
  try {
    return asJsonRecord(JSON.parse(raw));
  } catch {
    return null;
  }
}

/**
 * Decode a stored JSON array without throwing on malformed input.
 *
 * @param raw Stored JSON text.
 * @returns The decoded array, or an empty array when input is absent or malformed.
 */
export function parseJsonArray(raw: string | null | undefined): unknown[] {
  if (!raw) return [];
  try {
    const value: unknown = JSON.parse(raw);
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}
