/** All recognised aspect-ratio bucket identifiers, ordered widest-to-narrowest with 'other' and 'unknown' at the tail. */
export const ASPECT_KEYS = ['4:3', '16:9', '16:10', '21:9', 'other', 'unknown'] as const;

/** Union of all valid aspect-ratio bucket strings. */
export type AspectKey = (typeof ASPECT_KEYS)[number];

/** Normalised pixel resolution extracted from a raw string or `[width, height]` tuple. */
export interface ResolutionValue {
  width: number;
  height: number;
}

function close(a: number, b: number, tolerance = 0.035): boolean {
  return Math.abs(a - b) <= tolerance;
}

/**
 * Map a pixel resolution to the nearest standard aspect-ratio bucket.
 *
 * @param width  Frame width in pixels (must be a finite positive number).
 * @param height Frame height in pixels (must be a finite positive number).
 * @returns The closest `AspectKey` bucket, or `'unknown'` when inputs are
 *          non-finite, zero, or negative.
 */
export function aspectKeyForResolution(width: number, height: number): AspectKey {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return 'unknown';
  }
  const ratio = width / height;
  if (close(ratio, 4 / 3)) return '4:3';
  if (close(ratio, 16 / 9)) return '16:9';
  if (close(ratio, 16 / 10)) return '16:10';
  if (close(ratio, 21 / 9, 0.06)) return '21:9';
  return 'other';
}

/**
 * Parse a raw resolution value from VNDB JSON into a `ResolutionValue`.
 *
 * Accepts:
 * - A `[width, height]` number tuple (VNDB `resolution` field shape).
 * - A `"WxH"` or `"W×H"` string (e.g. `"1920x1080"`).
 *
 * @param value The raw value to parse.
 * @returns A `ResolutionValue` with integer `width` and `height`, or `null`
 *          when the value is missing, malformed, or contains non-positive numbers.
 */
export function parseResolutionValue(value: unknown): ResolutionValue | null {
  if (Array.isArray(value) && value.length >= 2) {
    const [w, h] = value;
    return typeof w === 'number' && typeof h === 'number' && w > 0 && h > 0
      ? { width: Math.round(w), height: Math.round(h) }
      : null;
  }
  if (typeof value === 'string') {
    const match = value.match(/(\d{2,5})\s*[x×]\s*(\d{2,5})/i);
    if (!match) return null;
    return { width: Number(match[1]), height: Number(match[2]) };
  }
  return null;
}

/**
 * Type guard: returns `true` when `value` is a member of `ASPECT_KEYS`.
 *
 * @param value Any value to test.
 * @returns `true` if `value` is a valid `AspectKey`, `false` otherwise.
 */
export function isAspectKey(value: unknown): value is AspectKey {
  return typeof value === 'string' && (ASPECT_KEYS as readonly string[]).includes(value);
}

