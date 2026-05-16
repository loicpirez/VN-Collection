import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { startJob, tickJob, finishJob, recordError } from '@/lib/download-status';
import { fetchEgsAnticipated } from '@/lib/erogamescape';
import { getGlobalStats, getAuthInfo, getSchema, searchTags, searchTraits } from '@/lib/vndb';
import { fetchAllUpcomingFromVndb, fetchUpcomingForCollection } from '@/lib/upcoming';
import { requireLocalhostOrToken } from '@/lib/auth-gate';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 300;

/**
 * `getAuthInfo` may throw when the VNDB token is missing or VNDB is
 * unreachable. We swallow both into `null` so the rest of the
 * refresh fan-out still runs. Named function instead of an inline
 * `async () => { try { … } catch { return null; } }` so it's easy
 * to spot during review.
 */
async function authInfoSafe(): Promise<unknown> {
  try {
    return await getAuthInfo();
  } catch {
    return null;
  }
}

/**
 * One-shot refresh of every page-level cache that isn't tied to a
 * specific VN. Triggered by the "Download all" flow and by the
 * <RefreshButton/> on browse / discovery pages so the user doesn't
 * have to wait on an organic re-fetch when they visit those pages
 * for the first time after a long break.
 *
 * Each task is a separate job entry in the global download panel so
 * progress is visible alongside the per-VN fan-outs.
 */
export async function POST(req: NextRequest) {
  // Destructive cache-bust + heavy fan-out — gate at the loopback /
  // admin-token boundary so a LAN attacker can't denial-of-cache us.
  const denied = requireLocalhostOrToken(req);
  if (denied) return denied;

  // First sweep: delete every cache row this refresh is supposed to
  // re-populate. Without this step the next call to getGlobalStats() /
  // fetchEgsAnticipated() / fetchAllUpcomingFromVndb() would just hit
  // the in-DB cache and return the same fetched_at — the refresh
  // would feel like a no-op (which is what the user was seeing).
  // Only bust the page-level caches this route actually repopulates
  // below. Earlier versions also wiped `% /producer:%` and
  // `% /release:%`, but the per-producer pagination caches
  // (`POST /vn:producer:p17|...`, `POST /release:producer:p17|...`)
  // are owned by `fetchProducerAssociations` and get their own
  // per-page refresh button. Wiping them here meant every
  // `/producer/[id]` tab incurred a multi-second blocking re-fetch
  // on the next visit, which is what a "global refresh" should
  // not do.
  const bust = db.prepare(
    "DELETE FROM vndb_cache WHERE " +
    "cache_key LIKE 'egs:cover-resolved:%' OR " +
    "cache_key LIKE 'anticipated:%' OR " +
    "cache_key LIKE '% /stats|%' OR " +
    "cache_key LIKE '% /schema|%' OR " +
    "cache_key LIKE '% /authinfo|%' OR " +
    "cache_key LIKE '% /release|%' OR " +
    "cache_key LIKE '% /release:upcoming|%' OR " +
    "cache_key LIKE '% /release:upcoming-all|%' OR " +
    "cache_key LIKE '% /producer|%' OR " +
    "cache_key LIKE '% /tag|%' OR " +
    "cache_key LIKE '% /trait|%'",
  );
  const tasks: Array<{ name: string; run: () => Promise<unknown> }> = [
    { name: 'Cache rows (bust)', run: async () => { bust.run(); } },
    { name: 'EGS anticipated (top 100)', run: () => fetchEgsAnticipated(100) },
    { name: 'VNDB stats',                run: () => getGlobalStats() },
    { name: 'VNDB schema',                run: () => getSchema() },
    { name: 'VNDB authinfo',              run: authInfoSafe },
    { name: 'Upcoming · collection',      run: () => fetchUpcomingForCollection() },
    { name: 'Upcoming · all VNDB (top 200)', run: () => fetchAllUpcomingFromVndb(200) },
    // Re-populate the default tag/trait searches so the freshness chip
    // on /tags and /traits reads "just now" after a refresh instead of
    // hanging on the now-deleted older value.
    { name: 'Tags · default search',      run: () => searchTags('', { results: 60 }) },
    { name: 'Traits · default search',    run: () => searchTraits('', { results: 60 }) },
  ];

  // Tagged `cache-refresh` (not `vndb-pull`) because this fan-out also
  // refreshes EGS / page-level caches — calling it a "VNDB Pull" was
  // confusing on /upcoming?tab=anticipated, where the user only sees EGS
  // data being updated.
  const job = startJob('cache-refresh', 'Global refresh', tasks.length, null);

  let done = 0;
  let failed = 0;
  for (const t of tasks) {
    try {
      await t.run();
      done++;
    } catch (e) {
      failed++;
      recordError(job.id, t.name, (e as Error).message);
    } finally {
      tickJob(job.id);
    }
  }
  finishJob(job.id);

  return NextResponse.json({ ok: true, done, failed, total: tasks.length });
}
