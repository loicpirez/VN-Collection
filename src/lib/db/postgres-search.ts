/** Normalize user-entered text to the PostgreSQL search-key contract. */
export function normalizePostgresSearch(value: string): string {
  return value.normalize('NFKC').toLocaleLowerCase('und');
}

/** Escape PostgreSQL `LIKE` metacharacters while preserving literal input. */
export function escapePostgresLike(value: string): string {
  return value.replace(/[\\%_]/g, (character) => `\\${character}`);
}

/** Build a normalized, escaped substring pattern for parameterized `LIKE`. */
export function postgresContainsPattern(value: string): string {
  return `%${escapePostgresLike(normalizePostgresSearch(value))}%`;
}
