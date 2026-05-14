import 'server-only';
import { db, getAppSetting, upsertVn } from './db';
import { getVn } from './vndb';
import { finishJob, recordError, startJob, tickJob } from './download-status';

const CACHE_FRESH_MS = 30 * 24 * 3600 * 1000;

function fanoutEnabled(): boolean {
  return getAppSetting('vndb_fanout') !== '0';
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
  if (!opts.force && !fanoutEnabled()) return { scanned: 0, downloaded: 0 };
  const row = db
    .prepare('SELECT raw FROM vn WHERE id = ?')
    .get(vnId) as { raw: string | null } | undefined;
  if (!row?.raw) return { scanned: 0, downloaded: 0 };
  let parsed: { relations?: { id: string }[] };
  try {
    parsed = JSON.parse(row.raw) as { relations?: { id: string }[] };
  } catch {
    return { scanned: 0, downloaded: 0 };
  }
  const rels = (parsed.relations ?? []).filter((r) => /^v\d+$/i.test(r?.id ?? ''));
  if (rels.length === 0) return { scanned: 0, downloaded: 0 };

  const now = Date.now();
  const stale = rels.filter((r) => {
    const cached = db
      .prepare('SELECT fetched_at FROM vn WHERE id = ?')
      .get(r.id) as { fetched_at: number } | undefined;
    return !cached || now - cached.fetched_at > CACHE_FRESH_MS;
  });
  if (stale.length === 0) return { scanned: rels.length, downloaded: 0 };

  const job = startJob('vndb-pull', `Relations for ${vnId}`, stale.length, vnId);
  let downloaded = 0;
  for (const r of stale) {
    try {
      const fresh = await getVn(r.id);
      if (fresh) {
        upsertVn(fresh);
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
