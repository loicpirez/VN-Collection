import 'server-only';
import { fetchProducerCompletion } from './producer-completion';
import { finishJob, jobLabel, recordError, setJobCurrent, startJob, tickJob } from './download-status';
import { getAppSettingRepository } from './db/repositories/app-setting';
import { getProducerRepository } from './db/repositories/producer';

const CACHE_FRESH_MS = 30 * 24 * 3600 * 1000;

async function fanoutEnabled(): Promise<boolean> {
  return await getAppSettingRepository().get('vndb_fanout') !== '0';
}

/**
 * When a VN is downloaded, fan out to every developer credited on it and
 * pre-warm their full VN list cache via `fetchProducerCompletion`. The
 * underlying call is cachedFetch-backed so subsequent visits to
 * /producer/[id] render instantly with the completion %, the missing-VNs
 * list, and the +N catalogue without an extra network round trip.
 *
 * Fire-and-forget from `upsertVn` paths. 4-way concurrency cap matches the
 * staff + character fan-outs.
 */
export async function downloadFullProducerForVn(vnId: string, opts: { force?: boolean } = {}): Promise<{ scanned: number; downloaded: number }> {
  if (!opts.force && !await fanoutEnabled()) return { scanned: 0, downloaded: 0 };
  const repository = getProducerRepository();
  const pids = await repository.developerIdsForVn(vnId);

  if (pids.length === 0) return { scanned: 0, downloaded: 0 };
  const now = Date.now();
  const fetchedAt = opts.force ? new Map<string, number>() : await repository.fetchedAt(pids);
  const stale = opts.force
    ? pids
    : pids.filter((pid) => now - (fetchedAt.get(pid) ?? 0) > CACHE_FRESH_MS);
  if (stale.length === 0) return { scanned: pids.length, downloaded: 0 };

  const job = startJob('producers', jobLabel('developers_for_vn', `Developers for ${vnId}`, { vnId }), stale.length, vnId);

  let downloaded = 0;
  for (const pid of stale) {
    setJobCurrent(job.id, pid);
    try {
      await fetchProducerCompletion(pid);
      downloaded += 1;
    } catch (e) {
      recordError(job.id, pid, (e as Error).message);
    } finally {
      tickJob(job.id);
    }
  }
  finishJob(job.id);
  return { scanned: stale.length, downloaded };
}
