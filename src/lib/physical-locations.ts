/** Normalize user-provided physical storage labels for persisted collection data. */
export function normalizePhysicalLocations(values: readonly unknown[]): string[] {
  return values
    .map((value) => (typeof value === 'string' ? value.trim() : ''))
    .filter((value): value is string => value.length > 0)
    .slice(0, 32)
    .map((value) => value.slice(0, 200));
}

/** Decode persisted JSON locations, with compatibility for legacy comma-separated text. */
export function parsePhysicalLocations(value: string | null | undefined): string[] {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? normalizePhysicalLocations(parsed) : [];
  } catch {
    return normalizePhysicalLocations(value.split(','));
  }
}

/** Serialize modern arrays or legacy comma-separated text into canonical JSON storage. */
export function serializePhysicalLocations(value: unknown): string | null {
  if (value == null) return null;
  const entries = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value.split(',')
      : [];
  const normalized = normalizePhysicalLocations(entries);
  return normalized.length > 0 ? JSON.stringify(normalized) : null;
}
