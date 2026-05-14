import 'server-only';
import { db, getAppSetting } from './db';
import { getTrait, type VndbTrait } from './vndb';
import { finishJob, recordError, startJob, tickJob } from './download-status';

const CACHE_FRESH_MS = 30 * 24 * 3600 * 1000;
const KEY_PREFIX = 'trait_full:';
const TTL_MS = 30 * 24 * 3600 * 1000;

function fanoutEnabled(): boolean {
  return getAppSetting('vndb_fanout') !== '0';
}

function key(iid: string): string {
  return `${KEY_PREFIX}${iid.toLowerCase()}`;
}

export interface TraitFullPayload {
  trait: VndbTrait;
  fetched_at: number;
}

export function readTraitFullCache(iid: string): TraitFullPayload | null {
  const row = db
    .prepare('SELECT body, fetched_at FROM vndb_cache WHERE cache_key = ?')
    .get(key(iid)) as { body: string; fetched_at: number } | undefined;
  if (!row) return null;
  try {
    const parsed = JSON.parse(row.body) as TraitFullPayload;
    return { ...parsed, fetched_at: row.fetched_at };
  } catch {
    return null;
  }
}

function writeTraitFullCache(iid: string, payload: TraitFullPayload): void {
  const now = Date.now();
  db.prepare(`
    INSERT INTO vndb_cache (cache_key, body, etag, last_modified, fetched_at, expires_at)
    VALUES (?, ?, NULL, NULL, ?, ?)
    ON CONFLICT(cache_key) DO UPDATE SET
      body = excluded.body,
      fetched_at = excluded.fetched_at,
      expires_at = excluded.expires_at
  `).run(key(iid), JSON.stringify(payload), now, now + TTL_MS);
}

export async function downloadFullTraitInfo(iid: string): Promise<TraitFullPayload | null> {
  const trait = await getTrait(iid);
  if (!trait) return null;
  const payload: TraitFullPayload = { trait, fetched_at: Date.now() };
  writeTraitFullCache(iid, payload);
  return payload;
}

/**
 * For every trait used by characters of the given VN, cache the full trait
 * record (description, aliases, char_count, sexual, group, etc.).
 */
export async function downloadFullTraitsForVn(vnId: string, opts: { force?: boolean } = {}): Promise<{ scanned: number; downloaded: number }> {
  if (!opts.force && !fanoutEnabled()) return { scanned: 0, downloaded: 0 };
  const rows = db
    .prepare(`SELECT body FROM vndb_cache WHERE cache_key LIKE 'character_full:%' AND body LIKE ?`)
    .all(`%${vnId}%`) as { body: string }[];
  const ids = new Set<string>();
  for (const r of rows) {
    try {
      const parsed = JSON.parse(r.body) as { character?: { traits?: { id: string }[] } };
      for (const t of parsed.character?.traits ?? []) {
        if (/^i\d+$/i.test(t.id)) ids.add(t.id);
      }
    } catch {
      continue;
    }
  }
  if (ids.size === 0) return { scanned: 0, downloaded: 0 };

  const now = Date.now();
  const stale = Array.from(ids).filter((iid) => {
    const cached = readTraitFullCache(iid);
    return !cached || now - cached.fetched_at > CACHE_FRESH_MS;
  });
  if (stale.length === 0) return { scanned: ids.size, downloaded: 0 };

  const job = startJob('vn-fetch', `Traits for ${vnId}`, stale.length, vnId);
  let downloaded = 0;
  for (const iid of stale) {
    try {
      await downloadFullTraitInfo(iid);
      downloaded += 1;
    } catch (e) {
      recordError(job.id, iid, (e as Error).message);
    } finally {
      tickJob(job.id);
    }
  }
  finishJob(job.id);
  return { scanned: ids.size, downloaded };
}
