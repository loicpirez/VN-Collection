import 'server-only';
import { db } from './db';

export interface ReadingSpeedProfile {
  /** How many `completed` entries were used to compute the multiplier. */
  sampleSize: number;
  /**
   * Personal speed multiplier vs VNDB community average. <1 means you read
   * faster than average, >1 slower. Null when sampleSize < 3 (not enough data).
   */
  multiplierVsVndb: number | null;
  /** Same against EGS — independent because the EGS audience plays differently. */
  multiplierVsEgs: number | null;
  /** Median personal play time across the sample, in minutes (sanity hint). */
  medianMyMinutes: number | null;
}

interface SampleRow {
  playtime: number;
  vndb: number | null;
  egs: number | null;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Build a personal reading-speed profile from completed VNs that have a
 * recorded playtime and at least one external reference (VNDB or EGS).
 *
 * "Multiplier" is the median of (personal / reference) ratios — median is
 * preferred over mean because a single binge or skip session would otherwise
 * dominate. Returned null below a 3-sample threshold so we don't surface a
 * confident number from a single data point.
 */
export function getReadingSpeedProfile(): ReadingSpeedProfile {
  const rows = db
    .prepare(`
      SELECT c.playtime_minutes AS playtime, v.length_minutes AS vndb,
             e.playtime_median_minutes AS egs
      FROM collection c
      JOIN vn v ON v.id = c.vn_id
      LEFT JOIN egs_game e ON e.vn_id = c.vn_id
      WHERE c.status = 'completed'
        AND c.playtime_minutes > 0
        AND (v.length_minutes IS NOT NULL OR e.playtime_median_minutes IS NOT NULL)
    `)
    .all() as SampleRow[];

  const vndbRatios: number[] = [];
  const egsRatios: number[] = [];
  const myMinutes: number[] = [];
  for (const r of rows) {
    myMinutes.push(r.playtime);
    if (r.vndb && r.vndb > 0) vndbRatios.push(r.playtime / r.vndb);
    if (r.egs && r.egs > 0) egsRatios.push(r.playtime / r.egs);
  }

  return {
    sampleSize: rows.length,
    multiplierVsVndb: vndbRatios.length >= 3 ? median(vndbRatios) : null,
    multiplierVsEgs: egsRatios.length >= 3 ? median(egsRatios) : null,
    medianMyMinutes: median(myMinutes),
  };
}

/**
 * Predict how long the current user will take to read a specific VN, given
 * the community references and the profile above.
 *
 * Strategy: prefer the VNDB multiplier (more sample data globally), fall
 * back to EGS for VNs with only an EGS reference. Returns null when neither
 * a reference nor a profile is available.
 */
export function predictReadingMinutes(
  vndbLength: number | null,
  egsLength: number | null,
  profile: ReadingSpeedProfile,
): number | null {
  if (vndbLength && vndbLength > 0 && profile.multiplierVsVndb != null) {
    return Math.round(vndbLength * profile.multiplierVsVndb);
  }
  if (egsLength && egsLength > 0 && profile.multiplierVsEgs != null) {
    return Math.round(egsLength * profile.multiplierVsEgs);
  }
  return null;
}
