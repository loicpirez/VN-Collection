import 'server-only';
import { getReleasesForVn, getRelease, type VndbRelease } from './vndb';
import { finishJob, jobLabel, recordError, startJob, tickJob } from './download-status';
import { asJsonRecord, parseJsonRecord } from './json-shape';
import { decodeVndbRelease } from './vndb-release-shape';
import { getAppSettingRepository } from './db/repositories/app-setting';
import { getCacheRepository, type CacheRow } from './db/repositories/cache';
import { getVnReadRepository } from './db/repositories/vn-read';

const CACHE_FRESH_MS = 30 * 24 * 3600 * 1000;
const KEY_PREFIX = 'release_full:';
const TTL_MS = 30 * 24 * 3600 * 1000;

async function fanoutEnabled(): Promise<boolean> {
  return await getAppSettingRepository().get('vndb_fanout') !== '0';
}

function key(rid: string): string {
  return `${KEY_PREFIX}${rid.toLowerCase()}`;
}

export interface ReleaseFullPayload {
  release: VndbRelease;
  fetched_at: number;
}

/**
 * `null` on missing / unparseable rows so callers fall back to a fresh fetch.
 */
function decodeReleaseCacheRow(row: Pick<CacheRow, 'body' | 'fetched_at'> | null): ReleaseFullPayload | null {
  if (!row) return null;
  const parsed = parseJsonRecord(row.body);
  const release = parsed ? decodeVndbRelease(parsed.release) : null;
  return release ? { release, fetched_at: row.fetched_at } : null;
}

export async function readReleaseFullCache(rid: string): Promise<ReleaseFullPayload | null> {
  return decodeReleaseCacheRow(await getCacheRepository().get(key(rid)));
}

async function writeReleaseFullCache(rid: string, payload: ReleaseFullPayload): Promise<void> {
  const now = Date.now();
  await getCacheRepository().put({
    cache_key: key(rid),
    body: JSON.stringify(payload),
    etag: null,
    last_modified: null,
    fetched_at: now,
    expires_at: now + TTL_MS,
  });
}

/**
 * Fetch one release with every documented field and cache locally.
 */
export async function downloadFullReleaseInfo(rid: string): Promise<ReleaseFullPayload | null> {
  const release = await getRelease(rid);
  if (!release) return null;
  const payload: ReleaseFullPayload = { release, fetched_at: Date.now() };
  await writeReleaseFullCache(rid, payload);
  return payload;
}

/**
 * Walk every `screenshots[].release.id` on a VN and persist the full
 * release record for each one. VNDB docs explicitly recommend selecting
 * `screenshots.release.id` on the parent VN query and fetching the rest
 * via a follow-up `/release` call — this is that follow-up call.
 */
export async function downloadScreenshotReleasesForVn(
  vnId: string,
  opts: { force?: boolean } = {},
): Promise<{ scanned: number; downloaded: number }> {
  if (!opts.force && !await fanoutEnabled()) return { scanned: 0, downloaded: 0 };
  const raw = await getVnReadRepository().getRawPayload(vnId);
  if (!raw) return { scanned: 0, downloaded: 0 };
  const parsed = parseJsonRecord(raw);
  const ids = Array.from(new Set(
    (Array.isArray(parsed?.screenshots) ? parsed.screenshots : [])
      .map((value) => asJsonRecord(asJsonRecord(value)?.release)?.id)
      .filter((id): id is string => typeof id === 'string' && /^r\d+$/i.test(id)),
  ));
  if (ids.length === 0) return { scanned: 0, downloaded: 0 };

  const now = Date.now();
  const cacheRows = await getCacheRepository().getMany(ids.map(key));
  const stale = ids.filter((rid) => {
    const cached = decodeReleaseCacheRow(cacheRows.get(key(rid)) ?? null);
    return !cached || now - cached.fetched_at > CACHE_FRESH_MS;
  });
  if (stale.length === 0) return { scanned: ids.length, downloaded: 0 };

  const job = startJob('vn-fetch', jobLabel('screenshot_releases_for_vn', `Screenshot releases for ${vnId}`, { vnId }), stale.length, vnId);
  let downloaded = 0;
  for (const rid of stale) {
    try {
      const payload = await downloadFullReleaseInfo(rid);
      if (payload) downloaded += 1;
    } catch (e) {
      recordError(job.id, rid, (e as Error).message);
    } finally {
      tickJob(job.id);
    }
  }
  finishJob(job.id);
  return { scanned: ids.length, downloaded };
}

/**
 * Pull every release linked to the given VN and cache each individually with
 * the full RELEASE_FIELDS payload. Mirrors the staff/character/producer
 * fan-out so "Download all" truly fans into releases too.
 */
export async function downloadFullReleasesForVn(vnId: string, opts: { force?: boolean } = {}): Promise<{ scanned: number; downloaded: number }> {
  if (!opts.force && !await fanoutEnabled()) return { scanned: 0, downloaded: 0 };
  let releases: VndbRelease[] = [];
  try {
    releases = await getReleasesForVn(vnId, 100);
  } catch {
    return { scanned: 0, downloaded: 0 };
  }
  if (releases.length === 0) return { scanned: 0, downloaded: 0 };

  const now = Date.now();
  const cacheRows = await getCacheRepository().getMany(releases.map((release) => key(release.id)));
  const stale = releases.filter((r) => {
    const cached = decodeReleaseCacheRow(cacheRows.get(key(r.id)) ?? null);
    return !cached || now - cached.fetched_at > CACHE_FRESH_MS;
  });
  if (stale.length === 0) return { scanned: releases.length, downloaded: 0 };

  const job = startJob('vn-fetch', jobLabel('releases_for_vn', `Releases for ${vnId}`, { vnId }), stale.length, vnId);
  let downloaded = 0;
  for (const r of stale) {
    const payload: ReleaseFullPayload = { release: r, fetched_at: now };
    await writeReleaseFullCache(r.id, payload);
    downloaded += 1;
    tickJob(job.id);
  }
  finishJob(job.id);
  return { scanned: releases.length, downloaded };
}
