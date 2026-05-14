import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { startJob, tickJob, finishJob, recordError } from '@/lib/download-status';
import { fetchEgsAnticipated } from '@/lib/erogamescape';
import { getGlobalStats, getAuthInfo, getSchema } from '@/lib/vndb';
import { fetchAllUpcomingFromVndb, fetchUpcomingForCollection } from '@/lib/upcoming';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 300;

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
export async function POST() {
  const tasks: Array<{ name: string; run: () => Promise<unknown> }> = [
    {
      name: 'EGS cover cache (bust)',
      run: async () => {
        db.prepare("DELETE FROM vndb_cache WHERE cache_key LIKE 'egs:cover-resolved:%'").run();
      },
    },
    { name: 'EGS anticipated (top 100)', run: () => fetchEgsAnticipated(100) },
    { name: 'VNDB stats',                run: () => getGlobalStats() },
    { name: 'VNDB schema',                run: () => getSchema() },
    { name: 'VNDB authinfo',              run: async () => { try { return await getAuthInfo(); } catch { return null; } } },
    { name: 'Upcoming · collection',      run: () => fetchUpcomingForCollection() },
    { name: 'Upcoming · all VNDB (top 200)', run: () => fetchAllUpcomingFromVndb(200) },
  ];

  const job = startJob('vndb-pull', 'Global refresh', tasks.length, null);

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
