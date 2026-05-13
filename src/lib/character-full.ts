import 'server-only';
import { db } from './db';
import { getCharacter, type VndbCharacter } from './vndb';
import { finishJob, recordError, startJob, tickJob } from './download-status';

const CACHE_FRESH_MS = 30 * 24 * 3600 * 1000;
const KEY_PREFIX = 'char_full:';
const TTL_MS = 30 * 24 * 3600 * 1000;

/**
 * Local cache of every character VNDB knows about + the voice cast across
 * each of their VN appearances. Lets the /character/[id] page render the
 * full "Also voiced by" panel without scanning every owned VN's
 * vn_va_credit row, and means visiting a character we haven't seen before
 * doesn't trigger a fresh network call when the encompassing VN already
 * fanned-out the character data.
 */

export interface CharacterFullPayload {
  profile: VndbCharacter | null;
  fetched_at: number;
}

function key(cid: string): string {
  return `${KEY_PREFIX}${cid.toLowerCase()}`;
}

export function readCharacterFullCache(cid: string): CharacterFullPayload | null {
  const row = db
    .prepare('SELECT body, fetched_at FROM vndb_cache WHERE cache_key = ?')
    .get(key(cid)) as { body: string; fetched_at: number } | undefined;
  if (!row) return null;
  try {
    const parsed = JSON.parse(row.body) as CharacterFullPayload;
    return { ...parsed, fetched_at: row.fetched_at };
  } catch {
    return null;
  }
}

function writeCharacterFullCache(cid: string, payload: CharacterFullPayload): void {
  const now = Date.now();
  db.prepare(`
    INSERT INTO vndb_cache (cache_key, body, etag, last_modified, fetched_at, expires_at)
    VALUES (?, ?, NULL, NULL, ?, ?)
    ON CONFLICT(cache_key) DO UPDATE SET
      body = excluded.body,
      fetched_at = excluded.fetched_at,
      expires_at = excluded.expires_at
  `).run(key(cid), JSON.stringify(payload), now, now + TTL_MS);
}

/**
 * Pull the character profile from VNDB and cache locally. Same payload
 * shape as getCharacter() — the cache exists to pre-warm /character/[id]
 * after a VN download so the page paints instantly on first visit.
 */
export async function downloadFullCharacterInfo(cid: string): Promise<CharacterFullPayload> {
  const profile = await getCharacter(cid);
  const payload: CharacterFullPayload = {
    profile,
    fetched_at: Date.now(),
  };
  writeCharacterFullCache(cid, payload);
  return payload;
}

/**
 * Fan-out: for every character voice-credited on this VN (via vn_va_credit),
 * download their full profile if not cached within the freshness window.
 *
 * Fire-and-forget from `upsertVn` paths — capped at 4 concurrent fetches to
 * stay polite with VNDB. Non-voiced characters fall through (lazy-loaded
 * when the user actually opens their page).
 */
export async function downloadFullCharForVn(vnId: string): Promise<{ scanned: number; downloaded: number }> {
  const rows = db
    .prepare(`SELECT DISTINCT c_id FROM vn_va_credit WHERE vn_id = ?`)
    .all(vnId) as { c_id: string }[];
  const cids = Array.from(new Set(rows.map((r) => r.c_id).filter((c) => /^c\d+$/i.test(c))));

  const now = Date.now();
  const stale = cids.filter((cid) => {
    const cached = readCharacterFullCache(cid);
    return !cached || now - cached.fetched_at > CACHE_FRESH_MS;
  });

  if (stale.length === 0) return { scanned: cids.length, downloaded: 0 };
  const job = startJob('characters', `Characters for ${vnId}`, stale.length, vnId);

  const queue = [...stale];
  let downloaded = 0;
  const workers = Array.from({ length: Math.min(4, queue.length) }, async () => {
    while (queue.length > 0) {
      const cid = queue.shift();
      if (!cid) return;
      try {
        await downloadFullCharacterInfo(cid);
        downloaded += 1;
      } catch (e) {
        recordError(job.id, cid, (e as Error).message);
      } finally {
        tickJob(job.id);
      }
    }
  });
  await Promise.all(workers);
  finishJob(job.id);
  return { scanned: cids.length, downloaded };
}
