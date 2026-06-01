import 'server-only';
import { db, getAppSetting } from './db';
import { getTag, type VndbTag } from './vndb';
import { finishJob, jobLabel, recordError, startJob, tickJob } from './download-status';
import { asJsonRecord, parseJsonArray, parseJsonRecord } from './json-shape';
import { decodeVndbTag } from './vndb-profile-row-shape';

const CACHE_FRESH_MS = 30 * 24 * 3600 * 1000;
const KEY_PREFIX = 'tag_full:';
const TTL_MS = 30 * 24 * 3600 * 1000;

function fanoutEnabled(): boolean {
  return getAppSetting('vndb_fanout') !== '0';
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
export function readTagFullCache(gid: string): TagFullPayload | null {
  const row = db
    .prepare('SELECT body, fetched_at FROM vndb_cache WHERE cache_key = ?')
    .get(key(gid)) as { body: string; fetched_at: number } | undefined;
  if (!row) return null;
  const parsed = parseJsonRecord(row.body);
  const tag = decodeVndbTag(parsed?.tag);
  return tag ? { tag, fetched_at: row.fetched_at } : null;
}

function writeTagFullCache(gid: string, payload: TagFullPayload): void {
  const now = Date.now();
  db.prepare(`
    INSERT INTO vndb_cache (cache_key, body, etag, last_modified, fetched_at, expires_at)
    VALUES (?, ?, NULL, NULL, ?, ?)
    ON CONFLICT(cache_key) DO UPDATE SET
      body = excluded.body,
      fetched_at = excluded.fetched_at,
      expires_at = excluded.expires_at
  `).run(key(gid), JSON.stringify(payload), now, now + TTL_MS);
}

/**
 * Fetch one tag with the full `VndbTag` payload and persist it in the
 * cache. Returns `null` when VNDB doesn't recognise the id.
 */
export async function downloadFullTagInfo(gid: string): Promise<TagFullPayload | null> {
  const tag = await getTag(gid);
  if (!tag) return null;
  const payload: TagFullPayload = { tag, fetched_at: Date.now() };
  writeTagFullCache(gid, payload);
  return payload;
}

/**
 * For every tag referenced by the given VN, cache the full tag record
 * (description, aliases, vn_count, etc.) so the /tags/[id] and tag chip
 * tooltips can show every documented field without an extra round-trip.
 */
export async function downloadFullTagsForVn(vnId: string, opts: { force?: boolean } = {}): Promise<{ scanned: number; downloaded: number }> {
  if (!opts.force && !fanoutEnabled()) return { scanned: 0, downloaded: 0 };
  const row = db.prepare('SELECT tags FROM vn WHERE id = ?').get(vnId) as { tags: string | null } | undefined;
  if (!row?.tags) return { scanned: 0, downloaded: 0 };
  const ids = Array.from(new Set(
    parseJsonArray(row.tags)
      .map((value) => asJsonRecord(value)?.id)
      .filter((id): id is string => typeof id === 'string' && /^g\d+$/i.test(id)),
  ));
  const now = Date.now();
  const stale = ids.filter((gid) => {
    const cached = readTagFullCache(gid);
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
