import 'server-only';
import { getTag, type VndbTag } from './vndb';
import { finishJob, jobLabel, recordError, startJob, tickJob } from './download-status';
import { parseJsonRecord } from './json-shape';
import { decodeVndbTag } from './vndb-profile-row-shape';
import { getAppSettingRepository } from './db/repositories/app-setting';
import { getCacheRepository, type CacheRow } from './db/repositories/cache';
import { getVnReadRepository } from './db/repositories/vn-read';

const CACHE_FRESH_MS = 30 * 24 * 3600 * 1000;
const KEY_PREFIX = 'tag_full:';
const TTL_MS = 30 * 24 * 3600 * 1000;

async function fanoutEnabled(): Promise<boolean> {
  return await getAppSettingRepository().get('vndb_fanout') !== '0';
}

function key(gid: string): string {
  return `${KEY_PREFIX}${gid.toLowerCase()}`;
}

export interface TagFullPayload {
  tag: VndbTag;
  fetched_at: number;
}

/**
 * Read the cached full-tag payload, or `null` on miss / parse error.
 * Lets the tag tooltip render instantly from cache before any live fetch.
 */
function decodeTagCacheRow(row: Pick<CacheRow, 'body' | 'fetched_at'> | null): TagFullPayload | null {
  if (!row) return null;
  const parsed = parseJsonRecord(row.body);
  const tag = decodeVndbTag(parsed?.tag);
  return tag ? { tag, fetched_at: row.fetched_at } : null;
}

export async function readTagFullCache(gid: string): Promise<TagFullPayload | null> {
  return decodeTagCacheRow(await getCacheRepository().get(key(gid)));
}

async function writeTagFullCache(gid: string, payload: TagFullPayload): Promise<void> {
  const now = Date.now();
  await getCacheRepository().put({
    cache_key: key(gid),
    body: JSON.stringify(payload),
    etag: null,
    last_modified: null,
    fetched_at: now,
    expires_at: now + TTL_MS,
  });
}

/**
 * Fetch one tag with the full `VndbTag` payload and persist it in the
 * cache. Returns `null` when VNDB doesn't recognise the id.
 */
export async function downloadFullTagInfo(gid: string): Promise<TagFullPayload | null> {
  const tag = await getTag(gid);
  if (!tag) return null;
  const payload: TagFullPayload = { tag, fetched_at: Date.now() };
  await writeTagFullCache(gid, payload);
  return payload;
}

/**
 * For every tag referenced by the given VN, cache the full tag record
 * (description, aliases, vn_count, etc.) so the /tags/[id] and tag chip
 * tooltips can show every documented field without an extra round-trip.
 */
export async function downloadFullTagsForVn(vnId: string, opts: { force?: boolean } = {}): Promise<{ scanned: number; downloaded: number }> {
  if (!opts.force && !await fanoutEnabled()) return { scanned: 0, downloaded: 0 };
  const ids = await getVnReadRepository().getTagIds(vnId);
  const now = Date.now();
  const cacheRows = await getCacheRepository().getMany(ids.map(key));
  const stale = ids.filter((gid) => {
    const cached = decodeTagCacheRow(cacheRows.get(key(gid)) ?? null);
    return !cached || now - cached.fetched_at > CACHE_FRESH_MS;
  });
  if (stale.length === 0) return { scanned: ids.length, downloaded: 0 };

  const job = startJob('vn-fetch', jobLabel('tags_for_vn', `Tags for ${vnId}`, { vnId }), stale.length, vnId);
  let downloaded = 0;
  for (const gid of stale) {
    try {
      await downloadFullTagInfo(gid);
      downloaded += 1;
    } catch (e) {
      recordError(job.id, gid, (e as Error).message);
    } finally {
      tickJob(job.id);
    }
  }
  finishJob(job.id);
  return { scanned: ids.length, downloaded };
}
