import 'server-only';
import { db, getAppSetting } from './db';
import { getCharacter, type VndbCharacter } from './vndb';
import { finishJob, recordError, setJobCurrent, startJob, tickJob } from './download-status';

function fanoutEnabled(): boolean {
  return getAppSetting('vndb_fanout') !== '0';
}

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

/**
 * Read a previously-cached full-character payload from `vndb_cache`. Returns
 * `null` on missing / unparseable rows so callers can decide between a cache
 * miss and an upstream re-fetch.
 */
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
  const txn = db.transaction(() => {
    db.prepare(`
      INSERT INTO vndb_cache (cache_key, body, etag, last_modified, fetched_at, expires_at)
      VALUES (?, ?, NULL, NULL, ?, ?)
      ON CONFLICT(cache_key) DO UPDATE SET
        body = excluded.body,
        fetched_at = excluded.fetched_at,
        expires_at = excluded.expires_at
    `).run(key(cid), JSON.stringify(payload), now, now + TTL_MS);
    db.prepare('DELETE FROM character_vn_index WHERE character_id = ?').run(cid);
    const vnIds = new Set<string>();
    for (const v of payload.profile?.vns ?? []) {
      if (v.id) vnIds.add(v.id);
    }
    const ins = db.prepare('INSERT OR IGNORE INTO character_vn_index (character_id, vn_id) VALUES (?, ?)');
    for (const vn of vnIds) ins.run(cid, vn);
  });
  txn();
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
export async function downloadFullCharForVn(vnId: string, opts: { force?: boolean } = {}): Promise<{ scanned: number; downloaded: number }> {
  if (!opts.force && !fanoutEnabled()) return { scanned: 0, downloaded: 0 };
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

  // Pre-load character names from local cache so the progress bar shows
  // "Character - サンプル (c95001)" instead of just "c95001".
  // Chunked at 500 placeholders to stay under SQLITE_MAX_VARIABLE_NUMBER.
  const nameMap = new Map<string, string>();
  if (stale.length > 0) {
    const CHUNK = 500;
    for (let i = 0; i < stale.length; i += CHUNK) {
      const chunk = stale.slice(i, i + CHUNK);
      const placeholders = chunk.map(() => '?').join(',');
      const nameRows = db
        .prepare(`SELECT DISTINCT c_id, c_name FROM vn_va_credit WHERE c_id IN (${placeholders}) AND c_name IS NOT NULL`)
        .all(...chunk) as { c_id: string; c_name: string }[];
      for (const r of nameRows) {
        if (!nameMap.has(r.c_id) && r.c_name && r.c_name.length >= 2) nameMap.set(r.c_id, r.c_name);
      }
    }
  }

  let downloaded = 0;
  for (const cid of stale) {
    // Show which character is in flight so the user can correlate
    // progress with the per-character VNDB calls. Label with name when
    // available so the operator sees "Character - <name>" instead of
    // a bare id.
    const name = nameMap.get(cid);
    setJobCurrent(job.id, name ? `Character — ${name} (${cid})` : `Character — ${cid}`);
    try {
      await downloadFullCharacterInfo(cid);
      downloaded += 1;
    } catch (e) {
      recordError(job.id, cid, (e as Error).message);
    } finally {
      tickJob(job.id);
    }
  }
  finishJob(job.id);
  return { scanned: cids.length, downloaded };
}
