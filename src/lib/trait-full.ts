import 'server-only';
import { getTrait, type VndbTrait } from './vndb';
import { finishJob, jobLabel, recordError, startJob, tickJob } from './download-status';
import { parseJsonRecord } from './json-shape';
import { decodeCharacterFullPayload } from './character-full';
import { decodeVndbTrait } from './vndb-profile-row-shape';
import { getAppSettingRepository } from './db/repositories/app-setting';
import { getCacheRepository, type CacheRow } from './db/repositories/cache';
import { getPeopleRepository } from './db/repositories/people';

const CACHE_FRESH_MS = 30 * 24 * 3600 * 1000;
const KEY_PREFIX = 'trait_full:';
const TTL_MS = 30 * 24 * 3600 * 1000;

async function fanoutEnabled(): Promise<boolean> {
  return await getAppSettingRepository().get('vndb_fanout') !== '0';
}

function key(iid: string): string {
  return `${KEY_PREFIX}${iid.toLowerCase()}`;
}

export interface TraitFullPayload {
  trait: VndbTrait;
  fetched_at: number;
}

/**
 * Read the cached full-trait payload, or `null` on miss / parse error.
 * Lets trait tooltips and the /trait page render from cache before any
 * live VNDB fetch.
 */
function decodeTraitCacheRow(row: Pick<CacheRow, 'body' | 'fetched_at'> | null): TraitFullPayload | null {
  if (!row) return null;
  const parsed = parseJsonRecord(row.body);
  const trait = decodeVndbTrait(parsed?.trait);
  return trait ? { trait, fetched_at: row.fetched_at } : null;
}

export async function readTraitFullCache(iid: string): Promise<TraitFullPayload | null> {
  return decodeTraitCacheRow(await getCacheRepository().get(key(iid)));
}

async function writeTraitFullCache(iid: string, payload: TraitFullPayload): Promise<void> {
  const now = Date.now();
  await getCacheRepository().put({
    cache_key: key(iid),
    body: JSON.stringify(payload),
    etag: null,
    last_modified: null,
    fetched_at: now,
    expires_at: now + TTL_MS,
  });
}

/**
 * Fetch one trait with the full `VndbTrait` payload and persist it in
 * the cache. Returns `null` when VNDB doesn't recognise the id.
 */
export async function downloadFullTraitInfo(iid: string): Promise<TraitFullPayload | null> {
  const trait = await getTrait(iid);
  if (!trait) return null;
  const payload: TraitFullPayload = { trait, fetched_at: Date.now() };
  await writeTraitFullCache(iid, payload);
  return payload;
}

/**
 * For every trait used by characters of the given VN, cache the full trait
 * record (description, aliases, char_count, sexual, group, etc.).
 */
export async function downloadFullTraitsForVn(vnId: string, opts: { force?: boolean } = {}): Promise<{ scanned: number; downloaded: number }> {
  if (!opts.force && !await fanoutEnabled()) return { scanned: 0, downloaded: 0 };
  const characterIds = await getPeopleRepository().characterIdsForVn(vnId);
  const ids = new Set<string>();
  if (characterIds.length > 0) {
    const characterKeys = characterIds.map((characterId) => `char_full:${characterId.toLowerCase()}`);
    const rows = await getCacheRepository().getMany(characterKeys);
    for (const row of rows.values()) {
      const parsed = decodeCharacterFullPayload(row.body, row.fetched_at);
      for (const value of parsed?.profile?.traits ?? []) {
        ids.add(value.id);
      }
    }
  }
  if (ids.size === 0) return { scanned: 0, downloaded: 0 };

  const now = Date.now();
  const cacheRows = await getCacheRepository().getMany(Array.from(ids, key));
  const stale = Array.from(ids).filter((iid) => {
    const cached = decodeTraitCacheRow(cacheRows.get(key(iid)) ?? null);
    return !cached || now - cached.fetched_at > CACHE_FRESH_MS;
  });
  if (stale.length === 0) return { scanned: ids.size, downloaded: 0 };

  const job = startJob('vn-fetch', jobLabel('traits_for_vn', `Traits for ${vnId}`, { vnId }), stale.length, vnId);
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
