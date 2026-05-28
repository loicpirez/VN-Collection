import { NextRequest, NextResponse } from 'next/server';
import { db, materializeReleaseMetaForCollectionVns } from '@/lib/db';
import { startJob, tickJob, finishJob, recordError, setJobCurrent } from '@/lib/download-status';
import { sanitizeUnknownError } from '@/lib/error-sanitize';
import { fetchEgsAnticipated, fetchEgsTopRanked } from '@/lib/erogamescape';
import { getGlobalStats, getAuthInfo, getSchema, searchTags, searchTraits } from '@/lib/vndb';
import { fetchVndbTopRanked } from '@/lib/top-ranked';
import { fetchAllUpcomingFromVndb, fetchUpcomingForCollection } from '@/lib/upcoming';
import { requireLocalhostOrToken } from '@/lib/auth-gate';
import { recordActivity } from '@/lib/activity';

import { isVndbVnId } from '@/lib/vn-id-shape';
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
export async function POST(req: NextRequest): Promise<NextResponse> {
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
  // (`POST /vn:producer:p90017|...`, `POST /release:producer:p90017|...`)
  // are owned by `fetchProducerAssociations` and get their own
  // per-page refresh button. Wiping them here meant every
  // `/producer/[id]` tab incurred a multi-second blocking re-fetch
  // on the next visit, which is what a "global refresh" should
  // not do.
  const BUST_PATTERNS: ReadonlyArray<string> = [
    'egs:cover-resolved:%',
    // Real EGS anticipated cache keys are `egs:anticipated:%` —
    // the previous `anticipated:%` pattern matched zero rows so
    // the global refresh silently left the /upcoming?tab=anticipated
    // cache stale up to 12h.
    'egs:anticipated:%',
    'egs:top-ranked:%',
    '% /stats|%',
    '% /schema|%',
    '% /authinfo|%',
    '% /release|%',
    '% /release:upcoming|%',
    '% /release:upcoming-all|%',
    '% /producer|%',
    '% /tag|%',
    '% /trait|%',
    '% /vn:top-ranked:%',
  ];
  // Each pattern must use only `[ A-Za-z0-9_/|:%-]` characters — no
  // backslashes, no quotes, no nested wildcards from arbitrary input.
  for (const p of BUST_PATTERNS) {
    if (!/^[\sA-Za-z0-9_/|:%-]+$/.test(p)) {
      throw new Error(`refresh/global: unsafe bust pattern: ${p}`);
    }
  }
  const bust = db.prepare(
    'DELETE FROM vndb_cache WHERE ' +
    BUST_PATTERNS.map(() => 'cache_key LIKE ?').join(' OR '),
  );
  // Wipe the materialised per-release metadata too. The shelf
  // popover / owned-editions surfaces read from `release_meta_cache`
  // (not the raw `POST /release` JSON), so without this step the
  // global refresh would re-fetch every release payload AND the
  // surfaces would keep rendering the stale platforms / languages
  // until the per-VN `materializeReleaseMetaForVn` ran. We bust
  // here and re-materialize per-VN below.
  const bustReleaseMeta = db.prepare('DELETE FROM release_meta_cache');
  // VN ids in the collection — every one gets its own materialize
  // job so the operator can see progress per-VN in the global
  // download status panel. Restricted to real `vNNN` ids; synthetic
  // `egs_*` entries are no-ops inside the materializer.
  const collectionVnIds = (
    db.prepare(
      `SELECT vn_id FROM collection WHERE vn_id LIKE 'v%'
       ORDER BY vn_id`,
    ).all() as Array<{ vn_id: string }>
  )
    .map((r) => r.vn_id)
    .filter((id) => isVndbVnId(id));
  // Each task has a stable `name` plus the existing run() closure.
  const tasks: Array<{ name: string; run: () => Promise<unknown> }> = [
    { name: 'Cache rows (bust)', run: async () => { bust.run(...BUST_PATTERNS); } },
    {
      name: 'Release metadata cache (bust)',
      run: async () => { bustReleaseMeta.run(); },
    },
    { name: 'EGS anticipated (top 100)', run: () => fetchEgsAnticipated(100) },
    { name: 'EGS top-ranked (top 100)',  run: () => fetchEgsTopRanked(100) },
    { name: 'VNDB top-ranked (top 100)', run: () => fetchVndbTopRanked(100) },
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
    {
      name: 'Release metadata · all collection VNs',
      run: async () => { materializeReleaseMetaForCollectionVns(collectionVnIds); },
    },
  ];

  // Tagged `cache-refresh` (not `vndb-pull`) because this fan-out also
  // refreshes EGS / page-level caches — calling it a "VNDB Pull" was
  // confusing on /upcoming?tab=anticipated, where the user only sees EGS
  // data being updated.
  const job = startJob('cache-refresh', 'Global refresh', tasks.length, null);

  let done = 0;
  let failed = 0;
  for (const t of tasks) {
    setJobCurrent(job.id, t.name);
    try {
      await t.run();
      done++;
    } catch (e) {
      failed++;
      recordError(job.id, t.name, sanitizeUnknownError(e));
    } finally {
      tickJob(job.id);
    }
  }
  finishJob(job.id);
  recordActivity({
    kind: 'refresh.global',
    entity: 'cache',
    entityId: 'global',
    label: 'Global refresh',
    payload: { done, failed, total: tasks.length },
  });

  return NextResponse.json({ ok: true, done, failed, total: tasks.length });
}
