import { validateText, type ValidationResult } from '@/lib/input-validators';
import { safeHref } from '@/lib/safe-href';

/** Place categories accepted by the registry mutation routes. */
export const PLACE_KINDS = ['shop', 'chain', 'storage'] as const;

/** Persisted place-registry category. */
export type PlaceKind = (typeof PLACE_KINDS)[number];

/**
 * Validate an optional place-registry kind.
 *
 * @param value Raw JSON body value.
 * @returns The validated kind, or `undefined` when omitted.
 */
export function parseOptionalPlaceKind(value: unknown): ValidationResult<PlaceKind | undefined> {
  if (value === undefined) return { ok: true, value: undefined };
  if (typeof value !== 'string' || !PLACE_KINDS.includes(value as PlaceKind)) {
    return { ok: false, error: 'kind must be shop, chain, or storage' };
  }
  return { ok: true, value: value as PlaceKind };
}

/**
 * Validate optional place-registry text without silently discarding malformed
 * values. Empty strings and explicit null values clear the persisted field.
 *
 * @param value Raw JSON body value.
 * @param field Client-facing field name for errors.
 * @param max Maximum accepted character count.
 * @returns A trimmed string, `null` to clear, or `undefined` when omitted.
 */
export function parseOptionalPlaceText(
  value: unknown,
  field: string,
  max: number,
): ValidationResult<string | null | undefined> {
  if (value === undefined) return { ok: true, value: undefined };
  if (value === null) return { ok: true, value: null };
  const result = validateText(value, { field, max, allowEmpty: true });
  if (!result.ok) return result;
  return { ok: true, value: result.value || null };
}

/**
 * Validate and canonicalize an optional clickable place URL.
 *
 * @param value Raw JSON body value.
 * @returns A canonical HTTP(S) URL, `null` to clear, or `undefined` when omitted.
 */
export function parseOptionalPlaceUrl(
  value: unknown,
): ValidationResult<string | null | undefined> {
  const result = parseOptionalPlaceText(value, 'url', 2000);
  if (!result.ok || result.value == null) return result;
  const href = safeHref(result.value);
  if (!href) return { ok: false, error: 'url must be an HTTP(S) URL' };
  return { ok: true, value: href };
}
