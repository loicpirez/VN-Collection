/**
 * Canonical four-source playtime median used by both database backends.
 * Zero and null values are absent sources; the result is null when no source
 * is populated. Keep this expression shared so SQLite and PostgreSQL cannot
 * silently rank the same collection differently.
 */
export const COMBINED_PLAYTIME_SORT_SQL = `(
  SELECT AVG(source_minutes)
  FROM (
    SELECT source_minutes,
      ROW_NUMBER() OVER (ORDER BY source_minutes) AS source_rank,
      COUNT(*) OVER () AS source_count
    FROM (
      SELECT v.length_minutes AS source_minutes
      UNION ALL SELECT e.playtime_median_minutes
      UNION ALL SELECT c.playtime_minutes
      UNION ALL SELECT c.ai_playtime_minutes
    ) AS playtime_sources
    WHERE source_minutes > 0
  ) AS ranked_sources
  WHERE source_rank IN ((source_count + 1) / 2, (source_count + 2) / 2)
)`;
