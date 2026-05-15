import 'server-only';
import { db, getAppSetting, updateCollection, type CollectionPatch } from './db';
import { fetchEgsUserReviews } from './erogamescape';
import { finishJob, recordError, startJob, tickJob } from './download-status';

/**
 * EGS → local sync. Symmetric to the Steam sync flow: pull the user's
 * personal entries from EGS (userreview table for their username), join
 * against egs_game.vn_id to find the local VN, then surface playtime /
 * score updates as suggestions the user explicitly approves.
 *
 * Writes only happen via `applyEgsSuggestions`. The compute step is a
 * pure read so the user can audit before pushing anything into local DB.
 */

export interface EgsSuggestion {
  vn_id: string;
  vn_title: string;
  egs_id: number;
  egs_gamename: string;
  /** Local minutes already in collection.playtime_minutes. */
  local_minutes: number;
  /** EGS-reported minutes (total_play_time_hours × 60). */
  egs_minutes: number | null;
  /** Local user rating on 10-100 scale (null = not voted). */
  local_rating: number | null;
  /** EGS user score on the same 10-100 scale. */
  egs_score: number | null;
  egs_finish_date: string | null;
  egs_start_date: string | null;
}

/**
 * Pull the EGS userreview rows for the configured username and project
 * them against local collection rows. Returns one suggestion per VN where
 * EGS has data that differs from local (greater playtime, score we don't
 * have, dates we don't have).
 */
export async function computeEgsSuggestions(): Promise<{
  needsConfig: boolean;
  suggestions: EgsSuggestion[];
}> {
  const username = (getAppSetting('egs_username') ?? '').trim();
  if (!username) return { needsConfig: true, suggestions: [] };

  const rows = await fetchEgsUserReviews(username);
  if (rows.length === 0) return { needsConfig: false, suggestions: [] };

  // Chunk both IN-lookups so a user with thousands of EGS reviews
  // doesn't bump `SQLITE_MAX_VARIABLE_NUMBER`, matching the
  // convention in `getEgsForVns` / `listSeriesForVnsMany`.
  const CHUNK = 500;
  const egsIds = rows.map((r) => r.egs_id);
  const linked: { vn_id: string; egs_id: number }[] = [];
  for (let i = 0; i < egsIds.length; i += CHUNK) {
    const chunk = egsIds.slice(i, i + CHUNK);
    const placeholders = chunk.map(() => '?').join(',');
    linked.push(
      ...(db
        .prepare(`SELECT vn_id, egs_id FROM egs_game WHERE egs_id IN (${placeholders})`)
        .all(...chunk) as { vn_id: string; egs_id: number }[]),
    );
  }
  const byEgsId = new Map(linked.map((r) => [r.egs_id, r.vn_id]));

  const vnIds = Array.from(new Set(linked.map((r) => r.vn_id)));
  if (vnIds.length === 0) return { needsConfig: false, suggestions: [] };

  type ColRow = {
    vn_id: string;
    playtime_minutes: number | null;
    user_rating: number | null;
    title: string;
    started_date: string | null;
    finished_date: string | null;
  };
  const colRows: ColRow[] = [];
  for (let i = 0; i < vnIds.length; i += CHUNK) {
    const chunk = vnIds.slice(i, i + CHUNK);
    const placeholders = chunk.map(() => '?').join(',');
    colRows.push(
      ...(db
        .prepare(`
          SELECT c.vn_id, c.playtime_minutes, c.user_rating, v.title, c.started_date, c.finished_date
          FROM collection c
          JOIN vn v ON v.id = c.vn_id
          WHERE c.vn_id IN (${placeholders})
        `)
        .all(...chunk) as ColRow[]),
    );
  }
  const local = new Map(colRows.map((r) => [r.vn_id, r]));

  const suggestions: EgsSuggestion[] = [];
  for (const r of rows) {
    const vnId = byEgsId.get(r.egs_id);
    if (!vnId) continue;
    const localItem = local.get(vnId);
    if (!localItem) continue;
    const egsMinutes = r.total_play_time_hours != null ? Math.round(r.total_play_time_hours * 60) : null;
    const localMinutes = localItem.playtime_minutes ?? 0;
    const hasPlaytimeJump = egsMinutes != null && egsMinutes > localMinutes;
    const hasNewScore = r.tokuten != null && r.tokuten > 0 && localItem.user_rating == null;
    const hasNewDate = !!(r.start_date && !localItem.started_date) || !!(r.finish_date && !localItem.finished_date);
    if (!hasPlaytimeJump && !hasNewScore && !hasNewDate) continue;
    suggestions.push({
      vn_id: vnId,
      vn_title: localItem.title,
      egs_id: r.egs_id,
      egs_gamename: r.gamename,
      local_minutes: localMinutes,
      egs_minutes: egsMinutes,
      local_rating: localItem.user_rating,
      egs_score: r.tokuten,
      egs_finish_date: r.finish_date,
      egs_start_date: r.start_date,
    });
  }

  return { needsConfig: false, suggestions };
}

/**
 * Apply the supplied EGS suggestions: bump playtime to the EGS value when
 * it's higher, fill the rating if local is empty, fill the start/finish
 * dates if local is empty. Activity log captures each change.
 */
export async function applyEgsSuggestions(picks: string[]): Promise<{ applied: number }> {
  const { suggestions } = await computeEgsSuggestions();
  const byVn = new Map(suggestions.map((s) => [s.vn_id, s]));
  const job = startJob('egs-sync', `Applying ${picks.length} EGS update(s)`, picks.length);
  let applied = 0;
  for (const vnId of picks) {
    const s = byVn.get(vnId);
    if (!s) {
      recordError(job.id, vnId, 'suggestion not found');
      tickJob(job.id);
      continue;
    }
    const patch: CollectionPatch = {};
    if (s.egs_minutes != null && s.egs_minutes > s.local_minutes) {
      patch.playtime_minutes = s.egs_minutes;
    }
    if (s.egs_score != null && s.egs_score > 0 && s.local_rating == null) {
      patch.user_rating = s.egs_score;
    }
    if (s.egs_start_date) patch.started_date = s.egs_start_date;
    if (s.egs_finish_date) patch.finished_date = s.egs_finish_date;
    if (Object.keys(patch).length === 0) {
      tickJob(job.id);
      continue;
    }
    try {
      updateCollection(vnId, patch);
      applied += 1;
    } catch (e) {
      recordError(job.id, vnId, (e as Error).message);
    }
    tickJob(job.id);
  }
  finishJob(job.id);
  return { applied };
}
