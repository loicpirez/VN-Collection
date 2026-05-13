import 'server-only';
import { db, getAppSetting } from './db';
import { fetchProducerCompletion } from './producer-completion';
import { finishJob, recordError, startJob, tickJob } from './download-status';

function fanoutEnabled(): boolean {
  return getAppSetting('vndb_fanout') !== '0';
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
export async function downloadFullProducerForVn(vnId: string): Promise<{ scanned: number; downloaded: number }> {
  if (!fanoutEnabled()) return { scanned: 0, downloaded: 0 };
  const row = db
    .prepare('SELECT developers FROM vn WHERE id = ?')
    .get(vnId) as { developers: string | null } | undefined;
  if (!row?.developers) return { scanned: 0, downloaded: 0 };

  let devs: Array<{ id?: string }> = [];
  try {
    devs = JSON.parse(row.developers) as Array<{ id?: string }>;
  } catch {
    return { scanned: 0, downloaded: 0 };
  }
  const pids = Array.from(
    new Set(devs.map((d) => d.id).filter((id): id is string => !!id && /^p\d+$/i.test(id))),
  );

  if (pids.length === 0) return { scanned: 0, downloaded: 0 };
  const job = startJob('producers', `Developers for ${vnId}`, pids.length, vnId);

  let downloaded = 0;
  for (const pid of pids) {
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
  return { scanned: pids.length, downloaded };
}
