import 'server-only';
import { getVn } from './vndb';
import { finishJob, jobLabel, recordError, setJobCurrent, startJob, tickJob } from './download-status';
import { asJsonRecord, parseJsonRecord } from './json-shape';

import { isVndbVnId } from '@/lib/vn-id-shape';
import { getAppSettingRepository } from './db/repositories/app-setting';
import { getVnReadRepository } from './db/repositories/vn-read';
import { getVnWriteRepository } from './db/repositories/vn-write';
const CACHE_FRESH_MS = 30 * 24 * 3600 * 1000;

async function fanoutEnabled(): Promise<boolean> {
  return await getAppSettingRepository().get('vndb_fanout') !== '0';
}

/**
 * One-hop relations fan-out: for every VN id referenced by `vn.relations`,
 * pull the full VN payload (every documented field) and persist it locally.
 * Stops at depth 1 — the user navigates from a related VN's page to its
 * own relations to recurse further. This avoids the combinatorial blow-up
 * the API itself protects against with "Too much data selected".
 */
export async function downloadFullRelationsForVn(
  vnId: string,
  opts: { force?: boolean } = {},
): Promise<{ scanned: number; downloaded: number }> {
  if (!opts.force && !await fanoutEnabled()) return { scanned: 0, downloaded: 0 };
  const reader = getVnReadRepository();
  const raw = await reader.getRawPayload(vnId);
  if (!raw) return { scanned: 0, downloaded: 0 };
  const parsed = parseJsonRecord(raw);
  const rels = (Array.isArray(parsed?.relations) ? parsed.relations : [])
    .map((value) => asJsonRecord(value))
    .filter((relation): relation is Record<string, unknown> => relation !== null)
    .map((relation) => relation.id)
    .filter((id): id is string => typeof id === 'string' && isVndbVnId(id))
    .map((id) => ({ id }));
  if (rels.length === 0) return { scanned: 0, downloaded: 0 };

  const now = Date.now();
  const fetchedAt = await reader.getFetchedAtMany(rels.map((relation) => relation.id));
  const stale = rels.filter((r) => {
    const cachedAt = fetchedAt.get(r.id);
    return cachedAt === undefined || now - cachedAt > CACHE_FRESH_MS;
  });
  if (stale.length === 0) return { scanned: rels.length, downloaded: 0 };

  const job = startJob('vndb-pull', jobLabel('relations_for_vn', `Relations for ${vnId}`, { vnId }), stale.length, vnId);
  let downloaded = 0;
  for (const r of stale) {
    setJobCurrent(job.id, r.id);
    try {
      const fresh = await getVn(r.id);
      if (fresh) {
        await getVnWriteRepository().upsert(fresh);
        downloaded += 1;
      }
    } catch (e) {
      recordError(job.id, r.id, (e as Error).message);
    } finally {
      tickJob(job.id);
    }
  }
  finishJob(job.id);
  return { scanned: rels.length, downloaded };
}
