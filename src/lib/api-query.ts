/**
 * Shared clamp helper for API query-string inputs. The previous flow had
 * each route reinvent `(sp.get('q') ?? '').slice(0, MAX)` with
 * locally-defined constants, so the same defensive cap drifted by 100
 * chars between two neighbouring routes. Centralising the
 * `null → '' → slice → trim` chain keeps every route consistent and
 * makes the cap easy to audit in one place.
 *
 * Returns the trimmed slice. Callers that want to preserve trailing
 * whitespace (rare) can call `.slice(0, max)` directly.
 */
export function clampQuery(raw: string | null | undefined, maxLen: number): string {
  if (typeof raw !== 'string') return '';
  return raw.slice(0, maxLen).trim();
}

/**
 * Parse an integer query-string control, clamp valid values to a bounded
 * range, and return a route-specific fallback for malformed values.
 *
 * @param raw Raw query-string value.
 * @param options Fallback and inclusive clamp bounds.
 * @returns A safe integer inside the requested range.
 */
export function parseBoundedQueryInteger(
  raw: string | null | undefined,
  options: { fallback: number; min: number; max: number },
): number {
  if (typeof raw !== 'string' || !/^-?\d+$/.test(raw)) return options.fallback;
  const parsed = Number(raw);
  if (!Number.isSafeInteger(parsed)) return options.fallback;
  return Math.max(options.min, Math.min(options.max, parsed));
}

/**
 * Parse an optional exact integer query-string control.
 *
 * @param raw Raw query-string value.
 * @returns The safe integer value, or `null` when omitted or malformed.
 */
export function parseOptionalQueryInteger(raw: string | null | undefined): number | null {
  if (typeof raw !== 'string' || !/^-?\d+$/.test(raw)) return null;
  const parsed = Number(raw);
  return Number.isSafeInteger(parsed) ? parsed : null;
}
