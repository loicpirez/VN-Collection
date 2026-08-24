import 'server-only';
import { getCharacter, type VndbCharacter } from './vndb';
import { finishJob, jobLabel, recordError, setJobCurrent, startJob, tickJob } from './download-status';
import { parseJsonRecord } from './json-shape';
import { decodeVndbCharacter } from './vndb-character-row-shape';
import { getAppSettingRepository } from './db/repositories/app-setting';
import { getCacheRepository, type CacheRow } from './db/repositories/cache';
import { getPeopleRepository } from './db/repositories/people';

async function fanoutEnabled(): Promise<boolean> {
  return await getAppSettingRepository().get('vndb_fanout') !== '0';
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
 * Decode one stored character full-cache payload.
 *
 * @param raw Stored JSON text.
 * @param fetchedAt Cache-row freshness timestamp.
 * @returns A structurally usable payload, or `null` for malformed input.
 */
export function decodeCharacterFullPayload(raw: string | null | undefined, fetchedAt: number): CharacterFullPayload | null {
  const parsed = parseJsonRecord(raw);
  if (!parsed || !('profile' in parsed)) return null;
  if (parsed.profile === null) return { profile: null, fetched_at: fetchedAt };
  const profile = decodeVndbCharacter(parsed.profile);
  return profile ? { profile, fetched_at: fetchedAt } : null;
}

/**
 * `null` on missing / unparseable rows so callers can decide between a cache
 * miss and an upstream re-fetch.
 */
function decodeCharacterCacheRow(row: Pick<CacheRow, 'body' | 'fetched_at'> | null): CharacterFullPayload | null {
  if (!row) return null;
  return decodeCharacterFullPayload(row.body, row.fetched_at);
}

export async function readCharacterFullCache(cid: string): Promise<CharacterFullPayload | null> {
  return decodeCharacterCacheRow(await getCacheRepository().get(key(cid)));
}

async function writeCharacterFullCache(cid: string, payload: CharacterFullPayload): Promise<void> {
  const now = Date.now();
  await getPeopleRepository().persistCharacterFullCache({
    characterId: cid,
    body: JSON.stringify(payload),
    fetchedAt: now,
    expiresAt: now + TTL_MS,
    vnIds: (payload.profile?.vns ?? []).map((vn) => vn.id),
  });
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
  await writeCharacterFullCache(cid, payload);
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
  if (!opts.force && !await fanoutEnabled()) return { scanned: 0, downloaded: 0 };
  const cids = (await getPeopleRepository().voiceCharacterIdsForVn(vnId))
    .filter((characterId) => /^c\d+$/i.test(characterId));

  const now = Date.now();
  const cacheRows = await getCacheRepository().getMany(cids.map(key));
  const stale = cids.filter((cid) => {
    const cached = decodeCharacterCacheRow(cacheRows.get(key(cid)) ?? null);
    return !cached || now - cached.fetched_at > CACHE_FRESH_MS;
  });

  if (stale.length === 0) return { scanned: cids.length, downloaded: 0 };
  const job = startJob('characters', jobLabel('characters_for_vn', `Characters for ${vnId}`, { vnId }), stale.length, vnId);

  let downloaded = 0;
  for (const cid of stale) {
    setJobCurrent(job.id, cid);
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
