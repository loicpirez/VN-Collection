export interface CoordinatePair {
  lat?: number | null;
  lng?: number | null;
}

/**
 * Return whether a coordinate pair is complete, finite, and geographically valid.
 *
 * @param pair Coordinates to validate.
 * @returns True when latitude is within [-90, 90] and longitude is within [-180, 180].
 */
export function hasFiniteCoordinates<T extends CoordinatePair>(
  pair: T,
): pair is T & { lat: number; lng: number } {
  return (
    typeof pair.lat === 'number' &&
    Number.isFinite(pair.lat) &&
    pair.lat >= -90 &&
    pair.lat <= 90 &&
    typeof pair.lng === 'number' &&
    Number.isFinite(pair.lng) &&
    pair.lng >= -180 &&
    pair.lng <= 180
  );
}

/**
 * Normalize an optional persisted coordinate.
 *
 * @param value Coordinate value received from an internal caller.
 * @param axis Geographic axis used to enforce the legal range.
 * @returns The valid value, or null when the value cannot be mapped.
 */
export function normalizeOptionalCoordinate(
  value: number | null | undefined,
  axis: 'lat' | 'lng',
): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  if (axis === 'lat') return value >= -90 && value <= 90 ? value : null;
  return value >= -180 && value <= 180 ? value : null;
}
