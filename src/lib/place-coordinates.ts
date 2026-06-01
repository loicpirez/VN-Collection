export interface CoordinatePair {
  lat?: number | null;
  lng?: number | null;
}

/**
 * Return whether a coordinate pair is complete and finite.
 *
 * @param pair Coordinates to validate.
 * @returns True when both latitude and longitude are finite numbers.
 */
export function hasFiniteCoordinates<T extends CoordinatePair>(
  pair: T,
): pair is T & { lat: number; lng: number } {
  return (
    typeof pair.lat === 'number' &&
    Number.isFinite(pair.lat) &&
    typeof pair.lng === 'number' &&
    Number.isFinite(pair.lng)
  );
}

/**
 * Normalize an optional persisted coordinate.
 *
 * @param value Coordinate value received from an internal caller.
 * @returns The finite value, or null when the value cannot be mapped.
 */
export function normalizeOptionalCoordinate(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}
