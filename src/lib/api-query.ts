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
