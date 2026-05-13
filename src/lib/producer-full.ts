import 'server-only';
import { db } from './db';
import { fetchProducerCompletion } from './producer-completion';

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

  const queue = [...pids];
  let downloaded = 0;
  const workers = Array.from({ length: Math.min(4, queue.length) }, async () => {
    while (queue.length > 0) {
      const pid = queue.shift();
      if (!pid) return;
      try {
        await fetchProducerCompletion(pid);
        downloaded += 1;
      } catch {
        // Skip individual failures — cachedFetch returns stale on next try
        // and the next VN download re-queues the producer.
      }
    }
  });
  await Promise.all(workers);
  return { scanned: pids.length, downloaded };
}
