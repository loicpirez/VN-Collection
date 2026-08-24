/** Result used by optional query values: absent, invalid, or a validated value. */
export type OptionalQueryValue<T> = T | undefined | null;

interface QueryIntegerOptions {
  /** Lowest accepted integer, inclusive. */
  minimum?: number;
  /** Highest accepted integer, inclusive. */
  maximum?: number;
  /** Clamp values above the maximum instead of rejecting them. */
  clampMaximum?: boolean;
}

interface QueryNumberOptions {
  /** Lowest accepted finite value, inclusive. */
  minimum?: number;
  /** Highest accepted finite value, inclusive. */
  maximum?: number;
}

/**
 * Parse an optional decimal integer from a URL parameter.
 *
 * @param raw Raw URL value, or null when the parameter is absent.
 * @param options Inclusive bounds and overflow behavior.
 * @returns Undefined for absence, null for invalid input, or a safe integer.
 */
export function parseOptionalQueryInteger(
  raw: string | null,
  options: QueryIntegerOptions = {},
): OptionalQueryValue<number> {
  if (raw == null || raw === '') return undefined;
  if (!/^\d+$/.test(raw)) return null;
  const parsed = Number(raw);
  const minimum = options.minimum ?? 0;
  const maximum = options.maximum ?? Number.MAX_SAFE_INTEGER;
  if (!Number.isSafeInteger(parsed) || parsed < minimum) return null;
  if (parsed > maximum) return options.clampMaximum === false ? null : maximum;
  return parsed;
}

/**
 * Parse an optional finite number from a URL parameter.
 *
 * @param raw Raw URL value, or null when the parameter is absent.
 * @param options Inclusive numeric bounds.
 * @returns Undefined for absence, null for invalid input, or a finite number.
 */
export function parseOptionalQueryNumber(
  raw: string | null,
  options: QueryNumberOptions = {},
): OptionalQueryValue<number> {
  if (raw == null || raw === '') return undefined;
  const parsed = Number(raw);
  const minimum = options.minimum ?? -Number.MAX_VALUE;
  const maximum = options.maximum ?? Number.MAX_VALUE;
  if (!Number.isFinite(parsed) || parsed < minimum || parsed > maximum) return null;
  return parsed;
}

/**
 * Parse the canonical optional query boolean representation.
 *
 * @param raw Raw URL value using `1` or `0`.
 * @returns Undefined for absence, null for invalid input, or a boolean.
 */
export function parseOptionalQueryBoolean(raw: string | null): OptionalQueryValue<boolean> {
  if (raw == null || raw === '') return undefined;
  if (raw === '1') return true;
  if (raw === '0') return false;
  return null;
}

/**
 * Select a query enum value from a readonly canonical list.
 *
 * @param raw Raw URL value.
 * @param values Canonical accepted values.
 * @param fallback Value returned for absent or invalid input.
 * @returns The validated enum value or the fallback.
 */
export function parseQueryEnum<T extends string>(
  raw: string | null,
  values: readonly T[],
  fallback: T,
): T {
  return raw !== null && (values as readonly string[]).includes(raw) ? raw as T : fallback;
}
