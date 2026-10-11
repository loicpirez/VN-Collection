/**
 * Canonical four-source playtime average used by both database backends.
 * Zero and null values are absent sources; the result is null when no source
 * is populated. Keep this expression shared so SQLite and PostgreSQL cannot
 * silently rank the same collection differently.
 */
export const COMBINED_PLAYTIME_SORT_SQL =
  '((CASE WHEN v.length_minutes > 0 THEN v.length_minutes ELSE 0 END) + ' +
  '  (CASE WHEN e.playtime_median_minutes > 0 THEN e.playtime_median_minutes ELSE 0 END) + ' +
  '  (CASE WHEN c.playtime_minutes > 0 THEN c.playtime_minutes ELSE 0 END) + ' +
  '  (CASE WHEN c.ai_playtime_minutes > 0 THEN c.ai_playtime_minutes ELSE 0 END)) * 1.0 ' +
  '/ NULLIF(' +
  '  (CASE WHEN v.length_minutes > 0 THEN 1 ELSE 0 END) + ' +
  '  (CASE WHEN e.playtime_median_minutes > 0 THEN 1 ELSE 0 END) + ' +
  '  (CASE WHEN c.playtime_minutes > 0 THEN 1 ELSE 0 END) + ' +
  '  (CASE WHEN c.ai_playtime_minutes > 0 THEN 1 ELSE 0 END)' +
  ', 0)';
