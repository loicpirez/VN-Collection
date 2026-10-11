/**
 * Compute the median of independently populated playtime sources.
 * Invalid, non-positive and absent values do not participate. Even-sized
 * samples retain the average of their two middle values without rounding.
 * @param sources Source durations in minutes.
 * @returns Median minutes, or null when no valid source is available.
 */
export function medianPlaytime(...sources: ReadonlyArray<number | null | undefined>): number | null {
  const values = sources.filter(
    (value): value is number => typeof value === 'number' && Number.isFinite(value) && value > 0,
  ).sort((left, right) => left - right);
  if (values.length === 0) return null;
  const middle = Math.floor(values.length / 2);
  return values.length % 2 === 1 ? values[middle] : (values[middle - 1] + values[middle]) / 2;
}
