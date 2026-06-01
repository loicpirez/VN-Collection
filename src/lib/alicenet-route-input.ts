import { validateSafeInt, type ValidationResult } from '@/lib/input-validators';

/**
 * Validate an optional AliceNet Kobe batch size.
 *
 * @param value Raw JSON body field.
 * @param fallback Default batch size when the field is omitted.
 * @param max Maximum batch size supported by the route.
 * @returns A validated integer batch size or a field-scoped error.
 */
export function parseKobeBatch(
  value: unknown,
  fallback: number,
  max: number,
): ValidationResult<number> {
  if (value === undefined) return { ok: true, value: fallback };
  return validateSafeInt(value, { field: 'batch', min: 1, max });
}

/**
 * Validate an optional AliceNet Kobe run-start timestamp.
 *
 * @param value Raw JSON body field.
 * @returns A validated positive UTC-ms integer or `undefined` when omitted.
 */
export function parseKobeRunStartedAt(
  value: unknown,
): ValidationResult<number | undefined> {
  if (value === undefined) return { ok: true, value: undefined };
  return validateSafeInt(value, {
    field: 'run_started_at',
    min: 1,
    max: Number.MAX_SAFE_INTEGER,
  });
}

/**
 * Validate an optional AliceNet Kobe boolean control.
 *
 * @param value Raw JSON body field.
 * @param field Client-facing field name for errors.
 * @returns A strict boolean, or `false` when the field is omitted.
 */
export function parseKobeBoolean(
  value: unknown,
  field: string,
): ValidationResult<boolean> {
  if (value === undefined) return { ok: true, value: false };
  if (typeof value !== 'boolean') return { ok: false, error: `${field} must be boolean` };
  return { ok: true, value };
}
